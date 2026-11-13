import type { ProviderConfig } from './types';

/** Used when a provider has no prices set. Edit the provider to enter your model's real prices. */
export const DEFAULT_INPUT_PRICE_PER_M = 3;
export const DEFAULT_OUTPUT_PRICE_PER_M = 15;

export function estimateCostUsd(
  provider: Pick<ProviderConfig, 'inputPricePerM' | 'outputPricePerM'> | undefined,
  inputTokens: number,
  outputTokens: number
): number {
  const inPrice = provider?.inputPricePerM ?? DEFAULT_INPUT_PRICE_PER_M;
  const outPrice = provider?.outputPricePerM ?? DEFAULT_OUTPUT_PRICE_PER_M;
  return (inputTokens / 1_000_000) * inPrice + (outputTokens / 1_000_000) * outPrice;
}
