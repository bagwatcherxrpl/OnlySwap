export async function prepareSwapTransactions(payload: {
  account: string;
  walletId: "xaman" | "joey";
  inputAsset: string;
  outputAsset: string;
  inputAmount: string;
  quoteExpiresAt?: number;
}) {
  const response = await fetch("/api/swap/prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error((data as { error?: string }).error ?? "Could not prepare transaction.");
  }
  return data as {
    txBundle: Array<{ kind: string; tx: Record<string, unknown> }>;
  };
}
