// Geometry for the tutor's annotations (PLAN.md §4, "Tutor rendering").
//
// Marks are drawn the way a teacher draws them: loops overshoot, lines wobble,
// nothing is mechanically perfect. Each annotation seeds its own randomness
// from its id, so it looks the same every time it's drawn or re-rendered.

export type Pt = [number, number];
export type Box = [number, number, number, number];

/** Small deterministic PRNG (mulberry32), seeded from the annotation id. */
function seededRandom(seed: string): () => number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
  }
  let state = hash >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * A loop around a box, drawn as an ellipse with a little wobble and an
 * overshoot past the start, like a circled answer.
 */
export function circleAround(box: Box, seed: string, padding = 10): Pt[] {
  const random = seededRandom(seed);
  const cx = (box[0] + box[2]) / 2;
  const cy = (box[1] + box[3]) / 2;
  // A loop must look like a loop: never thinner than this, and never so wide
  // and flat that it reads as a bar.
  const MIN_RADIUS = 14;
  const MAX_ASPECT = 5;
  let rx = Math.max((box[2] - box[0]) / 2 + padding, MIN_RADIUS);
  let ry = Math.max((box[3] - box[1]) / 2 + padding, MIN_RADIUS);
  if (rx / ry > MAX_ASPECT) ry = rx / MAX_ASPECT;
  if (ry / rx > MAX_ASPECT) rx = ry / MAX_ASPECT;
  // Start near the top-left of the loop and come back round past the start.
  const start = Math.PI * (0.85 + random() * 0.2);
  const sweep = Math.PI * 2 + Math.PI * (0.12 + random() * 0.12);
  const steps = 44;

  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const angle = start + sweep * t;
    // Wobble eases in and out so the ends stay tidy.
    const wobble = Math.sin(t * Math.PI) * (0.03 + random() * 0.02);
    return [
      cx + Math.cos(angle) * rx * (1 + wobble),
      cy + Math.sin(angle) * ry * (1 + wobble * 1.2),
    ] as Pt;
  });
}

/** A wobbly line just below a box. */
export function underlineUnder(box: Box, seed: string, gap = 6): Pt[] {
  const random = seededRandom(seed);
  const y = box[3] + gap;
  const steps = 10;
  const drop = (box[2] - box[0]) * 0.015;

  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    return [
      lerp(box[0] - 2, box[2] + 4, t),
      y + Math.sin(t * Math.PI) * drop + (random() - 0.5) * 1.6,
    ] as Pt;
  });
}

/** A translucent highlighter sweep across a box: the centre line to stroke along. */
export function highlightThrough(box: Box): { path: Pt[]; thickness: number } {
  const midY = (box[1] + box[3]) / 2;
  return {
    path: [
      [box[0] - 3, midY],
      [box[2] + 3, midY],
    ],
    thickness: Math.max(14, box[3] - box[1] + 6),
  };
}

/** A teacher's tick, as one stroke. */
export function tickAt([x, y]: Pt, size: number): Pt[] {
  return [
    [x, y],
    [x + size * 0.34, y + size * 0.42],
    [x + size, y - size * 0.62],
  ];
}

/** A cross, as two strokes. */
export function crossAt([x, y]: Pt, size: number): Pt[][] {
  const r = size / 2;
  return [
    [
      [x - r, y - r],
      [x + r, y + r],
    ],
    [
      [x + r, y - r],
      [x - r, y + r],
    ],
  ];
}

/** An arrow: the shaft plus the two head strokes. */
export function arrowStrokes(from: Pt, to: Pt, seed: string): Pt[][] {
  const random = seededRandom(seed);
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const head = Math.max(10, Math.min(26, length * 0.18));
  const spread = Math.PI / 7;
  // A hand-drawn shaft bows very slightly to one side.
  const bow = (random() - 0.5) * Math.min(12, length * 0.06);
  const midX = (from[0] + to[0]) / 2 - Math.sin(angle) * bow;
  const midY = (from[1] + to[1]) / 2 + Math.cos(angle) * bow;

  const shaft: Pt[] = Array.from({ length: 13 }, (_, i) => {
    const t = i / 12;
    // Quadratic through the bowed midpoint.
    const x = (1 - t) ** 2 * from[0] + 2 * (1 - t) * t * midX + t ** 2 * to[0];
    const y = (1 - t) ** 2 * from[1] + 2 * (1 - t) * t * midY + t ** 2 * to[1];
    return [x, y];
  });

  return [
    shaft,
    [
      [to[0] - head * Math.cos(angle - spread), to[1] - head * Math.sin(angle - spread)],
      to,
      [to[0] - head * Math.cos(angle + spread), to[1] - head * Math.sin(angle + spread)],
    ],
  ];
}

/**
 * An arc marking the angle at a vertex, sweeping the short way between the two
 * arms. Also returns where a label should sit, just outside the arc.
 */
export function angleArc(vertex: Pt, p1: Pt, p2: Pt, radius: number): { path: Pt[]; labelAt: Pt } {
  const a1 = Math.atan2(p1[1] - vertex[1], p1[0] - vertex[0]);
  const a2 = Math.atan2(p2[1] - vertex[1], p2[0] - vertex[0]);
  // Take the smaller of the two ways round.
  let delta = a2 - a1;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;

  const steps = 20;
  const path = Array.from({ length: steps + 1 }, (_, i) => {
    const angle = a1 + delta * (i / steps);
    return [vertex[0] + Math.cos(angle) * radius, vertex[1] + Math.sin(angle) * radius] as Pt;
  });

  const middle = a1 + delta / 2;
  return {
    path,
    labelAt: [vertex[0] + Math.cos(middle) * radius * 1.7, vertex[1] + Math.sin(middle) * radius * 1.7],
  };
}

/** A right-angle square, used when an angle is a quarter turn. */
export function isRightAngle(vertex: Pt, p1: Pt, p2: Pt, toleranceDeg = 4): boolean {
  const a1 = Math.atan2(p1[1] - vertex[1], p1[0] - vertex[0]);
  const a2 = Math.atan2(p2[1] - vertex[1], p2[0] - vertex[0]);
  let delta = Math.abs(a2 - a1);
  while (delta > Math.PI) delta = Math.PI * 2 - delta;
  return Math.abs(delta - Math.PI / 2) <= (toleranceDeg * Math.PI) / 180;
}
