import { describe, expect, it } from "vitest";
import { fitWithin, imageProblem } from "./images";

describe("adding a picture", () => {
  it("shrinks a big photo to fit, keeping its shape", () => {
    // A 12 megapixel phone photo, 4:3.
    expect(fitWithin(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3024, 4032, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it("leaves a small picture alone rather than blowing it up", () => {
    expect(fitWithin(320, 200, 1600)).toEqual({ width: 320, height: 200 });
  });

  it("never rounds a sliver away to nothing", () => {
    expect(fitWithin(4000, 3, 1600)).toEqual({ width: 1600, height: 1 });
  });

  it("takes the picture formats a browser can decode", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp", "image/gif"]) {
      expect(imageProblem({ type, size: 2_000_000 })).toBeNull();
    }
  });

  it("refuses an SVG, which can carry scripts", () => {
    expect(imageProblem({ type: "image/svg+xml", size: 2000 })).toMatch(/scripts/);
  });

  it("refuses what isn't a picture, and what's far too big", () => {
    expect(imageProblem({ type: "application/pdf", size: 2000 })).toMatch(/isn't a picture/);
    expect(imageProblem({ type: "image/png", size: 40 * 1024 * 1024 })).toMatch(/too big/);
  });
});
