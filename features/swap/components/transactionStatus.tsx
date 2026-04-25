export function TransactionStatus({
  status,
  txHash,
  error,
}: {
  status: "idle" | "review" | "signing" | "pending" | "success" | "error";
  txHash: string | null;
  error: string | null;
}) {
  if (status === "success") {
    return (
      <div className="mt-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
        Swap completed successfully.
        {txHash ? <div className="mt-1 text-xs text-emerald-300">Tx: {txHash}</div> : null}
      </div>
    );
  }
  if (status === "error") {
    return <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error ?? "Swap failed."}</div>;
  }
  if (status === "pending" || status === "signing") {
    return <div className="mt-3 rounded-xl border border-violet-500/30 bg-violet-500/10 p-3 text-sm">Awaiting wallet signature and XRPL confirmation...</div>;
  }
  return null;
}
