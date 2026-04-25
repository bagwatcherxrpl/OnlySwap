import { PreparedTx, WalletAdapter } from "@/features/wallet/adapters/types";

export class XamanAdapter implements WalletAdapter {
  id = "xaman" as const;
  label = "Xaman";
  private account: string | null = null;

  async connect(): Promise<void> {
    const connectPopup = this.openDesktopPopup();
    const response = await fetch("/api/wallet/xaman/connect", { method: "POST" });
    const data = (await response.json()) as { error?: string; uuid?: string; next?: string | null; qrPng?: string | null };
    if (!response.ok || !data.uuid) {
      this.safeClose(connectPopup);
      throw new Error(data.error ?? "Could not initialize Xaman login.");
    }

    this.openXamanIntent({ next: data.next, qrPng: data.qrPng, popup: connectPopup, title: "Connect Xaman" });

    const status = await this.waitForResolution(data.uuid, connectPopup);
    this.safeClose(connectPopup);
    if (!status.signed || !status.account) {
      throw new Error("Xaman login was rejected.");
    }
    this.account = status.account;
  }

  async disconnect(): Promise<void> {
    this.account = null;
  }

  async getAccount(): Promise<string | null> {
    return this.account;
  }

  async signAndSubmitBundle(txs: PreparedTx[]): Promise<{ txHash?: string; accepted: boolean }> {
    if (!txs.length) return { accepted: false };
    return this.signAndSubmit(txs[txs.length - 1]);
  }

  async signAndSubmit(tx: PreparedTx): Promise<{ txHash?: string; accepted: boolean }> {
    if (!tx) return { accepted: false };
    const signingPopup = this.openDesktopPopup();
    const response = await fetch("/api/wallet/xaman/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tx }),
    });
    const data = (await response.json()) as { error?: string; uuid?: string; next?: string | null; qrPng?: string | null };
    if (!response.ok || !data.uuid) {
      this.safeClose(signingPopup);
      throw new Error(data.error ?? "Could not create Xaman signing request.");
    }

    this.openXamanIntent({ next: data.next, qrPng: data.qrPng, popup: signingPopup, title: "Sign with Xaman" });

    const status = await this.waitForResolution(data.uuid, signingPopup);
    this.safeClose(signingPopup);
    return { accepted: status.signed, txHash: status.txHash ?? undefined };
  }

  getCapabilities() {
    return { bundleSigning: false };
  }

  private async waitForResolution(
    uuid: string,
    popup: Window | null,
  ): Promise<{ resolved: boolean; signed: boolean; account?: string | null; txHash?: string | null }> {
    for (let i = 0; i < 90; i += 1) {
      if (popup && popup.closed) {
        throw new Error("Xaman request was closed.");
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (popup && popup.closed) {
        throw new Error("Xaman request was closed.");
      }
      const response = await fetch(`/api/wallet/xaman/status/${uuid}`);
      const data = (await response.json()) as {
        error?: string;
        resolved?: boolean;
        signed?: boolean;
        account?: string | null;
        txHash?: string | null;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Could not fetch Xaman payload status.");
      }
      if (data.resolved) {
        return {
          resolved: true,
          signed: Boolean(data.signed),
          account: data.account ?? null,
          txHash: data.txHash ?? null,
        };
      }
    }
    throw new Error("Xaman request timed out.");
  }

  private isMobile(): boolean {
    if (typeof navigator === "undefined") return false;
    return /Android|iPhone|iPad|iPod|Windows Phone/i.test(navigator.userAgent);
  }

  private openDesktopPopup(): Window | null {
    if (typeof window === "undefined" || this.isMobile()) return null;
    return window.open("", "xaman-popup", "popup=yes,width=420,height=640");
  }

  private openXamanIntent({
    next,
    qrPng,
    popup,
    title,
  }: {
    next?: string | null;
    qrPng?: string | null;
    popup: Window | null;
    title: string;
  }): void {
    if (typeof window === "undefined" || !next) return;
    const safeNext = this.normalizeExternalUrl(next, ["https:", "xumm:", "xaman:"]);
    if (!safeNext) return;
    const safeQr = qrPng ? this.normalizeExternalUrl(qrPng, ["https:"]) : null;

    if (this.isMobile()) {
      window.open(safeNext, "_blank", "noopener,noreferrer");
      return;
    }

    if (!popup || popup.closed) {
      window.open(safeNext, "_blank", "noopener,noreferrer");
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
    subtitle.textContent = "Scan with Xaman mobile app";
    wrapper.appendChild(subtitle);

    if (safeQr) {
      const img = document.createElement("img");
      img.src = safeQr;
      img.alt = "Xaman QR";
      img.style.width = "300px";
      img.style.maxWidth = "100%";
      img.style.borderRadius = "12px";
      wrapper.appendChild(img);
    }

    const action = document.createElement("div");
    action.style.marginTop = "14px";
    const link = document.createElement("a");
    link.href = safeNext;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.style.color = "#8b5cf6";
    link.style.fontWeight = "600";
    link.textContent = "Open in Xaman";
    action.appendChild(link);
    wrapper.appendChild(action);

    document.body.appendChild(wrapper);
  }

  private normalizeExternalUrl(raw: string, allowedProtocols: string[]): string | null {
    try {
      const url = new URL(raw, window.location.origin);
      const protocol = url.protocol.toLowerCase();
      if (!allowedProtocols.includes(protocol)) return null;
      return url.href;
    } catch {
      return null;
    }
  }

  private safeClose(popup: Window | null): void {
    if (!popup || popup.closed) return;
    popup.close();
  }
}
