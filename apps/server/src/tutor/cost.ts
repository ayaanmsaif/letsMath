// Claude list prices, used to price every response for the spend ledger.
// Source: Claude API pricing (USD per million tokens).

export interface ModelPrice {
  input: number;
  output: number;
}

const PRICES: [prefix: string, price: ModelPrice][] = [
  ["claude-fable-5", { input: 10, output: 50 }],
  ["claude-mythos-5", { input: 10, output: 50 }],
  ["claude-opus-5", { input: 5, output: 25 }],
  ["claude-opus-4-8", { input: 5, output: 25 }],
  ["claude-opus-4-7", { input: 5, output: 25 }],
  ["claude-opus-4-6", { input: 5, output: 25 }],
  ["claude-opus-4-5", { input: 5, output: 25 }],
  ["claude-sonnet-5", { input: 2, output: 10 }],
  ["claude-sonnet-4-6", { input: 3, output: 15 }],
  ["claude-sonnet-4-5", { input: 3, output: 15 }],
  ["claude-haiku-4-5", { input: 1, output: 5 }],
];

/** Unknown models are priced like the most expensive older tier, so the budget guard never undercounts. */
const FALLBACK: ModelPrice = { input: 15, output: 75 };

const CACHE_READ = 0.1;
const CACHE_WRITE_5M = 1.25;
const CACHE_WRITE_1H = 2;
const BATCH_DISCOUNT = 0.5;

export function priceFor(model: string): ModelPrice {
  return PRICES.find(([prefix]) => model === prefix || model.startsWith(`${prefix}-`))?.[1] ?? FALLBACK;
}

/** The token counts the API reports in `response.usage`. */
export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation?: {
    ephemeral_5m_input_tokens?: number | null;
    ephemeral_1h_input_tokens?: number | null;
  } | null;
}

export function costUsd(model: string, usage: Usage, options: { batch?: boolean } = {}): number {
  const price = priceFor(model);
  const write1h = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  const write5m =
    usage.cache_creation?.ephemeral_5m_input_tokens ?? Math.max(0, (usage.cache_creation_input_tokens ?? 0) - write1h);
  const read = usage.cache_read_input_tokens ?? 0;

  const inputUnits = usage.input_tokens + write5m * CACHE_WRITE_5M + write1h * CACHE_WRITE_1H + read * CACHE_READ;
  const total = (inputUnits * price.input + usage.output_tokens * price.output) / 1_000_000;
  return options.batch ? total * BATCH_DISCOUNT : total;
}

/** Most a single request could cost: every input token uncached plus the full output allowance. */
export function worstCaseUsd(model: string, inputTokens: number, maxOutputTokens: number): number {
  const price = priceFor(model);
  return (inputTokens * price.input * CACHE_WRITE_5M + maxOutputTokens * price.output) / 1_000_000;
}
