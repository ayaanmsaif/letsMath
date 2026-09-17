import { describe, expect, it } from "vitest";
import { resolvePoints, type ConstructionInput, type Vec2 } from "./points";

const made = (
  name: string,
  kind: ConstructionInput["kind"],
  of: string[],
  extra: Partial<ConstructionInput> = {},
): ConstructionInput => ({ name, kind, of, angle: 0, distance: 0, ...extra });

const square = [
  { name: "A", x: 0, y: 0 },
  { name: "B", x: 4, y: 0 },
  { name: "C", x: 4, y: 4 },
  { name: "D", x: 0, y: 4 },
];

const expectAt = (point: Vec2 | undefined, x: number, y: number) => {
  expect(point).toBeDefined();
  expect(point![0]).toBeCloseTo(x, 9);
  expect(point![1]).toBeCloseTo(y, 9);
};

describe("resolvePoints", () => {
  it("keeps points given by coordinates", () => {
    expectAt(resolvePoints(square, []).get("C"), 4, 4);
  });

  it("finds a midpoint", () => {
    expectAt(resolvePoints(square, [made("M", "midpoint", ["A", "C"])]).get("M"), 2, 2);
  });

  it("finds where two lines meet", () => {
    // The diagonals of a square cross at its centre.
    expectAt(resolvePoints(square, [made("X", "intersection", ["A", "C", "B", "D"])]).get("X"), 2, 2);
  });

  it("finds where lines meet beyond the points that define them", () => {
    const more = [...square, { name: "E", x: 6, y: 1 }, { name: "F", x: 6, y: 3 }];
    expectAt(resolvePoints(more, [made("X", "intersection", ["A", "B", "E", "F"])]).get("X"), 6, 0);
  });

  it("drops a perpendicular onto a line", () => {
    const slope = [
      { name: "P", x: 0, y: 4 },
      { name: "Q", x: 0, y: 0 },
      { name: "R", x: 4, y: 4 },
    ];
    // QR is the line y = x, and the nearest point on it to (0, 4) is (2, 2).
    expectAt(resolvePoints(slope, [made("F", "foot", ["P", "Q", "R"])]).get("F"), 2, 2);
  });

  it("places a point by distance and angle, so the tutor never does the trig", () => {
    const origin = [{ name: "O", x: 0, y: 0 }];
    const onCircle = resolvePoints(origin, [made("P", "polar", ["O"], { angle: 30, distance: 1 })]);
    expectAt(onCircle.get("P"), Math.sqrt(3) / 2, 0.5);

    // The top of a 5 m ladder leaning at 65°.
    const ladder = resolvePoints(origin, [made("T", "polar", ["O"], { angle: 65, distance: 5 })]);
    expectAt(ladder.get("T"), 5 * Math.cos((65 * Math.PI) / 180), 5 * Math.sin((65 * Math.PI) / 180));

    // Past 90° the point is on the left, as angles go anticlockwise.
    const obtuse = resolvePoints(origin, [made("Q", "polar", ["O"], { angle: 150, distance: 2 })]);
    expect(obtuse.get("Q")![0]).toBeLessThan(0);
  });

  it("builds on points that were themselves constructed", () => {
    const points = resolvePoints(square, [made("M", "midpoint", ["A", "B"]), made("N", "midpoint", ["M", "C"])]);
    expectAt(points.get("N"), 3, 2);
  });

  it("explains what it needs instead of guessing", () => {
    // AB and DC are both horizontal.
    expect(() => resolvePoints(square, [made("X", "intersection", ["A", "B", "D", "C"])])).toThrow(/parallel/);
    expect(() => resolvePoints(square, [made("M", "midpoint", ["A"])])).toThrow(/built from the two ends/);
    expect(() => resolvePoints(square, [made("M", "midpoint", ["A", "Z"])])).toThrow(/Z, which isn't defined before it/);
    expect(() => resolvePoints(square, [made("A", "midpoint", ["B", "C"])])).toThrow(/defined twice/);
    expect(() => resolvePoints(square, [made("F", "foot", ["C", "A", "A"])])).toThrow(/two different points/);
  });
});
