import type { NormalizedUsage } from "../agents/usage.js";
import type { RemoteClawConfig } from "../config/config.js";

/**
 * A single tier in a tiered-pricing schedule.  Prices are expressed as
 * USD per-million tokens, just like the flat `ModelCostConfig` fields.
 *
 * `range` is a half-open interval `[start, end)` expressed in *input*
 * token counts.  The tiers MUST be sorted in ascending `range[0]` order
 * with no gaps.
 */
export type PricingTier = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  /** [startTokens, endTokens) — half-open interval on the input token axis. */
  range: [number, number];
};

type RawPricingTier = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  range: [number, number] | [number];
};

export type ModelCostConfig = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  /** Optional tiered pricing tiers.  When present, `estimateUsageCost`
   *  uses them instead of the flat rates above.  The flat rates still
   *  serve as the "default / first-tier" fallback for callers that are
   *  unaware of tiered pricing. */
  tieredPricing?: PricingTier[];
};

export type UsageTotals = {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  total?: number;
};

export function formatTokenCount(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) {
    return "0";
  }
  const safe = Math.max(0, value);
  if (safe >= 1_000_000) {
    return `${(safe / 1_000_000).toFixed(1)}m`;
  }
  if (safe >= 1_000) {
    const precision = safe >= 10_000 ? 0 : 1;
    const formattedThousands = (safe / 1_000).toFixed(precision);
    if (Number(formattedThousands) >= 1_000) {
      return `${(safe / 1_000_000).toFixed(1)}m`;
    }
    return `${formattedThousands}k`;
  }
  return String(Math.round(safe));
}

export function formatUsd(value?: number): string | undefined {
  if (value === undefined || !Number.isFinite(value)) {
    return undefined;
  }
  if (value >= 1) {
    return `$${value.toFixed(2)}`;
  }
  if (value >= 0.01) {
    return `$${value.toFixed(2)}`;
  }
  return `$${value.toFixed(4)}`;
}

export function resolveModelCostConfig(params: {
  provider?: string;
  model?: string;
  config?: RemoteClawConfig;
}): ModelCostConfig | undefined {
  const provider = params.provider?.trim();
  const model = params.model?.trim();
  if (!provider || !model) {
    return undefined;
  }
  const providers = params.config?.models?.providers ?? {};
  const entry = providers[provider]?.models?.find((item) => item.id === model);
  return entry?.cost;
}

const toNumber = (value: number | undefined): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

function selectPricingTier(tiers: PricingTier[], input: number): PricingTier | undefined {
  const sortedTiers = tiers.toSorted((a, b) => a.range[0] - b.range[0]);
  if (sortedTiers.length === 0) {
    return undefined;
  }
  if (input <= 0) {
    return sortedTiers[0];
  }

  for (const tier of sortedTiers) {
    const [start, end] = tier.range;
    if (input >= start && input < end) {
      return tier;
    }
  }

  for (let index = sortedTiers.length - 1; index >= 0; index -= 1) {
    const tier = sortedTiers[index];
    if (input >= tier.range[0]) {
      return tier;
    }
  }

  return sortedTiers[0];
}

function computeTieredCost(
  tiers: PricingTier[],
  input: number,
  output: number,
  cacheRead: number,
  cacheWrite: number,
): number {
  const tier = selectPricingTier(tiers, input);
  if (!tier) {
    return 0;
  }

  return (
    input * tier.input +
    output * tier.output +
    cacheRead * tier.cacheRead +
    cacheWrite * tier.cacheWrite
  );
}

export function estimateUsageCost(params: {
  usage?: NormalizedUsage | UsageTotals | null;
  cost?: ModelCostConfig;
}): number | undefined {
  const usage = params.usage;
  const cost = params.cost;
  if (!usage || !cost) {
    return undefined;
  }
  const input = toNumber(usage.input);
  const output = toNumber(usage.output);
  const cacheRead = toNumber(usage.cacheRead);
  const cacheWrite = toNumber(usage.cacheWrite);

  let total: number;
  if (cost.tieredPricing && cost.tieredPricing.length > 0) {
    total = computeTieredCost(cost.tieredPricing, input, output, cacheRead, cacheWrite);
  } else {
    total =
      input * cost.input +
      output * cost.output +
      cacheRead * cost.cacheRead +
      cacheWrite * cost.cacheWrite;
  }

  if (!Number.isFinite(total)) {
    return undefined;
  }
  return total / 1_000_000;
}
