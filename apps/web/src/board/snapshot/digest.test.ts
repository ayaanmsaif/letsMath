import { describe, expect, it } from "vitest";
import type { InkShape, RectShape, TextShape } from "../model/types";
import { buildDigest, type SnapshotFrame } from "./digest";

const base = { z: 1, author: "student" as const, color: "#000", size: "m" as const, createdAt: 0 };

function stroke(num: number, x: number, y: number): InkShape {
  return {
    ...base,
    id: `s${num}`,
    num,
    type: "ink",
    tool: "pen",
    simulatePressure: true,
    points: [
      [x, y + 20, 0.5],
      [x + 6, y, 0.5],
      [x + 12, y + 20, 0.5],
    ],
  };
}

const text: TextShape = { ...base, id: "s10", num: 10, type: "text", x: 100, y: 200, w: 120, h: 30, text: "sin 30° = 1/2", fontSize: 24 };
const farRect: RectShape = { ...base, id: "s11", num: 11, type: "rect", x: 5000, y: 5000, w: 50, h: 50 };

// A 1000×500 world view rendered at half size.
const frame: SnapshotFrame = { box: { minX: 0, minY: 0, maxX: 1000, maxY: 500 }, width: 500, height: 250, scale: 0.5 };

describe("buildDigest", () => {
  const shapes = [stroke(1, 100, 100), stroke(2, 116, 100), text, farRect];

  it("lists handwriting groups and shapes in snapshot pixels", () => {
    const { text: digest } = buildDigest(shapes, frame, new Map());
    expect(digest).toContain("Snapshot: 500×250 px");
    expect(digest).toMatch(/\* g1 \[\d+, \d+, \d+, \d+\] 2 strokes/);
    expect(digest).toContain('* #10 text [50, 100, 110, 115] "sin 30° = 1/2"');
    expect(digest).toContain("Outside this view: 1 more item.");
  });

  it("marks only new or changed items once the tutor has seen the board", () => {
    const first = buildDigest(shapes, frame, new Map());
    const unchanged = buildDigest(shapes, frame, first.seen);
    expect(unchanged.text).not.toMatch(/^\*/m);

    const edited = { ...text, text: "sin 30° = √3/2" };
    const changed = buildDigest([stroke(1, 100, 100), stroke(2, 116, 100), edited, farRect], frame, first.seen);
    expect(changed.text).toContain("* #10 text");
    expect(changed.text).toMatch(/^ {2}g1 /m);
  });

  it("says when the view is empty", () => {
    expect(buildDigest([], frame, new Map()).text).toContain("Nothing is written in this view.");
  });

  it("lists every item in structured form for the server to resolve", () => {
    const { items } = buildDigest(shapes, frame, new Map());
    const group = items.find((i) => i.kind === "handwriting");
    const typed = items.find((i) => i.id === "#10");

    expect(group).toBeDefined();
    expect(typed).toMatchObject({ kind: "shape", box: [50, 100, 110, 115] });
    // Off-screen shapes aren't offered as targets.
    expect(items.some((i) => i.id === "#11")).toBe(false);
  });
});

/** Points from a to b, with a little wobble so it looks hand-drawn. */
function strokeAlong(num: number, from: [number, number], to: [number, number], seed: number): InkShape {
  let random = seed;
  const wobble = () => {
    random = (random * 9301 + 49297) % 233280;
    return random / 233280 - 0.5;
  };
  return {
    ...base,
    id: `t${num}`,
    num,
    type: "ink",
    tool: "pen",
    simulatePressure: true,
    points: Array.from({ length: 16 }, (_, i) => {
      const t = i / 15;
      return [from[0] + (to[0] - from[0]) * t + wobble() * 6, from[1] + (to[1] - from[1]) * t + wobble() * 6, 0.5];
    }),
  };
}

describe("recognised figures", () => {
  // A triangle in world units that lands on tidy pixel coordinates in this frame.
  const triangle = [
    strokeAlong(20, [400, 1000], [1200, 1000], 3),
    strokeAlong(21, [1200, 1000], [410, 444], 9),
    strokeAlong(22, [410, 444], [400, 1000], 15),
  ];
  const wideFrame: SnapshotFrame = { box: { minX: 0, minY: 0, maxX: 2000, maxY: 2000 }, width: 1000, height: 1000, scale: 0.5 };

  it("notes what a hand-drawn figure looks like", () => {
    const { text } = buildDigest(triangle, wideFrame, new Map());
    expect(text).toContain("looks like a triangle");
  });

  it("offers the corners and sides as targets", () => {
    const { items } = buildDigest(triangle, wideFrame, new Map());
    const figure = items.find((i) => i.kind === "handwriting");

    expect(figure?.corners).toHaveLength(3);
    expect(figure?.sides?.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
    // Corners are in snapshot pixels, so roughly half the world coordinates.
    const corners = figure!.corners!;
    for (const target of [
      [200, 500],
      [600, 500],
      [205, 222],
    ]) {
      expect(Math.min(...corners.map((c) => Math.hypot(c[0] - target[0], c[1] - target[1])))).toBeLessThan(10);
    }
  });
});
