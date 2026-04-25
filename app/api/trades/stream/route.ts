import { NextResponse } from "next/server";
import { subscribeTrades } from "@/lib/trades/subscriptions";

export const dynamic = "force-dynamic";

function sseEncode(payload: unknown, event?: string): string {
  const lines: string[] = [];
  if (event) lines.push(`event: ${event}`);
  lines.push(`data: ${JSON.stringify(payload)}`);
  return `${lines.join("\n")}\n\n`;
}

export async function GET() {
  let unsubscribe: (() => void) | null = null;
  let keepAlive: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(
        encoder.encode(
          sseEncode(
            {
              message: "Subscribed to trade events",
            },
            "ready",
          ),
        ),
      );

      unsubscribe = subscribeTrades((event) => {
        try {
          controller.enqueue(encoder.encode(sseEncode(event, "trade")));
        } catch {
          // Client disconnected.
        }
      });

      keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keep-alive\n\n"));
        } catch {
          // Client disconnected.
        }
      }, 20_000);
    },
    cancel() {
      if (keepAlive) clearInterval(keepAlive);
      if (unsubscribe) unsubscribe();
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
