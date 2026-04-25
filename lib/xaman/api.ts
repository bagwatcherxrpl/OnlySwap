type XamanPayloadRequest = {
  txjson?: Record<string, unknown>;
  txjsons?: Record<string, unknown>[];
  options?: Record<string, unknown>;
  custom_meta?: Record<string, unknown>;
};

type XamanCreateResponse = {
  uuid: string;
  next?: { always?: string };
  refs?: { qr_png?: string; websocket_status?: string };
};

type XamanGetResponse = {
  meta?: { signed?: boolean; resolved?: boolean };
  response?: {
    account?: string;
    txid?: string;
    signed?: boolean;
    dispatched_result?: string;
  };
};

const XAMAN_BASE_URL = "https://xumm.app/api/v1/platform";

function getCredentials() {
  const apiKey = process.env.XAMAN_API_KEY;
  const apiSecret = process.env.XAMAN_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error("Xaman API credentials are not configured.");
  }
  return { apiKey, apiSecret };
}

async function xamanFetch(path: string, init?: RequestInit): Promise<Response> {
  const { apiKey, apiSecret } = getCredentials();
  return fetch(`${XAMAN_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "x-api-secret": apiSecret,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
}

export async function createXamanPayload(payload: XamanPayloadRequest): Promise<XamanCreateResponse> {
  const response = await xamanFetch("/payload", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Could not create Xaman payload.");
  }
  return (await response.json()) as XamanCreateResponse;
}

export async function getXamanPayload(uuid: string): Promise<XamanGetResponse> {
  const response = await xamanFetch(`/payload/${uuid}`, { method: "GET" });
  if (!response.ok) {
    throw new Error("Could not read Xaman payload status.");
  }
  return (await response.json()) as XamanGetResponse;
}
