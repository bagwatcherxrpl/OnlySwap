import core from "@joey-wallet/wc-client/core";
import type { SessionTypes } from "@walletconnect/types";
import { PreparedTx, WalletAdapter } from "@/features/wallet/adapters/types";

const JOEY_WALLET_PROJECT_ID = "d9f5432e932c6fad8e19a0cea9d4a3372a84aed16e98a52e6655dd2821a63404";
const JOEY_DEEPLINK_PREFIX = "joey://settings/wc?uri=";
const JOEY_APP_DEEPLINK = "joey://";
const DEFAULT_CHAIN_ID = core.constants.chains.xrpl.mainnet.id;

let joeyProvider: InstanceType<typeof core.provider.Provider> | null = null;
const PROVIDER_CACHE_KEY = "__onlyswapJoeyProvider__";
let providerMountPromise: Promise<void> | null = null;

function getProjectId(): string {
  const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim();
  if (!projectId) {
    throw new Error("WalletConnect Project ID is missing. Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID.");
  }
  return projectId;
}

function getOrCreateProvider() {
  if (joeyProvider) return joeyProvider;
  if (typeof window === "undefined") {
    throw new Error("Joey WalletConnect is only available in the browser.");
  }
  const g = globalThis as typeof globalThis & {
    [PROVIDER_CACHE_KEY]?: InstanceType<typeof core.provider.Provider>;
  };
  if (g[PROVIDER_CACHE_KEY]) {
    joeyProvider = g[PROVIDER_CACHE_KEY]!;
    return joeyProvider;
  }

  joeyProvider = new core.provider.Provider({
    projectId: getProjectId(),
    defaultChain: DEFAULT_CHAIN_ID,
    namespaces: core.constants.chains.xrplNamespace,
    metadata: {
      name: "OnlySwap",
      description: "OnlySwap",
      url: window.location.origin,
      icons: [`${window.location.origin}/favicon.ico`],
      redirect: { universal: window.location.origin },
    },
    walletDetails: [
      {
        name: "Joey Wallet",
        projectId: JOEY_WALLET_PROJECT_ID,
        deeplinkFormat: JOEY_DEEPLINK_PREFIX,
      },
    ],
  });
  g[PROVIDER_CACHE_KEY] = joeyProvider;
  return joeyProvider;
}

