export type WalletCapability = {
  bundleSigning: boolean;
};

export type PreparedTx = Record<string, unknown>;

export interface WalletAdapter {
  id: "xaman" | "joey";
  label: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getAccount(): Promise<string | null>;
  signAndSubmitBundle(txs: PreparedTx[]): Promise<{ txHash?: string; accepted: boolean }>;
  signAndSubmit(tx: PreparedTx): Promise<{ txHash?: string; accepted: boolean }>;
  getCapabilities(): WalletCapability;
}
