import { describe, expect, it } from "vitest";
import { compileDiagram, DiagramError, type DiagramPart } from "./compile";
import type { DiagramSpec } from "./schema";

const empty = { points: [], polygons: [], segments: [], angles: [], labels: [], markedPoints: [], near: "", width: 360, caption: "" };

/** The classic 3-4-5 triangle: right angle at B, θ at A, sides labelled. */
const triangle: DiagramSpec = {
  ...empty,
  points: [
    { name: "A", x: 0, y: 0 },
    { name: "B", x: 4, y: 0 },
    { name: "C", x: 4, y: 3 },
  ],
  polygons: [{ through: ["A", "B", "C"] }],
  angles: [
    { at: "B", from: "A", to: "C", text: "", rightAngle: true },
    { at: "A", from: "B", to: "C", text: "\\theta", rightAngle: false },
  ],
  labels: [{ from: "A", to: "B", text: "4", attention: false }],
  markedPoints: [{ at: "C", text: "C" }],
};

const placement = { x: 100, y: 100, width: 400, height: 300 };
const compile = (spec: DiagramSpec = triangle) => compileDiagram(spec, placement, "d1");

const stroke = (parts: DiagramPart[], id: string) => {
  const part = parts.find((p) => p.id === id);
  if (!part || part.kind !== "stroke") throw new Error(`no stroke ${id}`);
  return part;
};
const label = (parts: DiagramPart[], id: string) => {
  const part = parts.find((p) => p.id === id);
  if (!part || part.kind !== "label") throw new Error(`no label ${id}`);
  return part;
};

describe("compileDiagram", () => {
  it("draws each side as its own addressable part", () => {
    expect(compile().parts.map((p) => p.id)).toEqual(
      expect.arrayContaining(["d1.AB", "d1.BC", "d1.CA", "d1.angle_B", "d1.angle_A", "d1.label_A", "d1.side_AB", "d1.point_C"]),
    );
  });

  it("flips maths coordinates so up is up on screen", () => {
    const { parts } = compile();
    const ab = stroke(parts, "d1.AB");
    const bc = stroke(parts, "d1.BC");
    // C is above B in maths, so its screen y must be smaller.
    expect(bc.points[1][1]).toBeLessThan(ab.points[1][1]);
    // B is to the right of A.
    expect(ab.points[1][0]).toBeGreaterThan(ab.points[0][0]);
  });

  it("marks a right angle with a square whose arms are perpendicular", () => {
    const square = stroke(compile().parts, "d1.angle_B");
    expect(square.points).toHaveLength(3);
    const [p, q, r] = square.points;
    const armA = [p[0] - q[0], p[1] - q[1]];
    const armB = [r[0] - q[0], r[1] - q[1]];
    expect(armA[0] * armB[0] + armA[1] * armB[1]).toBeCloseTo(0, 6);
  });

  it("sweeps an angle arc on the inside of the figure", () => {
    const { parts } = compile();
    const arc = stroke(parts, "d1.angle_A");
    const corner = stroke(parts, "d1.AB").points[0];
    const radii = arc.points.map((p) => Math.hypot(p[0] - corner[0], p[1] - corner[1]));
    for (const r of radii) expect(r).toBeCloseTo(radii[0], 6);

    // The middle of the arc points into the triangle, not away from it.
    const middle = arc.points[Math.floor(arc.points.length / 2)];
    const far = stroke(parts, "d1.BC").points[1];
    const toMiddle = [middle[0] - corner[0], middle[1] - corner[1]];
    const toFar = [far[0] - corner[0], far[1] - corner[1]];
    expect(toMiddle[0] * toFar[0] + toMiddle[1] * toFar[1]).toBeGreaterThan(0);
  });

  it("puts a side label outside the figure", () => {
    const { parts } = compile();
    // AB is the bottom edge in maths, so its label sits below it: larger screen y.
    expect(label(parts, "d1.side_AB").at[1]).toBeGreaterThan(stroke(parts, "d1.AB").points[0][1]);
  });

  it("keeps the whole drawing, labels included, inside the space it was given", () => {
    const { box } = compile();
    expect(box[0]).toBeGreaterThanOrEqual(placement.x);
    expect(box[1]).toBeGreaterThanOrEqual(placement.y);
    expect(box[2]).toBeLessThanOrEqual(placement.x + placement.width);
    expect(box[3]).toBeLessThanOrEqual(placement.y + placement.height);
  });

  // Seen in a real diagram: "wall" sat on the vertical line and "ground"
  // collided with the label next to it.
  it("keeps side labels off their own line and apart from each other", () => {
    const rightAngleTriangle: DiagramSpec = {
      ...empty,
      points: [
        { name: "A", x: 0, y: 0 },
        { name: "B", x: 0, y: 4 },
        { name: "C", x: 2, y: 0 },
      ],
      polygons: [{ through: ["A", "B", "C"] }],
      labels: [
        { from: "A", to: "B", text: "wall", attention: false },
        { from: "A", to: "C", text: "ground", attention: false },
        { from: "B", to: "C", text: "5 m", attention: false },
      ],
    };
    const { parts } = compile(rightAngleTriangle);
    const wall = label(parts, "d1.side_AB");
    const ground = label(parts, "d1.side_AC");

    // The wall runs vertically, so its label must be clear of it sideways.
    const wallLine = stroke(parts, "d1.AB").points[0][0];
    expect(Math.abs(wall.at[0] - wallLine)).toBeGreaterThan(8);

    // No two labels land on top of one another.
    const labels = parts.filter((p) => p.kind === "label") as { at: [number, number] }[];
    for (const [i, one] of labels.entries()) {
      for (const other of labels.slice(i + 1)) {
        expect(Math.hypot(one.at[0] - other.at[0], one.at[1] - other.at[1])).toBeGreaterThan(8);
      }
    }
    // The polygon names that side CA (its drawing order), though the label is AC.
    expect(ground.at[1]).toBeGreaterThan(stroke(parts, "d1.CA").points[0][1]);
  });

  it("draws construction lines dashed and skips empty labels", () => {
    const withHeight: DiagramSpec = {
      ...triangle,
      segments: [{ from: "A", to: "C", dashed: true }],
      angles: [{ at: "B", from: "A", to: "C", text: "", rightAngle: false }],
    };
    const { parts } = compile(withHeight);
    expect(stroke(parts, "d1.AC").dashed).toBe(true);
    // An empty angle label draws the arc but writes nothing.
    expect(parts.some((p) => p.id === "d1.angle_B")).toBe(true);
    expect(parts.some((p) => p.id === "d1.label_B")).toBe(false);
  });

  it("explains what's wrong instead of drawing nonsense", () => {
    expect(() => compile({ ...triangle, segments: [{ from: "A", to: "Z", dashed: false }] })).toThrow(/No point called Z/);
    expect(() => compile({ ...triangle, polygons: [{ through: ["A", "B"] }] })).toThrow(DiagramError);
    expect(() => compile({ ...empty, points: [{ name: "A", x: 0, y: 0 }] })).toThrow(/draw nothing/);
  });
});
