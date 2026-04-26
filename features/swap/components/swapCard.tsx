"use client";

import { ArrowDownUp } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TokenSelectorModal } from "@/features/swap/components/tokenSelectorModal";
import { QuoteSummary } from "@/features/swap/components/quoteSummary";
import { ReviewSwapModal } from "@/features/swap/components/reviewSwapModal";
import { TrustlineModal } from "@/features/swap/components/trustlineModal";
import { TransactionStatus } from "@/features/swap/components/transactionStatus";
import {
  buildAssetIdentifier,
  canRequestQuote,
  isCurrentQuoteStale,
  useSwapStore,
} from "@/features/swap/state/useSwapStore";
import { prepareSwapTransactions } from "@/features/swap/services/prepareSwapTransactions";
import { walletAdapters } from "@/features/wallet/adapters";
import { useWalletStore } from "@/features/wallet/state/useWalletStore";
import { assetDisplayLabel, parseAssetIdentifier } from "@/lib/assets/parser";
import type { Asset } from "@/lib/assets/types";

function assetsEqual(a: Asset, b: Asset): boolean {
  if (a.kind === "native" && b.kind === "native") return true;
  if (a.kind === "issued" && b.kind === "issued") {
    return a.currency === b.currency && a.issuer === b.issuer;
  }
  return false;
}

function normalizeAmountForInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "0";
  const normalized = trimmed.replace(/\.?0+$/, "");
  return normalized === "" ? "0" : normalized;
}

