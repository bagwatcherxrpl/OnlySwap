import { QuoteResponse } from "@/lib/xrpl/types";
import { RotateCw } from "lucide-react";

export function QuoteSummary({
  quote,
  loading,
  error,
  isStale,
  onRefresh,
  refreshDisabled,
}: {
  quote: QuoteResponse | null;
  loading: boolean;
  error: string | null;
  isStale: boolean;
  onRefresh?: () => void;
  refreshDisabled?: boolean;
}) {
  const networkFeeXrp = "0.000012";
  const priceImpact = quote ? Number.parseFloat(quote.priceImpactPct) : 0;
  const priceImpactClass =
    priceImpact > 10
      ? "text-red-400"
      : priceImpact > 5
        ? "text-amber-300"
        : priceImpact > 2.5
          ? "text-yellow-300"
        : "text-zinc-100";

  if (loading) {
    return <div className="mt-4 h-28 animate-pulse rounded-xl bg-white/5" />;
  }

  if (error) return <p className="mt-3 text-sm text-red-400">{error}</p>;
  if (!quote) return <p className="mt-3 text-sm text-zinc-400">Enter an amount to get a quote.</p>;

  return (
    <div className="mt-4 space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm">
      <div className="flex justify-between"><span>Estimated receive</span><span>{quote.estimatedOutput}</span></div>
      <div className="flex justify-between"><span>Route</span><span>{quote.routeSummary}</span></div>
      <div className="flex justify-between"><span>Network fee</span><span>{networkFeeXrp} XRP</span></div>
      <div className="flex justify-between">
        <span>Price impact</span>
        <span className={priceImpactClass}>{quote.priceImpactPct}%</span>
      </div>
      {isStale ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-amber-300">Quote expired.</p>
          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshDisabled}
              className="rounded-md border border-white/20 p-1 text-zinc-300 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Refresh quote"
              title="Refresh quote"
            >
              <RotateCw size={12} />
            </button>
          ) : null}
        </div>
      ) : null}
      {quote.warnings.length ? <p className="text-xs text-amber-300">{quote.warnings.join(" ")}</p> : null}
    </div>
  );
}
