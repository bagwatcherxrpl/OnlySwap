"use client";

import { useState } from "react";
import { useWalletStore } from "@/features/wallet/state/useWalletStore";

export function Header() {
  const { walletId, account, connect, disconnect, connecting, error } = useWalletStore();
  const [walletPickerOpen, setWalletPickerOpen] = useState(false);

  return (
    <header className="py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xl font-semibold tracking-tight">
            <span className="bg-gradient-to-r from-violet-300 to-cyan-300 bg-clip-text text-transparent">OnlySwap</span>
          </div>
        </div>
        {account ? (
          <button
            onClick={() => disconnect()}
            className="rounded-xl border border-white/15 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10"
          >
            {walletId?.toUpperCase()} · {account.slice(0, 6)}...{account.slice(-4)}
          </button>
        ) : (
          <div className="relative">
            <button
              type="button"
              disabled={connecting}
              onClick={() => setWalletPickerOpen((prev) => !prev)}
              className="rounded-xl border border-white/15 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10 disabled:opacity-60"
            >
              {connecting ? "Connecting..." : "Connect"}
            </button>
            {walletPickerOpen ? (
              <div className="absolute right-0 z-10 mt-2 w-44 rounded-xl border border-white/15 bg-zinc-950 p-1 shadow-xl">
                <button
                  type="button"
                  disabled={connecting}
                  onClick={() => {
                    void connect("xaman");
                    setWalletPickerOpen(false);
                  }}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-200 hover:bg-white/10 disabled:opacity-60"
                >
                  Xaman Wallet
                </button>
                <button
                  type="button"
                  disabled={connecting}
                  onClick={() => {
                    void connect("joey");
                    setWalletPickerOpen(false);
                  }}
                  className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-200 hover:bg-white/10 disabled:opacity-60"
                >
                  Joey Wallet
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
      {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
    </header>
  );
}
