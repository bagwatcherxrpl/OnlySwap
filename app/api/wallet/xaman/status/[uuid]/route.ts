import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, requestIp } from "@/lib/security/rateLimit";
import { getXamanPayload } from "@/lib/xaman/api";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ uuid: string }> }) {
  try {
    const { uuid } = await params;
    if (!UUID_RE.test(uuid)) {
      return NextResponse.json({ error: "Invalid payload id." }, { status: 400 });
    }
    const ip = requestIp(_request);
    const limit = checkRateLimit({
      key: `xaman-status:${ip}`,
      limit: 120,
      windowMs: 60_000,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many status requests. Please wait and try again." },
        {
          status: 429,
          headers: { "Retry-After": String(limit.retryAfterSeconds) },
        },
      );
    }

    const payload = await getXamanPayload(uuid);

    return NextResponse.json({
      resolved: Boolean(payload.meta?.resolved),
      signed: Boolean(payload.meta?.signed ?? payload.response?.signed),
      account: payload.response?.account ?? null,
      txHash: payload.response?.txid ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read Xaman payload status.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
