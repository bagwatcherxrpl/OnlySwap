import { NextRequest, NextResponse } from "next/server";
import { assetEquals } from "@/lib/assets/parser";
import { parseAssetIdentifier } from "@/lib/assets/parser";
import { checkRateLimit, requestIp } from "@/lib/security/rateLimit";
import { quoteRequestSchema } from "@/lib/validation/swap";
import { buildQuote } from "@/lib/xrpl/quoteService";

export async function POST(req: NextRequest) {
  const ip = requestIp(req);
  const limit = checkRateLimit({
    key: `quote:${ip}`,
    limit: 60,
    windowMs: 60_000,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many quote requests. Please wait and try again." },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      },
    );
  }

  try {
    const body = quoteRequestSchema.parse(await req.json());
    const from = parseAssetIdentifier(body.inputAsset);
    const to = parseAssetIdentifier(body.outputAsset);
    if (!from.ok || !to.ok) {
      return NextResponse.json({ error: "Invalid asset identifier." }, { status: 400 });
    }
    if (assetEquals(from.asset, to.asset)) {
      return NextResponse.json({ error: "Input and output assets must be different." }, { status: 400 });
    }

    const quote = await buildQuote({
      inputAsset: from.asset,
      outputAsset: to.asset,
      inputAmount: body.inputAmount,
    });
    return NextResponse.json(quote);
  } catch {
    return NextResponse.json({ error: "Unable to build quote." }, { status: 400 });
  }
}
