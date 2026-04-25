export type AssetKind = "native" | "issued";

export type NativeXrpAsset = {
  kind: "native";
  symbol: "XRP";
  name: "XRP";
  verified: true;
  curated: true;
};

export type IssuedAsset = {
  kind: "issued";
  currency: string;
  issuer: string;
  symbol?: string;
  name?: string;
  logo?: string;
  verified?: boolean;
  curated?: boolean;
};

export type Asset = NativeXrpAsset | IssuedAsset;

export const NATIVE_XRP_ASSET: NativeXrpAsset = {
  kind: "native",
  symbol: "XRP",
  name: "XRP",
  verified: true,
  curated: true,
};
