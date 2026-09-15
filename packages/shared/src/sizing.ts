// Claude image sizing. Snapshots are pre-resized with this so Claude never
// resizes them server-side, which keeps the pixel coordinates it returns exact.
// Reference: https://platform.claude.com/docs/en/build-with-claude/vision-coordinates

export interface ImageTier {
  maxEdge: number;
  maxTokens: number;
}

export const STANDARD_TIER: ImageTier = { maxEdge: 1568, maxTokens: 1568 };
export const HIGH_RES_TIER: ImageTier = { maxEdge: 2576, maxTokens: 4784 };

/** Claude 4.7 and later models see images at high resolution; everything else is standard. */
export function imageTierForModel(model: string): ImageTier {
  return /^claude-(?:opus|sonnet|fable|mythos)-(?:5|4-7|4-8)(?:$|-)/.test(model)
    ? HIGH_RES_TIER
    : STANDARD_TIER;
}

/** Visual tokens consumed by an image: one token per 28x28 pixel patch. */
export function countImageTokens(width: number, height: number): number {
  return Math.ceil(width / 28) * Math.ceil(height / 28);
}

/** Round half to even, matching how the API resolves exact .5 ties. */
function roundTiesToEven(value: number): number {
  const floor = Math.floor(value);
  if (value - floor !== 0.5) return Math.round(value);
  return floor % 2 === 0 ? floor : floor + 1;
}

/**
 * The largest aspect-preserving size, as [width, height], at which Claude will
 * not resize an image. Images that already fit the tier's limits are returned
 * unchanged.
 *
 * Follows the docs' reference algorithm, except that when the short edge lands
 * on an exact .5 tie the size must fit whichever way the tie rounds. The docs
 * table and reference code disagree on those ties (2000x1500 gives 1269x952 in
 * the table but 1270x952 in the code), and a pre-resized snapshot must never be
 * resized by the API.
 */
export function resizedSize(
  width: number,
  height: number,
  tier: ImageTier = STANDARD_TIER,
): [number, number] {
  const fits = (w: number, h: number) =>
    Math.ceil(w / 28) * 28 <= tier.maxEdge &&
    Math.ceil(h / 28) * 28 <= tier.maxEdge &&
    countImageTokens(w, h) <= tier.maxTokens;

  if (fits(width, height)) return [width, height];
  if (height > width) {
    const [resizedH, resizedW] = resizedSize(height, width, tier);
    return [resizedW, resizedH];
  }

  // Binary search along the long edge for the largest aspect-preserving size that fits.
  const aspectRatio = width / height;
  const shortEdge = (longEdge: number) => Math.max(roundTiesToEven(longEdge / aspectRatio), 1);
  const shortEdgeRoundedUp = (longEdge: number) => Math.max(Math.round(longEdge / aspectRatio), 1);
  let lo = 1; // always fits
  let hi = width; // never fits
  while (lo + 1 < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (fits(mid, shortEdge(mid)) && fits(mid, shortEdgeRoundedUp(mid))) lo = mid;
    else hi = mid;
  }
  return [lo, shortEdge(lo)];
}
