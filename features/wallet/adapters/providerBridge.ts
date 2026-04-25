"use client";

type UnknownRecord = Record<string, unknown>;

type ProviderLike = {
  request?: (args: { method: string; params?: UnknownRecord }) => Promise<unknown>;
  connect?: () => Promise<unknown>;
  disconnect?: () => Promise<unknown>;
  getAccount?: () => Promise<string | null>;
  signAndSubmit?: (tx: UnknownRecord) => Promise<unknown>;
  signAndSubmitBundle?: (txs: UnknownRecord[]) => Promise<unknown>;
};

function getWindowProvider(name: "xaman" | "joey"): ProviderLike | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    xaman?: ProviderLike;
    joey?: ProviderLike;
    xrpl?: { xaman?: ProviderLike; joey?: ProviderLike };
  };
  return w[name] ?? w.xrpl?.[name] ?? null;
}

export function hasProvider(name: "xaman" | "joey"): boolean {
  return Boolean(getWindowProvider(name));
}

export async function providerConnect(name: "xaman" | "joey"): Promise<void> {
  const provider = getWindowProvider(name);
  if (!provider) throw new Error(`${name} provider not found.`);

  if (provider.connect) {
    await provider.connect();
    return;
  }
  if (provider.request) {
    await provider.request({ method: "connect" });
    return;
  }
  throw new Error(`${name} provider does not support connect.`);
}

export async function providerDisconnect(name: "xaman" | "joey"): Promise<void> {
  const provider = getWindowProvider(name);
  if (!provider) return;

  if (provider.disconnect) {
    await provider.disconnect();
    return;
  }
  if (provider.request) {
    await provider.request({ method: "disconnect" });
  }
}

export async function providerGetAccount(name: "xaman" | "joey"): Promise<string | null> {
  const provider = getWindowProvider(name);
  if (!provider) return null;

  if (provider.getAccount) {
    return provider.getAccount();
  }

  if (provider.request) {
    const account = await provider.request({ method: "getAccount" });
    if (typeof account === "string") return account;
    if (account && typeof account === "object" && "account" in account && typeof (account as { account?: unknown }).account === "string") {
      return (account as { account: string }).account;
    }
  }
  return null;
}

export async function providerSignAndSubmit(
  name: "xaman" | "joey",
  tx: UnknownRecord,
): Promise<{ accepted: boolean; txHash?: string }> {
  const provider = getWindowProvider(name);
  if (!provider) throw new Error(`${name} provider not found.`);

  const response = provider.signAndSubmit
    ? await provider.signAndSubmit(tx)
    : provider.request
      ? await provider.request({ method: "signAndSubmit", params: { tx } })
      : null;

  return normalizeSubmission(response);
}

export async function providerSignAndSubmitBundle(
  name: "xaman" | "joey",
  txs: UnknownRecord[],
): Promise<{ accepted: boolean; txHash?: string }> {
  const provider = getWindowProvider(name);
  if (!provider) throw new Error(`${name} provider not found.`);

  const response = provider.signAndSubmitBundle
    ? await provider.signAndSubmitBundle(txs)
    : provider.request
      ? await provider.request({ method: "signAndSubmitBundle", params: { txs } })
      : null;

  return normalizeSubmission(response);
}

function normalizeSubmission(response: unknown): { accepted: boolean; txHash?: string } {
  if (!response) return { accepted: false };
  if (typeof response === "string") return { accepted: true, txHash: response };

  if (typeof response === "object") {
    const r = response as {
      accepted?: boolean;
      signed?: boolean;
      txHash?: string;
      hash?: string;
      result?: { hash?: string; accepted?: boolean };
    };

    const txHash = r.txHash ?? r.hash ?? r.result?.hash;
    const accepted = Boolean(r.accepted ?? r.signed ?? r.result?.accepted ?? txHash);
    return { accepted, txHash };
  }

  return { accepted: false };
}
