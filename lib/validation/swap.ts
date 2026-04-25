import Decimal from "decimal.js";
import { z } from "zod";

const amountString = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/)
  .refine((v) => {
    try {
      const d = new Decimal(v);
      return d.gt(0) && d.dp() <= 16;
    } catch {
      return false;
    }
  }, "Invalid amount");

export const quoteRequestSchema = z.object({
  inputAsset: z.string().min(1).max(180),
  outputAsset: z.string().min(1).max(180),
  inputAmount: amountString,
});

export const prepareSwapSchema = quoteRequestSchema.extend({
  account: z.string().trim().min(25).max(50),
  walletId: z.enum(["xaman", "joey"]),
  quoteExpiresAt: z.number().int().positive().optional(),
});

export function isQuoteExpired(expiresAt: number, nowMs = Date.now()): boolean {
  return nowMs >= expiresAt;
}
