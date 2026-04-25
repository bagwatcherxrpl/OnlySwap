import { isValidClassicAddress } from "xrpl";
import { Asset, IssuedAsset, NATIVE_XRP_ASSET } from "@/lib/assets/types";

export type ParseAssetResult =
  | { ok: true; asset: Asset }
  | { ok: false; error: string };

const HEX40 = /^[A-F0-9]{40}$/i;
const THREE_TO_SIX_ALPHA = /^[A-Z]{3,6}$/;

export function normalizeAssetInput(raw: string): string {
  const trimmed = (raw ?? "").trim();
  const withoutSuffix = trimmed.replace(/_xrp$/i, "");
  return withoutSuffix.trim();
}

export function isNativeXrp(asset: Asset): boolean {
  return asset.kind === "native";
}

function normalizeCurrency(currencyRaw: string): string {
  const c = currencyRaw.trim().toUpperCase();
  return c;
}

function decodeHexCurrency(rawCurrency: string): string {
  const hex = rawCurrency.trim();
  if (!HEX40.test(hex)) return hex.toUpperCase();

  try {
    const bytes = hex.match(/.{2}/g)?.map((chunk) => parseInt(chunk, 16)) ?? [];
    const decoded = String.fromCharCode(...bytes).replace(/\0/g, "").trim();
    return decoded || hex.toUpperCase();
  } catch {
    return hex.toUpperCase();
  }
}

export function parseAssetIdentifier(raw: string): ParseAssetResult {
  const input = normalizeAssetInput(raw);
  if (!input) return { ok: false, error: "Asset identifier is empty." };

  if (input.toUpperCase() === "XRP") {
    return { ok: true, asset: NATIVE_XRP_ASSET };
  }

  const parts = input.split(".");
  if (parts.length !== 2) {
    return { ok: false, error: "Expected format currency.issuer or XRP." };
  }

  const currency = normalizeCurrency(parts[0] ?? "");
  const issuer = (parts[1] ?? "").trim();
  if (!currency || !issuer) {
    return { ok: false, error: "Missing currency or issuer." };
  }

  if (!isValidClassicAddress(issuer)) {
    return { ok: false, error: "Invalid XRPL issuer address." };
  }

  if (!(THREE_TO_SIX_ALPHA.test(currency) || HEX40.test(currency))) {
    return {
      ok: false,
      error: "Currency must be 3-6 letters or 40-char hex.",
    };
  }

  const asset: IssuedAsset = {
    kind: "issued",
    currency,
    issuer,
    symbol: THREE_TO_SIX_ALPHA.test(currency) ? currency : decodeHexCurrency(currency),
    name: decodeHexCurrency(currency),
    verified: false,
    curated: false,
  };

  return { ok: true, asset };
}

export function assetEquals(a: Asset, b: Asset): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "native") return true;
  if (b.kind === "native") return false;
  return a.currency === b.currency && a.issuer === b.issuer;
}

export function formatAssetForDisplay(asset: Asset): string {
  if (asset.kind === "native") return asset.name;
  const shortIssuer = `${asset.issuer.slice(0, 6)}...${asset.issuer.slice(-4)}`;
  return `${assetDisplayLabel(asset)} (${shortIssuer})`;
}

export function assetDisplayLabel(asset: Asset): string {
  if (asset.kind === "native") return asset.name;
  return asset.name ?? asset.symbol ?? decodeHexCurrency(asset.currency);
}
