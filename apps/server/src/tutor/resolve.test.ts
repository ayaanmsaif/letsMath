import type { BoardItem } from "@letsmath/shared";
import { describe, expect, it } from "vitest";
import { createResolver, OpError, type SnapshotMapping } from "./resolve";

// The snapshot covers world (100, 50) upwards at half scale: 1 world unit = 0.5 px.
const items: BoardItem[] = [
  {
    id: "g1",
    kind: "handwriting",
    box: [100, 100, 300, 140],
    corners: [
      [100, 140],
      [300, 140],
      [102, 20],
    ],
    sides: [
      { id: "s1", a: [100, 140], b: [300, 140] },
      { id: "s2", a: [300, 140], b: [102, 20] },
      { id: "s3", a: [102, 20], b: [100, 140] },
    ],
  },
  { id: "#12", kind: "shape", box: [400, 200, 460, 240] },
];

const mapping: SnapshotMapping = { origin: [100, 50], scale: 0.5, items, width: 1000, height: 1000 };

function resolver() {
  let n = 0;
  return createResolver(mapping, () => `a${++n}`);
}

describe("resolve", () => {
  it("resolves an id to world units", () => {
    const op = resolver()("circle", { target: { id: "g1", box: null }, color: "mistake", note: null });
    // x: 100 + 100/0.5 = 300, y: 50 + 100/0.5 = 250
    expect(op).toEqual({ id: "a1", kind: "circle", box: [300, 250, 700, 330], color: "mistake", note: null });
  });

  it("snaps a loose box onto the item it overlaps", () => {
    const op = resolver()("highlight", { target: { id: null, box: [110, 105, 290, 150] }, color: "attention" });
    expect(op).toMatchObject({ kind: "highlight", box: [300, 250, 700, 330] });
  });

  it("keeps a box that matches nothing", () => {
    const op = resolver()("highlight", { target: { id: null, box: [900, 900, 950, 950] }, color: "attention" });
    expect(op).toMatchObject({ box: [1900, 1850, 2000, 1950] });
  });

  it("resolves recognised corners and sides", () => {
    const corner = resolver()("circle", { target: { id: "g1.v3", box: null }, color: "tutor", note: null });
    expect(corner).toMatchObject({ box: [304, 90, 304, 90] });
    const side = resolver()("underline", { target: { id: "g1.s1", box: null }, color: "tutor" });
    expect(side).toMatchObject({ box: [300, 330, 700, 330] });
  });

  it("snaps an angle arc to the nearest corner", () => {
    const op = resolver()("angle_arc", {
      vertex: [108, 132], // roughly the bottom-left corner at (100, 140)
      p1: [300, 140],
      p2: [102, 20],
      label: "\\theta",
      color: "tutor",
    });
    // Snapped to (100, 140) → world (300, 330).
    expect(op).toMatchObject({ kind: "angle_arc", vertex: [300, 330], label: "\\theta" });
  });

  it("leaves a vertex alone when no corner is close", () => {
    const op = resolver()("angle_arc", { vertex: [600, 600], p1: [650, 600], p2: [600, 650], label: null, color: "tutor" });
    expect(op).toMatchObject({ vertex: [1300, 1250] });
  });

  it("puts a mark in the margin beside the work", () => {
    const op = resolver()("mark", { target: { id: "#12", box: null }, symbol: "cross" });
    // Right edge 460 + 18 px → world 100 + 478/0.5, vertically centred on 220 px.
    expect(op).toMatchObject({ kind: "mark", at: [1056, 490], symbol: "cross" });
  });

  it("rejects unknown ids and malformed input", () => {
    expect(() => resolver()("circle", { target: { id: "g99", box: null }, color: "mistake", note: null })).toThrow(OpError);
    expect(() => resolver()("circle", { target: { id: "g1", box: null }, color: "purple", note: null })).toThrow(OpError);
  });

  it("treats a lone \"all\" as clear everything, and keeps a list as a list", () => {
    expect(resolver()("erase_drawings", { ids: ["all"] })).toMatchObject({ kind: "erase", ids: "all" });
    expect(resolver()("erase_drawings", { ids: ["a1", "a2"] })).toMatchObject({ kind: "erase", ids: ["a1", "a2"] });
  });

  // A note written on top of the work is unreadable, so it slides clear.
  it("moves a written note off the work it would cover", () => {
    const op = resolver()("write", {
      at: [110, 110], // inside g1's box
      content: "x",
      format: "text",
      size: "m",
      color: "tutor",
    }) as { at: [number, number] };
    // Pushed below g1 (bottom 140 + a small gap), then converted to world units.
    expect(op.at[1]).toBeGreaterThan(50 + 140 / 0.5);
  });

  it("leaves a note in clear space where the tutor put it", () => {
    const op = resolver()("write", {
      at: [700, 700],
      content: "try this",
      format: "text",
      size: "m",
      color: "tutor",
    });
    expect(op).toMatchObject({ kind: "write", at: [1500, 1450] });
  });

  describe("diagrams", () => {
    const spec = {
      points: [
        { name: "A", x: 0, y: 0 },
        { name: "B", x: 4, y: 0 },
        { name: "C", x: 4, y: 3 },
      ],
      polygons: [{ through: ["A", "B", "C"] }],
      segments: [],
      angles: [{ at: "B", from: "A", to: "C", text: "", rightAngle: true }],
      labels: [],
      markedPoints: [],
      near: "g1",
      width: 200,
      caption: "",
    };

    /** Parts come back in world units; this puts them back into snapshot pixels. */
    const pixelBoxOf = (op: { parts: { kind: string; points?: number[][]; at?: number[] }[] }) => {
      const all = op.parts.flatMap((p) => (p.kind === "stroke" ? p.points! : [p.at!]));
      const toPx = (world: number[]) => [(world[0] - 100) * 0.5, (world[1] - 50) * 0.5];
      const pts = all.map(toPx);
      return [
        Math.min(...pts.map((p) => p[0])),
        Math.min(...pts.map((p) => p[1])),
        Math.max(...pts.map((p) => p[0])),
        Math.max(...pts.map((p) => p[1])),
      ];
    };

    it("keeps its part ids so the tutor can point at a side later", () => {
      const op = resolver()("draw_diagram", spec) as { kind: string; parts: { id: string }[] };
      expect(op.kind).toBe("diagram");
      expect(op.parts.map((p) => p.id)).toEqual(expect.arrayContaining(["a1.AB", "a1.BC", "a1.CA", "a1.angle_B"]));
    });

    it("places the diagram in clear space, not over the student's work", () => {
      const op = resolver()("draw_diagram", spec) as never;
      const [x1, y1, x2, y2] = pixelBoxOf(op);
      const overlapsWork = mapping.items.some(
        (item) => x1 < item.box[2] && x2 > item.box[0] && y1 < item.box[3] && y2 > item.box[1],
      );
      expect(overlapsWork).toBe(false);
    });

    it("passes a diagram mistake back as something the tutor can fix", () => {
      const broken = { ...spec, segments: [{ from: "A", to: "Z", dashed: false }] };
      expect(() => resolver()("draw_diagram", broken)).toThrow(/No point called Z/);
    });
  });

  it("explains when a point or box is the wrong length", () => {
    expect(() => resolver()("arrow", { from: [1], to: [2, 3], label: null, color: "tutor" })).toThrow(
      /two numbers/,
    );
    expect(() =>
      resolver()("circle", { target: { id: null, box: [1, 2, 3] }, color: "mistake", note: null }),
    ).toThrow(/four numbers/);
  });
});
