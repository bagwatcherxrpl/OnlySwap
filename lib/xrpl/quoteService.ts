import Decimal from "decimal.js";
import { Client, Currency } from "xrpl";
import { Asset } from "@/lib/assets/types";
import { calculateServiceFeeXrp, estimateInputValueInXrp } from "@/lib/fees/serviceFee";
import { describeRoute } from "@/lib/xrpl/routeDescription";
import { withXrplClient } from "@/lib/xrpl/client";
import { QuoteRequest, QuoteResponse, RouteKind } from "@/lib/xrpl/types";

function classifyRoute(inputAsset: Asset, outputAsset: Asset): RouteKind {
  if (inputAsset.kind === "native" || outputAsset.kind === "native") return "viaXrp";
  if (inputAsset.kind === "issued" && outputAsset.kind === "issued" && inputAsset.issuer === outputAsset.issuer) {
    return "direct";
  }
  return "multiHop";
}

export async function buildQuote(req: QuoteRequest): Promise<QuoteResponse> {
  const amount = new Decimal(req.inputAmount || "0");
  const {
    inputXrpRate,
    networkFeeDrops,
    bestRouteKind,
    estimatedOutput,
    priceImpactPct,
    warnings,
  } = await getLiveQuoteInputs(
    req.inputAsset,
    req.outputAsset,
    amount,
  );

  const inputValueInXrp = estimateInputValueInXrp({
    isInputXrp: req.inputAsset.kind === "native",
    inputAmount: amount,
    quotedInputXrpRate: inputXrpRate,
  });

  const fee = calculateServiceFeeXrp(inputValueInXrp);
  return {
    estimatedOutput: Decimal.max(estimatedOutput, 0).toFixed(6),
    inputXrpRate: inputXrpRate.toFixed(6),
    serviceFeeXrp: fee.feeXrp,
    serviceFeeDrops: fee.feeDrops,
    networkFeeDrops,
    routeKind: bestRouteKind,
    routeSummary: describeRoute(bestRouteKind),
    priceImpactPct: priceImpactPct.toFixed(2),
    expiresAt: Date.now() + 30_000,
    warnings: [
      ...(req.outputAsset.kind === "issued" && !req.outputAsset.verified
        ? ["Custom asset. Verify issuer before trading."]
        : []),
      ...warnings,
    ],
  };
}

async function getLiveQuoteInputs(
  inputAsset: Asset,
  outputAsset: Asset,
  amount: Decimal,
): Promise<{
  inputXrpRate: Decimal;
  estimatedOutput: Decimal;
  bestRouteKind: RouteKind;
  networkFeeDrops: string;
  priceImpactPct: Decimal;
  warnings: string[];
}> {
  const warnings: string[] = [];
  try {
    return await withXrplClient(async (client) => {
      const serverInfo = await client.request({ command: "server_info" });
      const feeXrp = Number(serverInfo.result.info.validated_ledger?.base_fee_xrp ?? "0.00001");
      const networkFeeDrops = new Decimal(feeXrp).mul(1_000_000).ceil().toFixed(0);
      const inputXrpRate = await fetchBestPairRateToXrp(client, inputAsset);
      const directQuote = await fetchBestPairQuote(client, inputAsset, outputAsset, amount);
      const viaXrpQuote = await fetchQuoteViaXrp(client, inputAsset, outputAsset, amount);

      let bestRouteKind: RouteKind =
        inputAsset.kind === "issued" && outputAsset.kind === "issued" ? "multiHop" : "viaXrp";
      let bestMidPerOne = new Decimal(0);
      let bestExecutionPerOne = new Decimal(0);

      if (directQuote.executionPerOne.gt(bestExecutionPerOne)) {
        bestExecutionPerOne = directQuote.executionPerOne;
        bestMidPerOne = directQuote.midPerOne;
        bestRouteKind =
          inputAsset.kind === "issued" && outputAsset.kind === "issued" ? "direct" : "viaXrp";
      }
      if (viaXrpQuote.executionPerOne.gt(bestExecutionPerOne)) {
        bestExecutionPerOne = viaXrpQuote.executionPerOne;
        bestMidPerOne = viaXrpQuote.midPerOne;
        bestRouteKind = "viaXrp";
      }

      if (directQuote.warnings.length) warnings.push(...directQuote.warnings);
      if (viaXrpQuote.warnings.length) warnings.push(...viaXrpQuote.warnings);

      if (bestExecutionPerOne.lte(0)) {
        warnings.push("Live route depth unavailable. Using conservative fallback estimate.");
      }

      const fallbackPerOne = fallbackOutputPerInput(inputAsset, outputAsset);
      const finalPerOne = bestExecutionPerOne.gt(0) ? bestExecutionPerOne : fallbackPerOne;
      const estimatedOutput = finalPerOne.mul(amount);
      const effectiveMidPerOne = bestMidPerOne.gt(0) ? bestMidPerOne : finalPerOne;
      const priceImpactPct = computePriceImpactPct(effectiveMidPerOne, finalPerOne);

      return {
        inputXrpRate: inputXrpRate.gt(0) ? inputXrpRate : fallbackInputXrpRate(inputAsset),
        estimatedOutput,
        bestRouteKind,
        networkFeeDrops: networkFeeDrops || "12",
        priceImpactPct,
        warnings,
      };
    });
  } catch {
    return {
      inputXrpRate: fallbackInputXrpRate(inputAsset),
      estimatedOutput: fallbackOutputPerInput(inputAsset, outputAsset).mul(amount),
      bestRouteKind: classifyRoute(inputAsset, outputAsset),
      networkFeeDrops: "12",
      priceImpactPct: new Decimal(0),
      warnings: ["Live quote failed. Using fallback estimate."],
    };
  }
}

