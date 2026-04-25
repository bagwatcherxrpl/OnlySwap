import { JoeyAdapter } from "@/features/wallet/adapters/joeyAdapter";
import { WalletAdapter } from "@/features/wallet/adapters/types";
import { XamanAdapter } from "@/features/wallet/adapters/xamanAdapter";

export const walletAdapters: Record<"xaman" | "joey", WalletAdapter> = {
  xaman: new XamanAdapter(),
  joey: new JoeyAdapter(),
};