async function ensureManagerProvider(
  provider: InstanceType<typeof core.provider.Provider>,
): Promise<void> {
  if (provider.manager.provider) return;

  // The Joey provider mounts itself in its constructor asynchronously.
  // Wait briefly to avoid a second `Provider.init()` during first connect.
  for (let i = 0; i < 20; i += 1) {
    if (provider.manager.provider) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  if (provider.manager.provider) return;
  if (!providerMountPromise) {
    providerMountPromise = provider.manager
      .setProvider()
      .then((result) => {
        if (result.error) {
          throw result.error;
        }
      })
      .finally(() => {
        providerMountPromise = null;
      });
  }
  await providerMountPromise;
}

function extractAccount(session?: SessionTypes.Struct): string | null {
  const raw = session?.namespaces?.xrpl?.accounts?.[0] ?? "";
  if (!raw) return null;
  const parts = raw.split(":");
  return parts[parts.length - 1] ?? null;
}

function getTxHash(response: unknown): string | undefined {
  if (!response || typeof response !== "object") return undefined;
  const tx = response as {
    tx_json?: { hash?: unknown };
    hash?: unknown;
    txHash?: unknown;
  };
  if (typeof tx.tx_json?.hash === "string") return tx.tx_json.hash;
  if (typeof tx.hash === "string") return tx.hash;
  if (typeof tx.txHash === "string") return tx.txHash;
  return undefined;
}

export class JoeyAdapter implements WalletAdapter {
  id = "joey" as const;
  label = "Joey Wallet";
  private account: string | null = null;
  private sessionId: string | null = null;
  private chainId: string = DEFAULT_CHAIN_ID;

  async connect(): Promise<void> {
    const popup = this.isMobile() ? null : this.openRequestWindow();
    const provider = getOrCreateProvider();
    await ensureManagerProvider(provider);
    if (this.isMobile()) {
      await this.connectOnMobile(provider, popup);
      return;
    }

    const uriPromise = this.waitForWalletConnectUri(provider, 12_000);
    const connectPromise = provider.connect({ openModal: false });
    this.renderPopupForUri(uriPromise, popup, "Connect Joey");

    const result = await connectPromise;
    this.safeClose(popup);
    if (result.error || !result.data) {
      throw new Error(result.error?.message ?? "Joey connection failed.");
    }
    this.applySession(result.data);
  }

  async disconnect(): Promise<void> {
    await this.restoreSessionFromProvider();
    if (!this.sessionId) {
      this.account = null;
      return;
    }

    const provider = getOrCreateProvider();
    const result = await provider.disconnect({ topic: this.sessionId });
    if (result.error) {
      throw new Error(result.error.message || "Could not disconnect Joey session.");
    }
    this.sessionId = null;
    this.account = null;
  }

  async getAccount(): Promise<string | null> {
    await this.restoreSessionFromProvider();
    return this.account;
  }

  async signAndSubmitBundle(txs: PreparedTx[]): Promise<{ txHash?: string; accepted: boolean }> {
    if (!txs.length) return { accepted: false };
    return this.signAndSubmit(txs[txs.length - 1]);
  }

  async signAndSubmit(tx: PreparedTx): Promise<{ txHash?: string; accepted: boolean }> {
    if (!tx) return { accepted: false };
    await this.restoreSessionFromProvider();
    if (!this.sessionId) {
      throw new Error("Joey session expired. Please reconnect your wallet.");
    }

    const provider = getOrCreateProvider();
    const signingRequest = provider.api.signTransaction(
      {
        tx_json: tx as never,
        options: { autofill: true, submit: true },
      },
      {
        sessionId: this.sessionId,
        chainId: this.chainId,
      },
    );
    if (this.isMobile()) {
      this.openDeeplink(JOEY_APP_DEEPLINK, null);
    }
    const response = await signingRequest;

    if (response.error || !response.data) {
      throw new Error(response.error?.message ?? "Joey signing request failed.");
    }

    const txHash = getTxHash(response.data);
    return { accepted: true, txHash };
  }

  getCapabilities() {
    return { bundleSigning: false };
  }

  private isMobile(): boolean {
    if (typeof navigator === "undefined") return false;
    return /Android|iPhone|iPad|iPod|Windows Phone/i.test(navigator.userAgent);
  }

  private openRequestWindow(): Window | null {
    if (typeof window === "undefined") return null;
    if (this.isMobile()) {
      return window.open("", "_blank", "noopener,noreferrer");
    }
    return window.open("", "joey-popup", "popup=yes,width=420,height=640");
  }

  private waitForWalletConnectUri(
    provider: InstanceType<typeof core.provider.Provider>,
    timeoutMs: number,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      if (provider.uri) {
        resolve(provider.uri);
        return;
      }

      const startedAt = Date.now();
      let timeout: ReturnType<typeof setTimeout> | null = null;
      let pollTimer: ReturnType<typeof setInterval> | null = null;

      const providerEmitter = provider as unknown as {
        on?: (event: string, listener: (value: unknown) => void) => void;
        off?: (event: string, listener: (value: unknown) => void) => void;
      };

      const cleanup = () => {
        if (timeout) clearTimeout(timeout);
        timeout = null;
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = null;
        providerEmitter.off?.("display_uri", onDisplayUri);
        provider.manager.provider?.off("display_uri", onDisplayUri);
      };

      const onDisplayUri = (uri: unknown) => {
        if (typeof uri !== "string" || !uri.length) return;
        cleanup();
        resolve(uri);
      };

      timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Could not get WalletConnect URI."));
      }, timeoutMs);

      pollTimer = setInterval(() => {
        if (provider.uri) {
          cleanup();
          resolve(provider.uri);
          return;
        }
        if (Date.now() - startedAt >= timeoutMs) {
          cleanup();
          reject(new Error("Could not get WalletConnect URI."));
        }
      }, 150);

      providerEmitter.on?.("display_uri", onDisplayUri);
      provider.manager.provider?.on("display_uri", onDisplayUri);
    });
  }

  private renderPopupForUri(uriPromise: Promise<string>, popup: Window | null, title: string): void {
    void uriPromise
      .then((uri) => {
        const deeplink = `${JOEY_DEEPLINK_PREFIX}${encodeURIComponent(uri)}`;
        const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(uri)}`;
        this.renderPopup({ popup, title, qrSrc, deeplink });
      })
      .catch(() => {
        // A paired session can connect without emitting a fresh URI.
      });
  }

  private async connectOnMobile(
    provider: InstanceType<typeof core.provider.Provider>,
    popup: Window | null,
  ): Promise<void> {
    const detailsResult = await provider.generateConnectionDetails({
      openModal: false,
      walletId: JOEY_WALLET_PROJECT_ID,
    });
    if (detailsResult.error || !detailsResult.data) {
      this.safeClose(popup);
      throw new Error(detailsResult.error?.message ?? "Could not initialize Joey mobile connection.");
    }

    this.openDeeplink(detailsResult.data.deeplink, popup);

    const session = await this.waitForSession(provider, 90_000);
    if (!session) {
      this.safeClose(popup);
      throw new Error("Joey connected but session was not available.");
    }

    this.safeClose(popup);
    this.applySession(session);
  }

  private async waitForSession(
    provider: InstanceType<typeof core.provider.Provider>,
    timeoutMs: number,
  ): Promise<SessionTypes.Struct | null> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const activeSession = provider.manager.provider?.session;
      if (activeSession) {
        return activeSession;
      }

      // Some wallet/browser combinations do not reliably dispatch connect events
      // after returning to the tab, so we poll for an active session as fallback.
      await Promise.race([
        provider.listenForConnect().catch(() => false),
        new Promise((resolve) => setTimeout(resolve, 800)),
      ]);
    }

    return null;
  }

  private openDeeplink(deeplink: string, popup: Window | null): void {
    if (typeof window === "undefined") return;
    if (this.isMobile()) {
      // Mobile browsers often block custom-scheme launches from secondary tabs.
      // Use top-level navigation instead of opening/navigating a popup tab.
      window.location.assign(deeplink);
      return;
    }
    if (!popup || popup.closed) {
      window.open(deeplink, "_blank", "noopener,noreferrer");
      return;
    }
    popup.location.href = deeplink;
  }

  private applySession(session: SessionTypes.Struct): void {
    const account = extractAccount(session);
    if (!account) {
      throw new Error("Joey connected but no XRPL account was returned.");
    }
    this.sessionId = session.topic;
    this.chainId = session.namespaces?.xrpl?.accounts?.[0]?.split(":").slice(0, 2).join(":") || DEFAULT_CHAIN_ID;
    this.account = account;
  }

  private async restoreSessionFromProvider(): Promise<void> {
    const provider = getOrCreateProvider();
    await ensureManagerProvider(provider);
    if (provider.manager.provider && provider.sessions.size === 0) {
      provider.manager.setData(provider.manager.provider);
    }

    const activeSession = provider.manager.provider?.session;
    if (activeSession) {
      this.applySession(activeSession);
      return;
    }

    const sessionIterator = provider.sessions.values();
    const firstStored = sessionIterator.next().value as { data?: SessionTypes.Struct } | undefined;
    if (firstStored?.data) {
      this.applySession(firstStored.data);
    }
  }

  private renderPopup({
    popup,
    title,
    qrSrc,
    deeplink,
  }: {
    popup: Window | null;
    title: string;
    qrSrc: string;
    deeplink: string;
  }) {
    if (typeof window === "undefined") return;
    if (this.isMobile() || !popup || popup.closed) {
      this.openDeeplink(deeplink, popup);
      return;
    }

    popup.document.title = title;
    const { document } = popup;
    document.body.textContent = "";
    document.body.style.margin = "0";
    document.body.style.background = "#0b0b0f";
    document.body.style.color = "#f4f4f5";

    const wrapper = document.createElement("div");
    wrapper.style.fontFamily = "Arial,sans-serif";
    wrapper.style.padding = "16px";
    wrapper.style.textAlign = "center";
    wrapper.style.minHeight = "100vh";

    const heading = document.createElement("h2");
    heading.style.margin = "8px 0 14px";
    heading.textContent = title;
    wrapper.appendChild(heading);

    const subtitle = document.createElement("p");
    subtitle.style.fontSize = "13px";
    subtitle.style.color = "#a1a1aa";
    subtitle.style.margin = "0 0 12px";
    subtitle.textContent = "Scan with Joey Wallet";
    wrapper.appendChild(subtitle);

    const img = document.createElement("img");
    img.src = qrSrc;
    img.alt = "Joey QR";
    img.style.width = "300px";
    img.style.maxWidth = "100%";
    img.style.borderRadius = "12px";
    wrapper.appendChild(img);

    const action = document.createElement("div");
    action.style.marginTop = "14px";
    const link = document.createElement("a");
    link.href = deeplink;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.style.color = "#8b5cf6";
    link.style.fontWeight = "600";
    link.textContent = "Open in Joey";
    action.appendChild(link);
    wrapper.appendChild(action);

    document.body.appendChild(wrapper);
  }

  private safeClose(popup: Window | null): void {
    if (!popup || popup.closed) return;
    popup.close();
  }
}
