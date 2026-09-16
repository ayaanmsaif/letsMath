import { describe, expect, it } from "vitest";
import { describeRecognition, recognizeShape, type Point } from "./recognize";

/** Points along a-to-b with a little hand wobble, endpoint excluded. */
function wobblyLine(a: Point, b: Point, steps = 14, wobble = 3, seed = 1): Point[] {
  let random = seed;
  const next = () => {
    random = (random * 9301 + 49297) % 233280;
    return random / 233280 - 0.5;
  };
  return Array.from({ length: steps }, (_, i) => {
    const t = i / steps;
    return [a[0] + (b[0] - a[0]) * t + next() * wobble, a[1] + (b[1] - a[1]) * t + next() * wobble] as Point;
  });
}

const A: Point = [200, 500];
const B: Point = [600, 500];
const C: Point = [205, 222];

const nearestDistance = (corners: Point[], target: Point) =>
  Math.min(...corners.map((c) => Math.hypot(c[0] - target[0], c[1] - target[1])));

describe("recognizeShape", () => {
  it("finds the three corners of a wobbly triangle drawn in one stroke", () => {
    const stroke = [...wobblyLine(A, B, 20, 3, 1), ...wobblyLine(B, C, 20, 3, 7), ...wobblyLine(C, A, 20, 3, 13), A];
    const result = recognizeShape([stroke]);

    expect(result.kind).toBe("triangle");
    expect(result.corners).toHaveLength(3);
    for (const target of [A, B, C]) expect(nearestDistance(result.corners, target)).toBeLessThan(8);
    expect(result.sides.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
  });

  it("gives the same answer when the triangle is drawn in three strokes", () => {
    const one = recognizeShape([
      [...wobblyLine(A, B, 20, 3, 1), B],
      [...wobblyLine(B, C, 20, 3, 7), C],
      [...wobblyLine(C, A, 20, 3, 13), A],
    ]);
    expect(one.kind).toBe("triangle");
    expect(one.corners).toHaveLength(3);
    for (const target of [A, B, C]) expect(nearestDistance(one.corners, target)).toBeLessThan(8);
  });

  it("does not call an open V a triangle", () => {
    const v = recognizeShape([[...wobblyLine([100, 100], [200, 300], 16, 2, 3), ...wobblyLine([200, 300], [300, 100], 16, 2, 5)]]);
    expect(v.kind).not.toBe("triangle");
    expect(v.kind).toBe("none");
  });

  it("classifies a rough circle as a circle", () => {
    let random = 11;
    const noise = () => {
      random = (random * 9301 + 49297) % 233280;
      return random / 233280 - 0.5;
    };
    const circle: Point[] = Array.from({ length: 60 }, (_, i) => {
      const angle = (i / 60) * Math.PI * 2;
      const radius = 120 + noise() * 8;
      return [400 + Math.cos(angle) * radius, 300 + Math.sin(angle) * radius];
    });
    const result = recognizeShape([[...circle, circle[0]]]);

    expect(result.kind).toBe("circle");
    expect(result.centre![0]).toBeCloseTo(400, -1);
    expect(result.centre![1]).toBeCloseTo(300, -1);
  });

  it("recognises a squarish quadrilateral and a straight line", () => {
    const square = recognizeShape([
      [
        ...wobblyLine([100, 100], [300, 100], 12, 2, 2),
        ...wobblyLine([300, 100], [300, 300], 12, 2, 4),
        ...wobblyLine([300, 300], [100, 300], 12, 2, 6),
        ...wobblyLine([100, 300], [100, 100], 12, 2, 8),
        [100, 100] as Point,
      ],
    ]);
    expect(square.kind).toBe("quadrilateral");
    expect(square.corners).toHaveLength(4);

    const line = recognizeShape([[...wobblyLine([0, 0], [400, 40], 20, 1.5, 9), [400, 40] as Point]]);
    expect(line.kind).toBe("line");
  });

  it("starts the corner order from the top-left so part ids are stable", () => {
    const corners = (start: Point[]) => recognizeShape([[...start]]).corners[0];
    const shape: Point[] = [
      ...wobblyLine(A, B, 20, 2, 1),
      ...wobblyLine(B, C, 20, 2, 7),
      ...wobblyLine(C, A, 20, 2, 13),
      A,
    ];
    const rotated: Point[] = [...shape.slice(20), ...shape.slice(0, 20)];
    // C is the top-left-most corner of this triangle.
    expect(nearestDistance([corners(shape)], C)).toBeLessThan(8);
    expect(nearestDistance([corners(rotated)], C)).toBeLessThan(8);
  });

  it("describes what it found for the digest", () => {
    const stroke = [...wobblyLine(A, B, 20, 3, 1), ...wobblyLine(B, C, 20, 3, 7), ...wobblyLine(C, A, 20, 3, 13), A];
    expect(describeRecognition(recognizeShape([stroke]))).toMatch(/^looks like a triangle, corners ≈ \(\d+,\d+\)/);
    expect(describeRecognition({ kind: "none", closed: false, corners: [], sides: [] })).toBeNull();
  });
});
