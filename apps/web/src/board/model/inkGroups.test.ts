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