export function SwapCard() {
  const swap = useSwapStore();
  const wallet = useWalletStore();
  const { fromAsset, toAsset, quote, setQuote, setQuoteLoading, inputAmount } = swap;
  const [debouncedAmount, setDebouncedAmount] = useState(swap.inputAmount);
  const [balancesByAssetId, setBalancesByAssetId] = useState<Record<string, string>>({});
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [trustlineBusy, setTrustlineBusy] = useState(false);
  const [trustlineModalOpen, setTrustlineModalOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const requestSeqRef = useRef(0);
  const submitLockedRef = useRef(false);
  const lastQuoteKeyRef = useRef<string>("");
  const initializedFromUrlRef = useRef(false);

  const applyPairFromUrl = useCallback((fromParam: string, toParam: string) => {
    const parsedFrom = parseAssetIdentifier(fromParam);
    const parsedTo = parseAssetIdentifier(toParam);
    if (!parsedFrom.ok || !parsedTo.ok) return;
    if (assetsEqual(parsedFrom.asset, parsedTo.asset)) {
      return;
    }

    const state = useSwapStore.getState();
    const currentFrom = state.fromAsset;
    const currentTo = state.toAsset;

    if (
      assetsEqual(currentFrom, parsedTo.asset) &&
      assetsEqual(currentTo, parsedFrom.asset)
    ) {
      state.switchAssets();
      return;
    }

    const fromEqualsCurrentTo = assetsEqual(currentTo, parsedFrom.asset);

    if (fromEqualsCurrentTo) {
      state.setAsset("to", parsedTo.asset);
      state.setAsset("from", parsedFrom.asset);
      return;
    }

    state.setAsset("from", parsedFrom.asset);
    state.setAsset("to", parsedTo.asset);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedAmount(inputAmount), 350);
    return () => clearTimeout(t);
  }, [inputAmount]);

  useEffect(() => {
    if (initializedFromUrlRef.current) return;
    initializedFromUrlRef.current = true;
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const fromParam = params.get("from");
    const toParam = params.get("to");
    if (fromParam && toParam) {
      applyPairFromUrl(fromParam, toParam);
    }
  }, [applyPairFromUrl]);

  const fromId = useMemo(() => buildAssetIdentifier(fromAsset), [fromAsset]);
  const toId = useMemo(() => buildAssetIdentifier(toAsset), [toAsset]);
  const fromBalance = balancesByAssetId[fromId] ?? "0";
  const toBalance = balancesByAssetId[toId] ?? "0";
  const hasToTrustline =
    toAsset.kind === "native" || Object.prototype.hasOwnProperty.call(balancesByAssetId, toId);
  const requiresTrustline =
    Boolean(wallet.account) && toAsset.kind === "issued" && !balancesLoading && !hasToTrustline;

  const refreshBalances = useCallback(
    async (signal?: AbortSignal) => {
      if (!wallet.account) {
        setBalancesByAssetId({});
        setBalancesLoading(false);
        return;
      }
      setBalancesLoading(true);
      try {
        const response = await fetch(`/api/account/${wallet.account}/balances`, { signal });
        if (!response.ok) {
          setBalancesByAssetId({});
          return;
        }
        const payload = (await response.json()) as { balances?: Record<string, string> };
        setBalancesByAssetId(payload.balances ?? {});
      } catch (error) {
        if ((error as { name?: string }).name === "AbortError") return;
        setBalancesByAssetId({});
      } finally {
        setBalancesLoading(false);
      }
    },
    [wallet.account],
  );

  useEffect(() => {
    if (!wallet.account) {
      setBalancesByAssetId({});
      setBalancesLoading(false);
      return;
    }
    const controller = new AbortController();
    void refreshBalances(controller.signal);

    return () => controller.abort();
  }, [refreshBalances, wallet.account]);

  const requestQuote = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      const canQuote = canRequestQuote({ fromAsset, toAsset, inputAmount: debouncedAmount });
      if (!canQuote) {
        lastQuoteKeyRef.current = "";
        if (!debouncedAmount) {
          setQuote(null, "Enter an amount to get a quote.");
        }
        return;
      }

      const quoteKey = `${fromId}:${toId}:${debouncedAmount}`;
      if (!force && quoteKey === lastQuoteKeyRef.current) return;
      lastQuoteKeyRef.current = quoteKey;

      const requestId = ++requestSeqRef.current;
      setQuoteLoading(true);
      try {
        const response = await fetch("/api/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inputAsset: fromId,
            outputAsset: toId,
            inputAmount: debouncedAmount,
          }),
        });
        if (!response.ok) {
          const payload = (await response.json()) as { error?: string };
          if (requestId === requestSeqRef.current) {
            setQuote(null, payload.error ?? "Quote unavailable.");
          }
          return;
        }
        const nextQuote = await response.json();
        if (requestId === requestSeqRef.current) {
          setQuote(nextQuote);
        }
      } catch (error) {
        if ((error as { name?: string }).name === "AbortError") return;
        if (requestId === requestSeqRef.current) {
          setQuote(null, "Network error while requesting quote.");
        }
      }
    },
    [debouncedAmount, fromAsset, fromId, setQuote, setQuoteLoading, toAsset, toId],
  );

  useEffect(() => {
    void requestQuote();
  }, [requestQuote]);

  const canSwap = useMemo(() => {
    if (!wallet.account) return true;
    if (!canRequestQuote(swap)) return true;
    if (!swap.quote) return true;
    if (isCurrentQuoteStale(swap)) return true;
    return swap.txStatus === "signing" || swap.txStatus === "pending";
  }, [swap, wallet.account]);

  const selectedWallet = wallet.walletId ? walletAdapters[wallet.walletId] : null;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.set("from", fromId);
    params.set("to", toId);
    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", nextUrl);
  }, [fromId, toId]);

  async function waitForValidation(txHash?: string): Promise<boolean> {
    if (!txHash) return false;
    for (let i = 0; i < 8; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const response = await fetch(`/api/tx/${txHash}`);
      if (!response.ok) continue;
      const payload = (await response.json()) as { validated?: boolean; found?: boolean };
      if (payload.validated) return true;
      if (payload.found === false) continue;
    }
    return false;
  }

  async function setTrustlineForTargetAsset() {
    if (!wallet.account || !wallet.walletId || toAsset.kind !== "issued") return;
    if (trustlineBusy) return;

    setTrustlineBusy(true);
    swap.setTxStatus("signing");
    try {
      const adapter = walletAdapters[wallet.walletId];
      const result = await adapter.signAndSubmit({
        TransactionType: "TrustSet",
        Account: wallet.account,
        LimitAmount: {
          currency: toAsset.currency,
          issuer: toAsset.issuer,
          // High limit typical for memecoin trustlines.
          value: "1000000000000",
        },
        Flags: 131072,
      });
      if (!result.accepted) {
        swap.setTxStatus("error", "Trustline request was rejected.");
        return;
      }

      swap.setTxStatus("pending");
      const confirmed = await waitForValidation(result.txHash);
      if (!confirmed) {
        swap.setTxStatus("error", "Trustline transaction not confirmed yet.");
        return;
      }

      await refreshBalances();
      setTrustlineModalOpen(false);
      swap.setTxStatus("idle");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.toLowerCase().includes("closed")) {
        swap.setTxStatus("error", "Wallet confirmation was closed.");
      } else if (message.toLowerCase().includes("rejected")) {
        swap.setTxStatus("error", "Trustline request was rejected.");
      } else {
        swap.setTxStatus("error", "Trustline setup failed.");
      }
    } finally {
      setTrustlineBusy(false);
    }
  }

  return (
    <section className="w-full max-w-xl rounded-3xl border border-white/15 bg-white/[0.03] p-5 shadow-2xl backdrop-blur">
      <div className="mb-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Swap</h2>
          <button
            type="button"
            onClick={async () => {
              if (typeof window === "undefined") return;
              const link = window.location.href;
              try {
                await navigator.clipboard.writeText(link);
                setShareCopied(true);
                window.setTimeout(() => setShareCopied(false), 1400);
              } catch {
                setShareCopied(false);
              }
            }}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs hover:bg-white/10"
          >
            {shareCopied ? "Link kopiert" : "Link kopieren"}
          </button>
        </div>
        <p className="mt-1 text-sm text-zinc-400">Best-route XRPL swap with no fees.</p>
      </div>
      <div className="space-y-3">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="mb-2 flex items-center justify-between text-xs text-zinc-400">
            <span>From</span>
            <button
              onClick={() => swap.setInputAmount(normalizeAmountForInput(fromBalance))}
              className="hover:text-zinc-200 disabled:cursor-not-allowed disabled:text-zinc-600"
              disabled={!wallet.account || Number(fromBalance) <= 0}
            >
              Max
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => swap.openSelector("from")} className="rounded-lg border border-white/15 px-3 py-2 text-sm hover:bg-white/10">
              {assetDisplayLabel(swap.fromAsset)}
            </button>
            <input
              value={swap.inputAmount}
              onChange={(e) => swap.setInputAmount(e.target.value)}
              placeholder="0.0"
              inputMode="decimal"
              className="w-full bg-transparent text-right text-xl outline-none"
            />
          </div>
          <div className="mt-2 text-right text-xs text-zinc-500">Balance: {fromBalance}</div>
        </div>
        <div className="flex justify-center">
          <button onClick={() => swap.switchAssets()} className="rounded-full border border-white/15 bg-black/40 p-2 hover:bg-white/10">
            <ArrowDownUp size={16} />
          </button>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="mb-2 text-xs text-zinc-400">To</div>
          <div className="flex items-center gap-2">
            <button onClick={() => swap.openSelector("to")} className="rounded-lg border border-white/15 px-3 py-2 text-sm hover:bg-white/10">
              {assetDisplayLabel(swap.toAsset)}
            </button>
            <div className="w-full text-right text-xl text-zinc-300">{swap.quote ? swap.quote.estimatedOutput : "--"}</div>
          </div>
          <div className="mt-2 text-right text-xs text-zinc-500">Balance: {toBalance}</div>
        </div>
      </div>

      <QuoteSummary
        quote={swap.quote}
        loading={swap.quoteLoading}
        error={swap.quoteError}
        isStale={Boolean(swap.quote && isCurrentQuoteStale(swap))}
        onRefresh={() => void requestQuote({ force: true })}
        refreshDisabled={swap.quoteLoading}
      />

      <button
        disabled={
          !wallet.account
            ? true
            : requiresTrustline
              ? trustlineBusy || swap.txStatus === "signing" || swap.txStatus === "pending"
              : canSwap
        }
        onClick={async () => {
          if (!wallet.account || !wallet.walletId) return;
          if (!requiresTrustline) {
            swap.setTxStatus("review");
            return;
          }
          setTrustlineModalOpen(true);
        }}
        className="mt-4 w-full rounded-xl bg-violet-500 px-4 py-3 font-semibold hover:bg-violet-400 disabled:cursor-not-allowed disabled:bg-zinc-700"
      >
        {!wallet.account
          ? "Connect wallet to swap"
          : requiresTrustline
            ? trustlineBusy
              ? "Setting Trustline..."
              : "Set Trustline"
            : isCurrentQuoteStale(swap)
              ? "Quote expired"
              : "Swap"}
      </button>
      {requiresTrustline ? (
        <p className="mt-2 text-xs text-amber-300">
          This token needs a trustline before you can buy it.
        </p>
      ) : null}

      <TransactionStatus status={swap.txStatus} txHash={swap.txHash} error={swap.txError} />

      <TokenSelectorModal
        open={Boolean(swap.selectorOpen)}
        walletAccount={wallet.account}
        balancesByAssetId={balancesByAssetId}
        onClose={() => swap.closeSelector()}
        onSelect={(asset) => {
          if (swap.selectorOpen) swap.setAsset(swap.selectorOpen, asset);
        }}
      />

      <ReviewSwapModal
        open={swap.txStatus === "review"}
        onClose={() => swap.setTxStatus("idle")}
        fromAsset={swap.fromAsset}
        toAsset={swap.toAsset}
        inputAmount={swap.inputAmount}
        quote={swap.quote}
        walletLabel={selectedWallet?.label ?? "Unknown"}
        busy={swap.txStatus === "signing" || swap.txStatus === "pending"}
        onConfirm={async () => {
          if (!wallet.account || !wallet.walletId || !swap.quote) return;
          if (submitLockedRef.current) return;
          if (isCurrentQuoteStale(swap)) {
            swap.setTxStatus("error", "Quote expired. Please review the updated quote.");
            return;
          }
          submitLockedRef.current = true;
          swap.setTxStatus("signing");
          try {
            const prepared = await prepareSwapTransactions({
              account: wallet.account,
              walletId: wallet.walletId,
              inputAsset: buildAssetIdentifier(swap.fromAsset),
              outputAsset: buildAssetIdentifier(swap.toAsset),
              inputAmount: swap.inputAmount,
              quoteExpiresAt: swap.quote.expiresAt,
            });
            const adapter = walletAdapters[wallet.walletId];
            const swapTx = prepared.txBundle.find((bundleTx) => bundleTx.kind === "swap")?.tx;
            const result = adapter.getCapabilities().bundleSigning
              ? await adapter.signAndSubmitBundle(prepared.txBundle.map((x) => x.tx))
              : swapTx
                ? await adapter.signAndSubmit(swapTx)
                : { accepted: false };

            if (!result.accepted) {
              swap.setTxStatus("error", "Wallet request was rejected.");
              submitLockedRef.current = false;
              return;
            }

            swap.setTxStatus("pending");
            const confirmed = await waitForValidation(result.txHash);
            if (!confirmed) {
              swap.setTxStatus("error", "Transaction not confirmed yet. Check your wallet history.");
              submitLockedRef.current = false;
              return;
            }
            await refreshBalances();
            swap.setTxStatus("success", null, result.txHash ?? null);
          } catch (error) {
            const message = error instanceof Error ? error.message : "";
            if (message.toLowerCase().includes("closed")) {
              swap.setTxStatus("error", "Wallet confirmation was closed.");
            } else if (message.toLowerCase().includes("rejected")) {
              swap.setTxStatus("error", "Wallet request was rejected.");
            } else if (message) {
              swap.setTxStatus("error", message);
            } else {
              swap.setTxStatus("error", "Swap submission failed.");
            }
          } finally {
            submitLockedRef.current = false;
          }
        }}
      />

      <TrustlineModal
        open={trustlineModalOpen && requiresTrustline}
        asset={toAsset.kind === "issued" ? toAsset : null}
        walletLabel={selectedWallet?.label ?? "Unknown"}
        busy={trustlineBusy || swap.txStatus === "signing" || swap.txStatus === "pending"}
        onClose={() => {
          if (trustlineBusy) return;
          setTrustlineModalOpen(false);
          if (swap.txStatus === "signing" || swap.txStatus === "pending") return;
          swap.setTxStatus("idle");
        }}
        onConfirm={async () => setTrustlineForTargetAsset()}
      />
    </section>
  );
}
