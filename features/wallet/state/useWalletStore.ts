"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { walletAdapters } from "@/features/wallet/adapters";

type WalletStore = {
  walletId: "xaman" | "joey" | null;
  account: string | null;
  connecting: boolean;
  error: string | null;
  connect: (walletId: "xaman" | "joey") => Promise<void>;
  disconnect: () => Promise<void>;
};

export const useWalletStore = create<WalletStore>()(
  persist(
    (set, get) => ({
      walletId: null,
      account: null,
      connecting: false,
      error: null,
      connect: async (walletId) => {
        const adapter = walletAdapters[walletId];
        set({ connecting: true, error: null });
        try {
          await adapter.connect();
          const account = await adapter.getAccount();
          if (!account) {
            set({ connecting: false, error: "Wallet connected but no account was returned." });
            return;
          }
          set({ walletId, account, connecting: false });
        } catch (error) {
          const message =
            error instanceof Error && error.message
              ? error.message
              : "Wallet request was rejected.";
          set({ connecting: false, error: message });
        }
      },
      disconnect: async () => {
        const walletId = get().walletId;
        if (!walletId) return;
        await walletAdapters[walletId].disconnect();
        set({ walletId: null, account: null, error: null, connecting: false });
      },
    }),
    {
      name: "onlyswap-wallet-session",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        walletId: state.walletId,
        account: state.account,
      }),
    },
  ),
);
