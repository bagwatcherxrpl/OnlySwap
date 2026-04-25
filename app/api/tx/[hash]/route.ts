import { NextResponse } from "next/server";
import { checkRateLimit, requestIp } from "@/lib/security/rateLimit";
import { publishTrade } from "@/lib/trades/subscriptions";
import { withXrplClient } from "@/lib/xrpl/client";

const HASH_RE = /^[A-F0-9]{64}$/i;

function dropsToXrp(drops: string): string {
  const normalized = drops.replace(/^0+/, "") || "0";
  const isSmall = normalized.length <= 6;
  if (isSmall) {
    const fraction = normalized.padStart(6, "0").replace(/0+$/, "");
    return fraction ? `0.${fraction}` : "0";
  }

  const whole = normalized.slice(0, -6);
  const fraction = normalized.slice(-6).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

function extractTradeSizeXrp(txResult: Record<string, unknown>): string | null {
  if (!Boolean(txResult.validated)) return null;
  const tx = txResult.tx_json;
  if (!tx || typeof tx !== "object") return null;

  const txType = Reflect.get(tx, "TransactionType");
  if (txType !== "Payment") return null;

  const account = Reflect.get(tx, "Account");
  const destination = Reflect.get(tx, "Destination");
  if (typeof account !== "string" || typeof destination !== "string" || account !== destination) return null;

  const configuredSourceTag = process.env.ONLYSWAP_SOURCE_TAG?.trim();
  const sourceTag = Reflect.get(tx, "SourceTag");
  if (configuredSourceTag && configuredSourceTag !== String(sourceTag ?? "")) return null;

  const sendMax = Reflect.get(tx, "SendMax");
  if (typeof sendMax !== "string" || !/^\d+$/.test(sendMax)) return null;
  return dropsToXrp(sendMax);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ hash: string }> },
) {
  const { hash } = await params;
  if (!hash || !HASH_RE.test(hash)) {
    return NextResponse.json({ found: false }, { status: 400 });
  }
  const ip = requestIp(request);
  const limit = checkRateLimit({
    key: `tx-status:${ip}`,
    limit: 120,
    windowMs: 60_000,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { found: false, error: "Too many requests." },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      },
    );
  }

  try {
    const tx = await withXrplClient((client) =>
      client.request({ command: "tx", transaction: hash, binary: false }),
    );
    const tradeSizeXrp = extractTradeSizeXrp(tx.result as Record<string, unknown>);
    if (tradeSizeXrp) {
      publishTrade({
        txHash: hash.toUpperCase(),
        tradeSizeXrp,
        timestamp: Date.now(),
      });
    }

    return NextResponse.json({
      found: true,
      validated: Boolean(tx.result.validated),
      hash,
      result: tx.result.meta,
    });
  } catch {
    return NextResponse.json({ found: false, validated: false, hash });
  }
}
