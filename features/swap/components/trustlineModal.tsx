"use client";

import { IssuedAsset } from "@/lib/assets/types";
import { assetDisplayLabel } from "@/lib/assets/parser";

type Props = {
  open: boolean;
  asset: IssuedAsset | null;
  walletLabel: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
};

const MEMECOIN_TRUSTLINE_LIMIT = "1000000000000";

export function TrustlineModal({
  open,
  asset,
  walletLabel,
  busy,
  onClose,
  onConfirm,
}: Props) {
  if (!open || !asset) return null;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-zinc-900 p-4 shadow-2xl">
        <h3 className="text-base font-semibold">Set trustline</h3>
        <p className="mt-1 text-xs text-zinc-400">
          You need a trustline before receiving this token.
        </p>

        <div className="mt-4 space-y-2 rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
          <div className="flex justify-between">
            <span>Asset</span>
            <span>{assetDisplayLabel(asset)}</span>
          </div>
          <div className="flex justify-between">
            <span>Issuer</span>
            <span>{`${asset.issuer.slice(0, 6)}...${asset.issuer.slice(-4)}`}</span>
          </div>
          <div className="flex justify-between">
            <span>Limit</span>
            <span>{MEMECOIN_TRUSTLINE_LIMIT}</span>
          </div>
          <div className="flex justify-between">
            <span>No Ripple</span>
            <span>Enabled</span>
          </div>
          <div className="flex justify-between">
            <span>Wallet</span>
            <span>{walletLabel}</span>
          </div>
        </div>

        <p className="mt-3 text-xs text-zinc-400">
          This sends a TrustSet transaction from your wallet.
        </p>

        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="flex-1 rounded-lg border border-white/15 px-3 py-2 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            disabled={busy}
            onClick={() => onConfirm()}
            className="flex-1 rounded-lg bg-violet-500 px-3 py-2 font-medium disabled:opacity-60"
          >
            {busy ? "Setting..." : "Confirm & Set"}
          </button>
        </div>
      </div>
    </div>
  );
}
