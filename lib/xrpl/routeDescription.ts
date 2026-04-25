import { RouteKind } from "@/lib/xrpl/types";

export function describeRoute(kind: RouteKind): string {
  if (kind === "direct") return "Direct pool";
  if (kind === "viaXrp") return "Via XRP";
  return "Multi-hop route";
}
