import { describe, expect, it } from "vitest";
import {
  countImageTokens,
  HIGH_RES_TIER,
  imageTierForModel,
  resizedSize,
  STANDARD_TIER,
} from "./sizing";

// Expected values come from the Claude vision docs tables.
describe("resizedSize", () => {
  it("matches the documented standard-tier examples", () => {
    expect(resizedSize(1075, 1520, STANDARD_TIER)).toEqual([924, 1307]);
    expect(resizedSize(1920, 1080, STANDARD_TIER)).toEqual([1456, 819]);
    expect(resizedSize(2000, 1500, STANDARD_TIER)).toEqual([1269, 952]);
    expect(resizedSize(3840, 2160, STANDARD_TIER)).toEqual([1456, 819]);
    expect(resizedSize(1000, 1000, STANDARD_TIER)).toEqual([1000, 1000]);
  });

  it("matches the documented high-resolution examples", () => {
    expect(resizedSize(1920, 1080, HIGH_RES_TIER)).toEqual([1920, 1080]);
    expect(resizedSize(2000, 1500, HIGH_RES_TIER)).toEqual([2000, 1500]);
    expect(resizedSize(3840, 2160, HIGH_RES_TIER)).toEqual([2576, 1449]);
  });

  it("handles portrait images", () => {
    expect(resizedSize(1080, 1920, STANDARD_TIER)).toEqual([819, 1456]);
  });
});

describe("countImageTokens", () => {
  it("counts 28px patches", () => {
    expect(countImageTokens(200, 200)).toBe(64);
    expect(countImageTokens(1000, 1000)).toBe(1296);
    expect(countImageTokens(1092, 1092)).toBe(1521);
    expect(countImageTokens(2576, 1449)).toBe(4784);
  });
});

describe("imageTierForModel", () => {
  it("puts Claude 4.7+ models on the high-resolution tier", () => {
    for (const model of ["claude-opus-5", "claude-sonnet-5", "claude-opus-4-8", "claude-opus-4-7", "claude-fable-5-1"]) {
      expect(imageTierForModel(model)).toBe(HIGH_RES_TIER);
    }
  });

  it("keeps older models on the standard tier", () => {
    for (const model of ["claude-haiku-4-5", "claude-sonnet-4-6", "claude-opus-4-6"]) {
      expect(imageTierForModel(model)).toBe(STANDARD_TIER);
    }
  });
});