async function fetchBestPairRateToXrp(
  client: Client,
  asset: Asset,
): Promise<Decimal> {
  if (asset.kind === "native") return new Decimal(1);
  return fetchBestPairRate(client, asset, { kind: "native", symbol: "XRP", name: "XRP", verified: true, curated: true });
}

type PairQuote = {
  midPerOne: Decimal;
  executionPerOne: Decimal;
  warnings: string[];
};

async function fetchQuoteViaXrp(
  client: Client,
  inputAsset: Asset,
  outputAsset: Asset,
  amount: Decimal,
): Promise<PairQuote> {
  const warnings: string[] = [];
  const xrpAsset: Asset = { kind: "native", symbol: "XRP", name: "XRP", verified: true, curated: true };
  const firstLeg = await fetchBestPairQuote(client, inputAsset, xrpAsset, amount);
  const xrpReceived = firstLeg.executionPerOne.mul(amount);
  if (xrpReceived.lte(0)) {
    return { midPerOne: new Decimal(0), executionPerOne: new Decimal(0), warnings: firstLeg.warnings };
  }
  const secondLeg = await fetchBestPairQuote(client, xrpAsset, outputAsset, xrpReceived);
  warnings.push(...firstLeg.warnings, ...secondLeg.warnings);
  const combinedMid = firstLeg.midPerOne.mul(secondLeg.midPerOne);
  const combinedExecution = firstLeg.executionPerOne.mul(secondLeg.executionPerOne);
  return { midPerOne: combinedMid, executionPerOne: combinedExecution, warnings };
}

async function fetchBestPairQuote(
  client: Client,
  inputAsset: Asset,
  outputAsset: Asset,
  amount: Decimal,
): Promise<PairQuote> {
  if (inputAsset.kind === "native" && outputAsset.kind === "native") {
    return { midPerOne: new Decimal(1), executionPerOne: new Decimal(1), warnings: [] };
  }

  const [ammQuote, bookQuote] = await Promise.all([
    fetchAmmPairQuote(client, inputAsset, outputAsset, amount),
    fetchBookPairQuote(client, inputAsset, outputAsset, amount),
  ]);

  const best = ammQuote.executionPerOne.gte(bookQuote.executionPerOne) ? ammQuote : bookQuote;
  return best;
}

async function fetchBestPairRate(
  client: Client,
  inputAsset: Asset,
  outputAsset: Asset,
): Promise<Decimal> {
  const quote = await fetchBestPairQuote(client, inputAsset, outputAsset, new Decimal(1));
  return quote.executionPerOne;
}

async function fetchAmmPairQuote(
  client: Client,
  inputAsset: Asset,
  outputAsset: Asset,
  amount: Decimal,
): Promise<PairQuote> {
  try {
    const amm = await client.request({
      command: "amm_info",
      asset: toXrplCurrency(inputAsset),
      asset2: toXrplCurrency(outputAsset),
    });

    const ammData = amm.result.amm as
      | { amount?: { value?: string } | string; amount2?: { value?: string } | string }
      | undefined;

    const inReserve = parseAmountToDecimal(ammData?.amount, inputAsset);
    const outReserve = parseAmountToDecimal(ammData?.amount2, outputAsset);
    if (!inReserve || !outReserve || amount.lte(0)) {
      return { midPerOne: new Decimal(0), executionPerOne: new Decimal(0), warnings: [] };
    }
    if (inReserve.lte(0) || outReserve.lte(0)) {
      return { midPerOne: new Decimal(0), executionPerOne: new Decimal(0), warnings: [] };
    }

    const midPerOne = outReserve.div(inReserve);
    const outputAmount = outReserve.minus(inReserve.mul(outReserve).div(inReserve.plus(amount)));
    if (outputAmount.lte(0)) {
      return { midPerOne, executionPerOne: new Decimal(0), warnings: [] };
    }
    return { midPerOne, executionPerOne: outputAmount.div(amount), warnings: [] };
  } catch {
    return { midPerOne: new Decimal(0), executionPerOne: new Decimal(0), warnings: [] };
  }
}

