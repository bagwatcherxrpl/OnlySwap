import { NextRequest, NextResponse } from "next/server";
import { assetEquals, parseAssetIdentifier } from "@/lib/assets/parser";
import { xrpToDrops } from "@/lib/fees/serviceFee";
import { checkRateLimit, requestIp } from "@/lib/security/rateLimit";
import { isQuoteExpired, prepareSwapSchema } from "@/lib/validation/swap";
import { withXrplClient } from "@/lib/xrpl/client";
import { buildQuote } from "@/lib/xrpl/quoteService";

function resolveSourceTag(): number | null {
  const raw = process.env.ONLYSWAP_SOURCE_TAG?.trim();
  if (!raw) return null;
  if (!/^\d+$/.test(raw)) return null;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 0xffff_ffff) return null;
  return parsed;
}

async function hasTrustline(
  account: string,
  currency: string,
  issuer: string,
): Promise<boolean> {
  return withXrplClient(async (client) => {
    let marker: unknown;

    do {
      const response = await client.request({
        command: "account_lines",
        account,
        peer: issuer,
        limit: 400,
        marker,
      });

      const lines = response.result.lines ?? [];
      const match = lines.some(
        (line) =>
          String(line.currency ?? "").trim().toUpperCase() === currency &&
          String(line.account ?? "").trim() === issuer,
      );
      if (match) return true;

      marker = response.result.marker;
    } while (marker);

    return false;
  });
}

export async function POST(req: NextRequest) {
  const ip = requestIp(req);
  const limit = checkRateLimit({
    key: `swap-prepare:${ip}`,
    limit: 40,
    windowMs: 60_000,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many prepare requests. Please wait and try again." },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      },
    );
  }

  try {
    const body = prepareSwapSchema.parse(await req.json());
    const from = parseAssetIdentifier(body.inputAsset);
    const to = parseAssetIdentifier(body.outputAsset);
    if (!from.ok || !to.ok) return NextResponse.json({ error: "Invalid assets." }, { status: 400 });
    if (assetEquals(from.asset, to.asset)) return NextResponse.json({ error: "Assets must be different." }, { status: 400 });
    if (body.quoteExpiresAt && isQuoteExpired(body.quoteExpiresAt)) {
      return NextResponse.json({ error: "Quote expired. Please review the updated quote." }, { status: 409 });
    }
    if (to.asset.kind === "issued") {
      const trustlineExists = await hasTrustline(body.account, to.asset.currency, to.asset.issuer);
      if (!trustlineExists) {
        return NextResponse.json(
          { error: "Missing trustline for target token. Please set the trustline in your wallet first." },
          { status: 409 },
        );
      }
    }

    const quote = await buildQuote({
      inputAsset: from.asset,
      outputAsset: to.asset,
      inputAmount: body.inputAmount,
    });
    const promoNoFee = body.walletId === "xaman" || body.walletId === "joey";
    const effectiveServiceFeeDrops = promoNoFee ? "0" : quote.serviceFeeDrops;
    const effectiveServiceFeeXrp = promoNoFee ? "0" : quote.serviceFeeXrp;
    const sourceTag = resolveSourceTag();
    if (sourceTag === null) {
      return NextResponse.json({ error: "Source tag is not configured." }, { status: 500 });
    }

    const treasury = process.env.ONLYSWAP_TREASURY_WALLET;
    if (!treasury && !promoNoFee) {
      return NextResponse.json({ error: "Treasury wallet is not configured." }, { status: 500 });
    }

    const txBundle: Array<{ kind: "serviceFee" | "swap"; tx: Record<string, unknown> }> = [];
    if (!promoNoFee) {
      txBundle.push({
        kind: "serviceFee",
        tx: {
          TransactionType: "Payment",
          Account: body.account,
          Destination: treasury,
          Amount: effectiveServiceFeeDrops,
          SourceTag: sourceTag,
          DestinationTag: 0,
        },
      });
    }
    txBundle.push({
      kind: "swap",
      tx: {
        TransactionType: "Payment",
        Account: body.account,
        Destination: body.account,
        Amount:
          to.asset.kind === "native"
            ? xrpToDrops(quote.estimatedOutput)
            : { currency: to.asset.currency, issuer: to.asset.issuer, value: quote.estimatedOutput },
        SendMax:
          from.asset.kind === "native"
            ? xrpToDrops(body.inputAmount)
            : { currency: from.asset.currency, issuer: from.asset.issuer, value: body.inputAmount },
        SourceTag: sourceTag,
        Flags: 131072,
      },
    });

    return NextResponse.json({
      quote: {
        ...quote,
        serviceFeeDrops: effectiveServiceFeeDrops,
        serviceFeeXrp: effectiveServiceFeeXrp,
      },
      txBundle,
    });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: "Could not prepare transactions." }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not prepare transactions." }, { status: 500 });
  }
}
