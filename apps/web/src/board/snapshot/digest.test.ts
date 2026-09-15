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
});
