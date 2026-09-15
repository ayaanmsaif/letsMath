import { describe, expect, it } from "vitest";
import { costUsd, priceFor, worstCaseUsd } from "./cost";

describe("priceFor", () => {
  it("matches model ids and dated snapshots", () => {
    expect(priceFor("claude-sonnet-5")).toEqual({ input: 2, output: 10 });
    expect(priceFor("claude-haiku-4-5-20251001")).toEqual({ input: 1, output: 5 });
    expect(priceFor("claude-opus-5")).toEqual({ input: 5, output: 25 });
  });

  it("prices unknown models conservatively", () => {
    expect(priceFor("claude-something-new").input).toBeGreaterThanOrEqual(10);
    // A prefix must match a whole segment: sonnet-50 isn't sonnet-5.
    expect(priceFor("claude-sonnet-50")).not.toEqual({ input: 2, output: 10 });
  });
});

describe("costUsd", () => {
  it("prices plain input and output", () => {
    // 1M input at $2 + 100k output at $10 = $3.00
    expect(costUsd("claude-sonnet-5", { input_tokens: 1_000_000, output_tokens: 100_000 })).toBeCloseTo(3);
  });

  it("applies cache write and read multipliers", () => {
    const usage = {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 1_000_000,
      cache_read_input_tokens: 1_000_000,
    };
    // writes 1.25 × $2 + reads 0.1 × $2 = $2.70
    expect(costUsd("claude-sonnet-5", usage)).toBeCloseTo(2.7);
  });

  it("separates 1-hour cache writes when the breakdown is present", () => {
    const usage = {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 1_000_000,
      cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 1_000_000 },
    };
    expect(costUsd("claude-haiku-4-5", usage)).toBeCloseTo(2);
  });

  it("halves batch requests", () => {
    const usage = { input_tokens: 1_000_000, output_tokens: 0 };
    expect(costUsd("claude-opus-5", usage, { batch: true })).toBeCloseTo(2.5);
  });
});

describe("worstCaseUsd", () => {
  it("assumes uncached input and the full output allowance", () => {
    // 10k input × $2 × 1.25 + 8k output × $10 = $0.105
    expect(worstCaseUsd("claude-sonnet-5", 10_000, 8_000)).toBeCloseTo(0.105);
  });
});
