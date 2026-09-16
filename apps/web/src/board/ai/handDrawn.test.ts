import { describe, expect, it } from "vitest";
import { angleArc, arrowStrokes, circleAround, crossAt, isRightAngle, tickAt, underlineUnder, type Box, type Pt } from "./handDrawn";

const box: Box = [100, 100, 300, 160];

describe("circleAround", () => {
  it("encloses the box it circles", () => {
    const path = circleAround(box, "a1");
    const xs = path.map((p) => p[0]);
    const ys = path.map((p) => p[1]);
    expect(Math.min(...xs)).toBeLessThan(box[0]);
    expect(Math.max(...xs)).toBeGreaterThan(box[2]);
    expect(Math.min(...ys)).toBeLessThan(box[1]);
    expect(Math.max(...ys)).toBeGreaterThan(box[3]);
  });

  it("overshoots the start rather than closing exactly", () => {
    const path = circleAround(box, "a1");
    const gap = Math.hypot(path[0][0] - path.at(-1)![0], path[0][1] - path.at(-1)![1]);
    expect(gap).toBeGreaterThan(1);
  });

  it("draws the same loop for the same annotation, and a different one otherwise", () => {
    expect(circleAround(box, "a1")).toEqual(circleAround(box, "a1"));
    expect(circleAround(box, "a2")).not.toEqual(circleAround(box, "a1"));
  });
});

describe("marks", () => {
  it("puts the underline below the box", () => {
    for (const [, y] of underlineUnder(box, "a1")) expect(y).toBeGreaterThan(box[3]);
  });

  it("draws a tick that dips then rises", () => {
    const [start, dip, end] = tickAt([0, 0], 20);
    expect(dip[1]).toBeGreaterThan(start[1]);
    expect(end[1]).toBeLessThan(dip[1]);
  });

  it("draws a cross as two crossing strokes", () => {
    const [first, second] = crossAt([0, 0], 20);
    expect(first).toHaveLength(2);
    expect(second).toHaveLength(2);
    expect(first[0][0]).toBeCloseTo(second[1][0]);
  });
});

describe("arrowStrokes", () => {
  it("runs from start to end and adds a head at the end", () => {
    const [shaft, head] = arrowStrokes([0, 0], [100, 0], "a1");
    expect(shaft[0]).toEqual([0, 0]);
    expect(shaft.at(-1)).toEqual([100, 0]);
    expect(head[1]).toEqual([100, 0]);
    // The head's barbs sit behind the tip.
    expect(head[0][0]).toBeLessThan(100);
    expect(head[2][0]).toBeLessThan(100);
  });
});

describe("angleArc", () => {
  const vertex: Pt = [0, 0];

  it("sweeps between the two arms and puts the label between them", () => {
    const { path, labelAt } = angleArc(vertex, [100, 0], [0, 100], 20);
    for (const p of path) expect(Math.hypot(p[0], p[1])).toBeCloseTo(20);
    // Between the arms means both coordinates positive here.
    expect(labelAt[0]).toBeGreaterThan(0);
    expect(labelAt[1]).toBeGreaterThan(0);
  });

  it("takes the short way round, not the reflex angle", () => {
    const { path } = angleArc(vertex, [100, 0], [-100, 10], 20);
    // Every point stays on the side the arms are closest through.
    expect(path.every((p) => p[1] >= -0.001)).toBe(true);
  });

  it("spots a right angle", () => {
    expect(isRightAngle(vertex, [50, 0], [0, 50])).toBe(true);
    expect(isRightAngle(vertex, [50, 0], [40, 40])).toBe(false);
  });
});
