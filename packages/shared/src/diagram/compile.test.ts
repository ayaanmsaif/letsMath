import { describe, expect, it } from "vitest";
import { compileDiagram, DiagramError, type DiagramPart } from "./compile";
import type { DiagramSpec } from "./schema";

const empty = {
  points: [],
  polygons: [],
  segments: [],
  angles: [],
  labels: [],
  markedPoints: [],
  axes: [],
  plots: [],
  near: "",
  width: 360,
  caption: "",
};

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

describe("compileDiagram: graphs", () => {
  const axes = {
    xMin: 0,
    xMax: Math.PI * 2,
    yMin: -1.2,
    yMax: 1.2,
    xLabel: "x",
    yLabel: "y",
    xStep: 0,
    yStep: 0.5,
    piTicks: true,
    grid: false,
    equalScale: false,
  };
  const sine: DiagramSpec = {
    ...empty,
    axes: [axes],
    plots: [{ expr: "sin(x)", from: 0, to: 0, label: "y = \\sin x", attention: false }],
  };
  const texts = (parts: DiagramPart[]) => parts.filter((p) => p.kind === "label").map((p) => p.text);

  it("draws the curve from the function itself, not from guessed points", () => {
    const { parts } = compile(sine);
    const curve = stroke(parts, "d1.plot1");
    const axis = stroke(parts, "d1.xaxis");
    const [left, right] = [axis.points[0][0], axis.points[1][0]];

    // A sine wave peaks a quarter of the way along 0 to 2π…
    const peak = curve.points.reduce((best, p) => (p[1] < best[1] ? p : best));
    expect(Math.abs((peak[0] - left) / (right - left) - 0.25)).toBeLessThan(0.01);
    // …and crosses back through the axis at π, halfway along.
    const midX = (left + right) / 2;
    const crossing = curve.points.reduce((best, p) => (Math.abs(p[0] - midX) < Math.abs(best[0] - midX) ? p : best));
    expect(crossing[1]).toBeCloseTo(axis.points[0][1], 0);
  });

  it("ticks a trig graph in multiples of pi", () => {
    const written = texts(compile(sine).parts);
    expect(written).toEqual(expect.arrayContaining(["\\frac{\\pi}{2}", "\\pi", "\\frac{3\\pi}{2}", "2\\pi"]));
    // The origin is ticked once, not once per axis.
    expect(written.filter((t) => t === "0")).toHaveLength(0);
  });

  it("breaks a curve at an asymptote rather than drawing through it", () => {
    const tangent: DiagramSpec = {
      ...empty,
      axes: [{ ...axes, xMin: -Math.PI, xMax: Math.PI, yMin: -4, yMax: 4, yStep: 2 }],
      plots: [{ expr: "tan(x)", from: 0, to: 0, label: "", attention: false }],
    };
    const pieces = compile(tangent).parts.filter((p) => p.id.startsWith("d1.plot1"));
    expect(pieces.length).toBeGreaterThan(1);
  });

  it("scales both axes alike when the shape has to stay true", () => {
    const diagonal: DiagramSpec = {
      ...empty,
      axes: [{ ...axes, xMin: -1, xMax: 1, yMin: -1, yMax: 1, xStep: 1, yStep: 1, piTicks: false, equalScale: true }],
      plots: [{ expr: "x", from: 0, to: 0, label: "", attention: false }],
    };
    const curve = stroke(compile(diagonal).parts, "d1.plot1");
    const [first, last] = [curve.points[0], curve.points[curve.points.length - 1]];
    // y = x has to come out at 45°, however wide the space it was given is.
    expect(Math.abs(last[0] - first[0])).toBeCloseTo(Math.abs(last[1] - first[1]), 6);
  });

  it("keeps the graph, numbers included, inside the space it was given", () => {
    const { box } = compile({ ...sine, axes: [{ ...axes, yMin: -1.25, yMax: 1.25, grid: true }] });
    expect(box[0]).toBeGreaterThanOrEqual(placement.x);
    expect(box[1]).toBeGreaterThanOrEqual(placement.y);
    expect(box[2]).toBeLessThanOrEqual(placement.x + placement.width);
    expect(box[3]).toBeLessThanOrEqual(placement.y + placement.height);
  });

  // Seen in a real graph: "y = cos x" landed on the axis among the tick numbers,
  // and the axis name "x" sat on top of the 2π tick.
  it("keeps the writing around a graph from overlapping", () => {
    const both: DiagramSpec = {
      ...sine,
      plots: [
        { expr: "sin(x)", from: 0, to: 0, label: "y = \\sin x", attention: false },
        { expr: "cos(x)", from: 0, to: 0, label: "y = \\cos x", attention: true },
      ],
    };
    const { parts } = compile(both);
    const axisY = stroke(parts, "d1.xaxis").points[0][1];
    const first = label(parts, "d1.plot1_label");
    const second = label(parts, "d1.plot2_label");

    // The tick numbers sit just under the axis, so a curve's name can't go there.
    for (const name of [first, second]) expect(Math.abs(name.at[1] - axisY)).toBeGreaterThan(24);
    // Nor on each other.
    expect(Math.abs(first.at[1] - second.at[1]) > 20 || Math.abs(first.at[0] - second.at[0]) > 80).toBe(true);
    // The axis name goes above the line, clear of the last tick number below it.
    expect(label(parts, "d1.xlabel").at[1]).toBeLessThan(axisY);
  });

  // The pi fractions were shifted left by half their character count, and
  // \frac{3\pi}{2} is fourteen characters but draws about as wide as two, so
  // every one of them landed on its neighbour.
  it("leaves centring tick numbers to the renderer, which can measure them", () => {
    const wide: DiagramSpec = { ...sine, axes: [{ ...axes, xMin: -Math.PI * 2, xMax: Math.PI * 2 }] };
    const { parts } = compile(wide);
    const numbers = parts.filter(
      (p): p is Extract<DiagramPart, { kind: "label" }> => p.kind === "label" && p.id.startsWith("d1.xnum"),
    );
    expect(numbers.length).toBeGreaterThan(6);
    for (const number of numbers) expect(number.anchor).toBe("top-centre");

    // Each number sits exactly on its own tick, whatever it happens to say.
    expect(label(parts, "d1.xnum2").at[0]).toBeCloseTo(stroke(parts, "d1.xtick2").points[0][0], 6);
    expect(label(parts, "d1.ynum1").anchor).toBe("middle-right");

    // And no two of them are close enough to collide once drawn.
    const across = numbers.map((n) => (n as { at: [number, number] }).at[0]).sort((a, b) => a - b);
    for (let i = 1; i < across.length; i++) expect(across[i] - across[i - 1]).toBeGreaterThan(30);
  });

  // A domain straddling zero puts the y-axis up the middle of the plot, which
  // wrote its numbers across the curves and printed both curve names together.
  it("keeps a graph's writing clear when the axes straddle zero", () => {
    const wide: DiagramSpec = {
      ...sine,
      axes: [{ ...axes, xMin: -Math.PI * 2, xMax: Math.PI * 2, grid: true }],
      plots: [
        { expr: "sin(x)", from: 0, to: 0, label: "y = \\sin x", attention: false },
        { expr: "cos(x)", from: 0, to: 0, label: "y = \\cos x", attention: true },
      ],
    };
    const { parts } = compile(wide);

    // The numbers go in the left margin, not beside an axis in mid-plot.
    const plotLeft = Math.min(...stroke(parts, "d1.xaxis").points.map((p) => p[0]));
    expect(label(parts, "d1.ynum1").at[0]).toBeLessThanOrEqual(plotLeft);

    // And the two curve names end up on separate lines.
    const first = label(parts, "d1.plot1_label");
    const second = label(parts, "d1.plot2_label");
    expect(Math.abs(first.at[1] - second.at[1]) >= 22 || Math.abs(first.at[0] - second.at[0]) > 80).toBe(true);
  });

  it("draws the grid faintly, so it guides the eye instead of caging the curve", () => {
    const { parts } = compile({ ...sine, axes: [{ ...axes, grid: true }] });
    const grid = parts.filter((p) => p.id.startsWith("d1.grid"));
    expect(grid.length).toBeGreaterThan(4);
    expect(grid.every((p) => p.kind === "stroke" && p.faint)).toBe(true);
    // The axes and the curve are not part of that: they stay at full weight.
    expect(stroke(parts, "d1.xaxis").faint).toBe(false);
    expect(stroke(parts, "d1.plot1").faint).toBe(false);
  });

  it("says what it couldn't read instead of drawing an empty graph", () => {
    const bad = (expr: string): DiagramSpec => ({ ...sine, plots: [{ expr, from: 0, to: 0, label: "", attention: false }] });
    expect(() => compile(bad("wibble(x)"))).toThrow(/wibble/);
    expect(() => compile(bad("x+100"))).toThrow(/never comes into view/);
    expect(() => compile({ ...empty, plots: sine.plots })).toThrow(/needs axes/);
  });
});
