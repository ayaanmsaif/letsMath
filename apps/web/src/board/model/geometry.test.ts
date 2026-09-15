import { describe, expect, it } from "vitest";
import {
  distToSegment,
  eraserHitsShape,
  hitTestShape,
  segmentsDistance,
  shapeBounds,
  snapAngle,
  transformShape,
  translateShape,
} from "./geometry";
import type { InkShape, LineShape, RectShape } from "./types";

const base = { num: 1, z: 1, author: "student" as const, color: "#000", size: "m" as const, createdAt: 0 };

const ink: InkShape = {
  ...base,
  id: "ink",
  type: "ink",
  tool: "pen",
  simulatePressure: true,
  points: [
    [0, 0, 0.5],
    [100, 0, 0.5],
    [100, 100, 0.5],
  ],
};
const line: LineShape = { ...base, id: "line", type: "line", a: [0, 0], b: [100, 100], arrow: false };
const rect: RectShape = { ...base, id: "rect", type: "rect", x: 10, y: 10, w: 80, h: 40 };

describe("segments", () => {
  it("measures point-to-segment distance", () => {
    expect(distToSegment([50, 10], [0, 0], [100, 0])).toBe(10);
    expect(distToSegment([-3, 4], [0, 0], [100, 0])).toBe(5);
  });

  it("returns 0 for crossing segments and the gap otherwise", () => {
    expect(segmentsDistance([0, 0], [10, 10], [0, 10], [10, 0])).toBe(0);
    expect(segmentsDistance([0, 0], [10, 0], [0, 5], [10, 5])).toBe(5);
  });

  it("snaps angles to 15° steps", () => {
    const [x, y] = snapAngle([0, 0], [100, 3]);
    expect(x).toBeCloseTo(100.045, 2);
    expect(y).toBeCloseTo(0, 6);
  });
});

describe("shapes", () => {
  it("pads ink bounds by half the stroke width", () => {
    expect(shapeBounds(ink)).toEqual({ minX: -2.5, minY: -2.5, maxX: 102.5, maxY: 102.5 });
  });

  it("hit-tests lines with tolerance and closed shapes by their inside", () => {
    expect(hitTestShape(line, [52, 50], 4)).toBe(true);
    expect(hitTestShape(line, [80, 20], 4)).toBe(false);
    expect(hitTestShape(rect, [50, 30], 0)).toBe(true);
    expect(hitTestShape(ink, [50, 50], 4)).toBe(false);
  });

  it("detects the eraser crossing a stroke", () => {
    expect(eraserHitsShape(ink, [50, -20], [50, 20], 4)).toBe(true);
    expect(eraserHitsShape(ink, [50, 20], [50, 60], 4)).toBe(false);
  });

  it("moves ink without touching pressure", () => {
    const moved = translateShape(ink, 10, -5);
    expect(moved.points[1]).toEqual([110, -5, 0.5]);
    expect(moved.id).toBe("ink");
  });

  it("maps a rectangle into a new box", () => {
    const from = { minX: 10, minY: 10, maxX: 90, maxY: 50 };
    const to = { minX: 0, minY: 0, maxX: 160, maxY: 20 };
    expect(transformShape(rect, from, to)).toMatchObject({ x: 0, y: 0, w: 160, h: 20 });
  });
});
