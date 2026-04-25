import { Client } from "xrpl";

let singleton: Client | null = null;
let activeEndpointIndex = 0;

function getConfiguredEndpoints(): string[] {
  const raw = process.env.XRPL_RPC_URL;
  if (!raw) return ["wss://xrplcluster.com"];
  const endpoints = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return endpoints.length ? endpoints : ["wss://xrplcluster.com"];
}

export function getXrplClient(): Client {
  if (!singleton) {
    const endpoints = getConfiguredEndpoints();
    const endpoint = endpoints[activeEndpointIndex] ?? endpoints[0];
    singleton = new Client(endpoint);
  }
  return singleton;
}

export async function withXrplClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const endpoints = getConfiguredEndpoints();
  const client = getXrplClient();
  if (!client.isConnected()) {
    let lastError: unknown;
    for (let attempt = 0; attempt < endpoints.length; attempt += 1) {
      const endpointIndex = (activeEndpointIndex + attempt) % endpoints.length;
      const candidate = new Client(endpoints[endpointIndex]);
      try {
        await candidate.connect();
        singleton = candidate;
        activeEndpointIndex = endpointIndex;
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!singleton?.isConnected()) {
      throw lastError instanceof Error ? lastError : new Error("Unable to connect to XRPL RPC endpoint.");
    }
  }

  const connected = singleton;
  if (!connected?.isConnected()) {
    throw new Error("Unable to connect to XRPL RPC endpoint.");
  }
  return fn(connected);
}
