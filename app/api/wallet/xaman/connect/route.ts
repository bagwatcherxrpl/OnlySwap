import { NextResponse } from "next/server";
import { createXamanPayload } from "@/lib/xaman/api";

export async function POST() {
  try {
    const payload = await createXamanPayload({
      txjson: { TransactionType: "SignIn" },
      options: { submit: false },
    });
    return NextResponse.json({
      uuid: payload.uuid,
      next: payload.next?.always ?? null,
      qrPng: payload.refs?.qr_png ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not initialize Xaman login.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
