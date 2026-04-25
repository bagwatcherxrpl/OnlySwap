import { NextResponse } from "next/server";
import { isValidClassicAddress } from "xrpl";
import { Asset } from "@/lib/assets/types";
import { withXrplClient } from "@/lib/xrpl/client";

const HEX40 = /^[A-F0-9]{40}$/i;

function decodeCurrencyLabel(currency: string): string {
  const normalized = currency.trim().toUpperCase();
  if (!HEX40.test(normalized)) return normalized;
  const bytes = normalized.match(/.{2}/g)?.map((chunk) => parseInt(chunk, 16)) ?? [];
  const decoded = String.fromCharCode(...bytes).replace(/\0/g, "").trim();
  return decoded || normalized;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ account: string }> },
) {
  const { account } = await params;
  if (!isValidClassicAddress(account)) {
    return NextResponse.json({ error: "Invalid XRPL account." }, { status: 400 });
  }

  try {
    const assets = await withXrplClient(async (client) => {
      const lines: Array<{ currency: string; account: string }> = [];
      let marker: unknown;

      do {
        const response = await client.request({
          command: "account_lines",
          account,
          limit: 400,
          marker,
        });
        lines.push(...(response.result.lines as Array<{ currency: string; account: string }>));
        marker = response.result.marker;
      } while (marker);

      const deduped = new Map<string, Asset>();
      for (const line of lines) {
        const currency = line.currency.trim().toUpperCase();
        const issuer = line.account;
        const key = `${currency}.${issuer}`;
        if (deduped.has(key)) continue;

        const label = decodeCurrencyLabel(currency);
        deduped.set(key, {
          kind: "issued",
          currency,
          issuer,
          symbol: label,
          name: label,
          verified: false,
          curated: false,
        });
      }

      return Array.from(deduped.values());
    });

    return NextResponse.json({ assets });
  } catch {
    return NextResponse.json({ assets: [] }, { status: 200 });
  }
}
