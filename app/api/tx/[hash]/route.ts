import { NextResponse } from "next/server";
import { checkRateLimit, requestIp } from "@/lib/security/rateLimit";
import { withXrplClient } from "@/lib/xrpl/client";

const HASH_RE = /^[A-F0-9]{64}$/i;

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
