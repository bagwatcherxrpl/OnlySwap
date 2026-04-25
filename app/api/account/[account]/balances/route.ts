import Decimal from "decimal.js";
import { NextResponse } from "next/server";
import { isValidClassicAddress } from "xrpl";
import { withXrplClient } from "@/lib/xrpl/client";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ account: string }> },
) {
  const { account } = await params;
  if (!isValidClassicAddress(account)) {
    return NextResponse.json({ error: "Invalid XRPL account." }, { status: 400 });
  }

  try {
    const balances = await withXrplClient(async (client) => {
      const balanceMap: Record<string, string> = {};

      const accountInfo = await client.request({
        command: "account_info",
        account,
        ledger_index: "validated",
      });
      const accountData = accountInfo.result.account_data;
      const xrpDrops = new Decimal(String(accountData?.Balance ?? "0"));
      const ownerCount = new Decimal(String(accountData?.OwnerCount ?? 0));

      // Mainnet defaults, used when node reserve endpoints are unavailable.
      let reserveBaseXrp = new Decimal("1");
      let reserveIncrementXrp = new Decimal("0.2");
      try {
        const serverInfo = await client.request({ command: "server_info" });
        const validatedLedger = serverInfo.result.info?.validated_ledger;
        const base = validatedLedger?.reserve_base_xrp;
        const inc = validatedLedger?.reserve_inc_xrp;
        if (base != null) reserveBaseXrp = new Decimal(String(base));
        if (inc != null) reserveIncrementXrp = new Decimal(String(inc));
      } catch {
        try {
          const serverState = await client.request({ command: "server_state" });
          const validatedLedger = serverState.result.state?.validated_ledger;
          // server_state uses drops; server_info uses *_xrp fields.
          const baseDrops = validatedLedger?.reserve_base;
          const incDrops = validatedLedger?.reserve_inc;
          if (baseDrops != null) {
            reserveBaseXrp = new Decimal(String(baseDrops)).div(1_000_000);
          }
          if (incDrops != null) {
            reserveIncrementXrp = new Decimal(String(incDrops)).div(1_000_000);
          }
        } catch {
          // Keep safe mainnet defaults when reserve lookup fails.
        }
      }

      const reserveDrops = reserveBaseXrp
        .plus(reserveIncrementXrp.times(ownerCount))
        .times(1_000_000);
      const spendableXrpDrops = Decimal.max(0, xrpDrops.minus(reserveDrops));
      balanceMap.XRP = spendableXrpDrops.div(1_000_000).toFixed();

      let marker: unknown;
      do {
        const response = await client.request({
          command: "account_lines",
          account,
          limit: 400,
          marker,
        });

        const lines = response.result.lines ?? [];
        for (const line of lines) {
          const currency = String(line.currency ?? "").trim().toUpperCase();
          const issuer = String(line.account ?? "").trim();
          if (!currency || !issuer) continue;
          const key = `${currency}.${issuer}`;
          const current = new Decimal(balanceMap[key] ?? "0");
          const next = current.plus(String(line.balance ?? "0"));
          balanceMap[key] = next.toFixed();
        }

        marker = response.result.marker;
      } while (marker);

      return balanceMap;
    });

    return NextResponse.json({ balances });
  } catch {
    return NextResponse.json({ balances: {} }, { status: 200 });
  }
}
