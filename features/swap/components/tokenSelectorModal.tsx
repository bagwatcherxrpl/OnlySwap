"use client";

import { useEffect, useMemo, useState } from "react";
import { PRELISTED_TOKENS } from "@/lib/assets/prelistedTokens";
import { assetDisplayLabel } from "@/lib/assets/parser";
import { parseAssetIdentifier } from "@/lib/assets/parser";
import { Asset } from "@/lib/assets/types";

type Props = {
  open: boolean;
  walletAccount: string | null;
  balancesByAssetId: Record<string, string>;
  onClose: () => void;
  onSelect: (asset: Asset) => void;
};

export function TokenSelectorModal({
  open,
  walletAccount,
  balancesByAssetId,
  onClose,
  onSelect,
}: Props) {
  const [custom, setCustom] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [trustlineTokens, setTrustlineTokens] = useState<Asset[]>([]);
  const [trustlinesLoading, setTrustlinesLoading] = useState(false);

  useEffect(() => {
    if (!open || !walletAccount) {
      setTrustlineTokens([]);
      setTrustlinesLoading(false);
      return;
    }

    const controller = new AbortController();
    setTrustlinesLoading(true);
    void (async () => {
      try {
        const response = await fetch(`/api/account/${walletAccount}/trustlines`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          setTrustlineTokens([]);
          return;
        }
        const payload = (await response.json()) as { assets?: Asset[] };
        setTrustlineTokens(Array.isArray(payload.assets) ? payload.assets : []);
      } catch (fetchError) {
        if ((fetchError as { name?: string }).name === "AbortError") return;
        setTrustlineTokens([]);
      } finally {
        setTrustlinesLoading(false);
      }
    })();

    return () => controller.abort();
  }, [open, walletAccount]);

  const allTokens = useMemo(() => {
    const byId = new Map<string, Asset>();
    const insert = (token: Asset) => {
      const key = token.kind === "native" ? "XRP" : `${token.currency}.${token.issuer}`;
      const existing = byId.get(key);
      if (!existing) {
        byId.set(key, token);
        return;
      }
      if (existing.kind === "native" || token.kind === "native") return;
      byId.set(key, {
        ...token,
        symbol: existing.symbol ?? token.symbol,
        name: existing.name ?? token.name,
        verified: existing.verified ?? token.verified,
        curated: existing.curated ?? token.curated,
      });
    };

    PRELISTED_TOKENS.forEach(insert);
    trustlineTokens.forEach(insert);
    return Array.from(byId.values());
  }, [trustlineTokens]);

  const customSearchToken = useMemo(() => {
    const query = search.trim();
    if (!query) return null;
    const parsed = parseAssetIdentifier(query);
    if (!parsed.ok) return null;
    const parsedAsset = parsed.asset;
    const key = parsedAsset.kind === "native" ? "XRP" : `${parsedAsset.currency}.${parsedAsset.issuer}`;
    const exists = allTokens.some((token) =>
      token.kind === "native" ? key === "XRP" : key === `${token.currency}.${token.issuer}`,
    );
    if (exists) return null;
    return parsedAsset;
  }, [allTokens, search]);

  if (!open) return null;

  const filtered = allTokens.filter((token) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    if (token.kind === "native") return "xrp".includes(q);
    const assetId = `${token.currency}.${token.issuer}`.toLowerCase();
    return (
      assetId.includes(q) ||
      token.currency.toLowerCase().includes(q) ||
      (token.symbol ?? "").toLowerCase().includes(q) ||
      (token.name ?? "").toLowerCase().includes(q) ||
      token.issuer.toLowerCase().includes(q)
    );
  });
  const visibleTokens = customSearchToken ? [customSearchToken, ...filtered] : filtered;

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-zinc-900 p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">Select asset</h3>
          <button onClick={onClose} className="text-sm text-zinc-400">Close</button>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search symbol or issuer"
          className="mb-3 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none ring-violet-400/40 focus:ring"
        />
        <div className="max-h-80 space-y-2 overflow-y-auto pr-1 [scrollbar-color:rgba(139,92,246,0.85)_rgba(255,255,255,0.08)] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-zinc-900/70 [&::-webkit-scrollbar-thumb]:bg-violet-500/90 [&::-webkit-scrollbar-thumb:hover]:bg-violet-400 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-white/10 [&::-webkit-scrollbar]:w-2.5">
          {visibleTokens.map((token) => (
            <button
              key={token.kind === "native" ? "XRP" : `${token.currency}.${token.issuer}`}
              onClick={() => {
                onSelect(token);
                onClose();
              }}
              className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 hover:bg-white/10"
            >
              <span>{assetDisplayLabel(token)}</span>
              <span className="text-right text-xs text-zinc-400">
                <span className="block">
                  {token.kind === "native" ? "Native" : `${token.issuer.slice(0, 6)}...${token.issuer.slice(-4)}`}
                </span>
                {walletAccount ? (
                  <span className="block text-zinc-500">
                    Balance: {balancesByAssetId[token.kind === "native" ? "XRP" : `${token.currency}.${token.issuer}`] ?? "0"}
                  </span>
                ) : null}
              </span>
            </button>
          ))}
          {trustlinesLoading ? <p className="text-sm text-zinc-400">Loading wallet trustlines...</p> : null}
          {!visibleTokens.length ? <p className="text-sm text-zinc-400">No asset found. Use custom entry below.</p> : null}
        </div>
        <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="mb-2 text-xs text-zinc-300">Custom asset input</p>
          <input
            value={custom}
            onChange={(e) => {
              setCustom(e.target.value);
              setError(null);
            }}
            placeholder="currency.issuer or XRP"
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none ring-violet-400/40 focus:ring"
          />
          {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
          <button
            onClick={() => {
              const parsed = parseAssetIdentifier(custom);
              if (!parsed.ok) {
                setError("This custom asset could not be parsed.");
                return;
              }
              onSelect(parsed.asset);
              onClose();
            }}
            className="mt-2 w-full rounded-lg bg-violet-500 px-3 py-2 text-sm font-medium hover:bg-violet-400"
          >
            Use custom asset
          </button>
          <p className="mt-2 text-xs text-amber-300">Custom asset. Verify issuer before trading.</p>
        </div>
      </div>
    </div>
  );
}
