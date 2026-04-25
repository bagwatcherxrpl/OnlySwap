export type TradeBroadcastEvent = {
  txHash: string;
  tradeSizeXrp: string;
  timestamp: number;
};

type TradeListener = (event: TradeBroadcastEvent) => void;

const MAX_SEEN_HASHES = 1000;
const listeners = new Set<TradeListener>();
const seenTxHashes: string[] = [];
const seenTxHashSet = new Set<string>();

export function subscribeTrades(listener: TradeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publishTrade(event: TradeBroadcastEvent): boolean {
  if (seenTxHashSet.has(event.txHash)) return false;

  seenTxHashSet.add(event.txHash);
  seenTxHashes.push(event.txHash);
  if (seenTxHashes.length > MAX_SEEN_HASHES) {
    const oldest = seenTxHashes.shift();
    if (oldest) seenTxHashSet.delete(oldest);
  }

  for (const listener of listeners) {
    listener(event);
  }
  return true;
}