async function fetchBookPairQuote(
  client: Client,
  inputAsset: Asset,
  outputAsset: Asset,
  amount: Decimal,
): Promise<PairQuote> {
  try {
    if (amount.lte(0)) {
      return { midPerOne: new Decimal(0), executionPerOne: new Decimal(0), warnings: [] };
    }

    const book = await client.request({
      command: "book_offers",
      taker_gets: toBookOfferCurrency(outputAsset),
      taker_pays: toBookOfferCurrency(inputAsset),
      limit: 50,
    });

    const offers = (book.result.offers ?? []) as Array<{
      TakerGets?: unknown;
      TakerPays?: unknown;
    }>;
    if (!offers.length) return { midPerOne: new Decimal(0), executionPerOne: new Decimal(0), warnings: [] };

    let remainingInput = amount;
    let totalOutput = new Decimal(0);
    let bestRate = new Decimal(0);

    for (const offer of offers) {
      if (remainingInput.lte(0)) break;
      const gets = parseAmountToDecimal(offer.TakerGets, outputAsset);
      const pays = parseAmountToDecimal(offer.TakerPays, inputAsset);
      if (!gets || !pays || gets.lte(0) || pays.lte(0)) continue;
      const rate = gets.div(pays);
      if (bestRate.lte(0)) bestRate = rate;
      const takeInput = Decimal.min(remainingInput, pays);
      totalOutput = totalOutput.plus(takeInput.mul(rate));
      remainingInput = remainingInput.minus(takeInput);
    }

    if (totalOutput.lte(0)) return { midPerOne: bestRate, executionPerOne: new Decimal(0), warnings: [] };

    const warnings: string[] = [];
    if (remainingInput.gt(0)) {
      warnings.push("Orderbook depth is thin for this trade size.");
    }

    return {
      midPerOne: bestRate,
      executionPerOne: totalOutput.div(amount),
      warnings,
    };
  } catch {
    return { midPerOne: new Decimal(0), executionPerOne: new Decimal(0), warnings: [] };
  }
}

function computePriceImpactPct(midPerOne: Decimal, executionPerOne: Decimal): Decimal {
  if (midPerOne.lte(0) || executionPerOne.lte(0)) return new Decimal(0);
  const impact = midPerOne.minus(executionPerOne).div(midPerOne).mul(100);
  return Decimal.max(impact, 0);
}

function parseAmountToDecimal(raw: unknown, asset: Asset): Decimal | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    if (asset.kind === "native") return new Decimal(raw).div(1_000_000);
    return new Decimal(raw);
  }
  if (typeof raw === "object" && "value" in (raw as Record<string, unknown>)) {
    const v = (raw as { value?: unknown }).value;
    if (typeof v === "string") return new Decimal(v);
  }
  return null;
}

function toXrplCurrency(asset: Asset): Currency {
  if (asset.kind === "native") return { currency: "XRP" };
  return { currency: asset.currency, issuer: asset.issuer };
}

function toBookOfferCurrency(
  asset: Asset,
): { currency: string; issuer?: string } {
  if (asset.kind === "native") return { currency: "XRP" };
  return { currency: asset.currency, issuer: asset.issuer };
}

function fallbackInputXrpRate(asset: Asset): Decimal {
  if (asset.kind === "native") return new Decimal(1);
  if (asset.symbol === "RLUSD") return new Decimal("1");
  return new Decimal("0.8");
}

function fallbackOutputPerInput(inputAsset: Asset, outputAsset: Asset): Decimal {
  if (inputAsset.kind === "native" && outputAsset.kind === "issued") {
    if (outputAsset.symbol === "RLUSD") return new Decimal("1");
    return new Decimal("0.9");
  }
  if (inputAsset.kind === "issued" && outputAsset.kind === "native") {
    if (inputAsset.symbol === "RLUSD") return new Decimal("1");
    return new Decimal("0.9");
  }
  if (inputAsset.kind === "issued" && outputAsset.kind === "issued") {
    return new Decimal("1");
  }
  return new Decimal("1");
}
