import { NextRequest, NextResponse } from "next/server";
import { isValidClassicAddress } from "xrpl";
import { z } from "zod";
import { checkRateLimit, requestIp } from "@/lib/security/rateLimit";
import { createXamanPayload } from "@/lib/xaman/api";

const currencySchema = z.string().trim().toUpperCase().regex(/^([A-Z]{3,6}|[A-F0-9]{40})$/);
const decimalValueSchema = z.string().trim().regex(/^\d+(\.\d+)?$/);
const accountSchema = z.string().trim().refine((v) => isValidClassicAddress(v), "Invalid XRPL account.");
const xrpDropsSchema = z.string().trim().regex(/^\d+$/);
const issuedAmountSchema = z
  .object({
    currency: currencySchema,
    issuer: accountSchema,
    value: decimalValueSchema,
  })
  .strict();
const amountSchema = z.union([xrpDropsSchema, issuedAmountSchema]);

const paymentTxSchema = z
  .object({
    TransactionType: z.literal("Payment"),
    Account: accountSchema,
    Destination: accountSchema,
    Amount: amountSchema,
    SendMax: amountSchema.optional(),
    DestinationTag: z.number().int().nonnegative().optional(),
    Flags: z.number().int().nonnegative().optional(),
  })
  .strict();

const trustSetTxSchema = z
  .object({
    TransactionType: z.literal("TrustSet"),
    Account: accountSchema,
    LimitAmount: issuedAmountSchema,
    Flags: z.number().int().nonnegative().optional(),
  })
  .strict();

const submitPayloadSchema = z
  .object({
    tx: z.union([paymentTxSchema, trustSetTxSchema]),
  })
  .strict();

export async function POST(req: NextRequest) {
  const ip = requestIp(req);
  const limit = checkRateLimit({
    key: `xaman-submit:${ip}`,
    limit: 15,
    windowMs: 60_000,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many signing requests. Please wait and try again." },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      },
    );
  }

  try {
    const parsed = submitPayloadSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Missing or invalid transaction payload." }, { status: 400 });
    }
    const body = parsed.data;

    const payload = await createXamanPayload({
      txjson: body.tx,
      options: { submit: true },
    });

    return NextResponse.json({
      uuid: payload.uuid,
      next: payload.next?.always ?? null,
      qrPng: payload.refs?.qr_png ?? null,
    });
  } catch {
    return NextResponse.json({ error: "Could not create signing request." }, { status: 500 });
  }
}
