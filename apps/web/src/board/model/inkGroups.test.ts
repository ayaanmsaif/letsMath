import { describe, expect, it } from "vitest";
import { groupInk } from "./inkGroups";
import type { InkShape } from "./types";

let num = 0;
/** A short "letter" stroke: a 12-wide, 20-tall zigzag with its top-left at (x, y). */
function letter(x: number, y: number, overrides: Partial<InkShape> = {}): InkShape {
  num++;
  return {
    id: `s${num}`,
    num,
    z: num,
    createdAt: num * 100,
    author: "student",
    color: "#000",
    size: "m",
    type: "ink",
    tool: "pen",
    simulatePressure: true,
    points: [
      [x, y + 20, 0.5],
      [x + 6, y, 0.5],
      [x + 12, y + 20, 0.5],
    ],
    ...overrides,
  };
}

describe("groupInk", () => {
  it("groups letters and words on one line together", () => {
    const line = [letter(0, 0), letter(16, 0), letter(32, 0), letter(60, 2), letter(76, 1)];
    const groups = groupInk(line);
    expect(groups).toHaveLength(1);
    expect(groups[0].strokeIds).toHaveLength(5);
  });

  it("keeps separate lines of working apart", () => {
    const first = [letter(0, 0), letter(16, 0)];
    const second = [letter(0, 40), letter(16, 40)];
    expect(groupInk([...first, ...second])).toHaveLength(2);
  });

  it("names a group after its lowest stroke number and orders groups top to bottom", () => {
    const lower = letter(0, 200);
    const upper = [letter(0, 0), letter(16, 0)];
    const groups = groupInk([lower, ...upper]);
    expect(groups.map((g) => g.id)).toEqual([`g${upper[0].num}`, `g${lower.num}`]);
  });

  const drawLine = (from: [number, number], to: [number, number]): InkShape => {
    num++;
    return {
      id: `s${num}`,
      num,
      z: num,
      createdAt: num * 100,
      author: "student",
      color: "#000",
      size: "m",
      type: "ink",
      tool: "pen",
      simulatePressure: true,
      points: Array.from({ length: 12 }, (_, i) => {
        const t = i / 11;
        return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, 0.5] as [number, number, number];
      }),
    };
  };

  // Strokes that meet belong together, however big the figure is.
  it("keeps a figure drawn in several strokes as one group", () => {
    const triangle = [drawLine([840, 240], [840, 440]), drawLine([840, 440], [990, 440]), drawLine([990, 440], [840, 240])];
    const groups = groupInk(triangle);
    expect(groups).toHaveLength(1);
    expect(groups[0].strokeIds).toHaveLength(3);
  });

  // The reported bug: "13" written along the hypotenuse, close enough to touch
  // it, was swallowed by the triangle, so the tutor could only circle the lot.
  it("keeps a label written right beside a figure's edge separate", () => {
    const triangle = [drawLine([300, 200], [300, 420]), drawLine([300, 420], [500, 420]), drawLine([500, 420], [300, 200])];
    // The hypotenuse passes within about 15px of these digits.
    const thirteen = [letter(424, 292), letter(436, 292)];

    const groups = groupInk([...triangle, ...thirteen]);
    const figure = groups.find((g) => g.strokeIds.includes(triangle[0].id));
    const label = groups.find((g) => g.strokeIds.includes(thirteen[0].id));

    expect(figure!.strokeIds).toHaveLength(3);
    expect(label!.strokeIds).toEqual(thirteen.map((s) => s.id));
  });

  // A label written inside a big figure must stay its own group, or the tutor
  // has no way to point at just the label.
  it("keeps a label inside a large figure separate from the figure", () => {
    const line = (from: [number, number], to: [number, number]): InkShape => {
      num++;
      return {
        id: `s${num}`,
        num,
        z: num,
        createdAt: num * 100,
        author: "student",
        color: "#000",
        size: "m",
        type: "ink",
        tool: "pen",
        simulatePressure: true,
        points: Array.from({ length: 12 }, (_, i) => {
          const t = i / 11;
          return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, 0.5] as [number, number, number];
        }),
      };
    };

    // A right-angled triangle, drawn big.
    const triangle = [line([840, 240], [840, 440]), line([840, 440], [990, 440]), line([990, 440], [840, 240])];
    // "13" written inside it, well clear of the lines.
    const label = [letter(940, 300), letter(956, 300)];

    const groups = groupInk([...triangle, ...label]);
    const labelGroup = groups.find((g) => g.strokeIds.includes(label[0].id));

    expect(labelGroup).toBeDefined();
    expect(labelGroup!.strokeIds).not.toContain(triangle[0].id);
    expect(labelGroup!.box.maxX - labelGroup!.box.minX).toBeLessThan(80);
  });

  it("ignores highlighter strokes and tutor ink", () => {
    const shapes = [
      letter(0, 0),
      letter(16, 0, { tool: "highlighter" }),
      letter(32, 0, { author: "tutor" }),
    ];
    const groups = groupInk(shapes);
    expect(groups).toHaveLength(1);
    expect(groups[0].strokeIds).toHaveLength(1);
  });
});
