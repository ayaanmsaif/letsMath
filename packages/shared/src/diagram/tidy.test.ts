import { describe, expect, it } from "vitest";
import { diagramSpecSchema } from "./schema";
import { tidyDiagramInput } from "./tidy";

// Written in pieces, because the literal closing tag would confuse the tools
// that read this file — which is rather the point of the bug it comes from.
const LEAKED = `</antml${":"}parameter>\n<parameter name="width">400`;

/** What the tutor sent for "draw a circle with radius 10 with a line y = x through it". */
const realRefusal = {
  axes: [
    {
      xMin: -12,
      xMax: 12,
      yMin: -12,
      yMax: 12,
      xLabel: "x",
      yLabel: "y",
      xStep: 2,
      yStep: 2,
      piTicks: false,
      grid: true,
      equalScale: true,
    },
  ],
  plots: [{ expr: "x", from: -10, to: 10, label: "y = x", attention: false }],
  points: [{ name: "O", x: 0, y: 0 }],
  constructions: [],
  circles: [{ centre: "O", through: "", radius: 10, attention: false }],
  polygons: [],
  segments: [],
  arcs: [],
  angles: [],
  labels: [],
  markedPoints: [],
  near: LEAKED,
  // width never arrived: it was swallowed by the markup above.
};

const parsed = (raw: unknown) => diagramSpecSchema.safeParse(tidyDiagramInput(raw));

describe("tidying what the tutor sent", () => {
  // The drawing was correct: a circle of radius 10 and the line y = x. It was
  // refused twice, and the student was told it hadn't worked.
  it("rescues the drawing that was really refused", () => {
    const result = parsed(realRefusal);
    expect(result.error?.issues ?? []).toEqual([]);
    expect(result.data).toMatchObject({ width: 360, near: "" });
    expect(result.data?.circles[0]).toMatchObject({ centre: "O", radius: 10 });
    expect(result.data?.plots[0]).toMatchObject({ expr: "x" });
  });

  it("fills in the lists and the width that were left out", () => {
    const result = parsed({ points: [{ name: "A", x: 0, y: 0 }], markedPoints: [{ at: "A", text: "A", dot: true }] });
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ width: 360, near: "", polygons: [], arcs: [] });
  });

  it("takes the id out of a sentence, since that's what near means", () => {
    const near = (value: string) => (tidyDiagramInput({ near: value }) as { near: string }).near;
    expect(near("g4")).toBe("g4");
    expect(near("just below the student's working, g1")).toBe("g1");
    expect(near("beside their triangle")).toBe("");
  });

  it("keeps leaked tool markup off the board", () => {
    const result = parsed({
      points: [
        { name: "A", x: 0, y: 0 },
        { name: "B", x: 4, y: 0 },
      ],
      labels: [{ from: "A", to: "B", text: `5 cm ${LEAKED}`, attention: false }],
    });
    expect(result.success).toBe(true);
    expect(result.data?.labels[0].text).not.toMatch(/parameter/);
    expect(result.data?.labels[0].text).toMatch(/^5 cm/);
  });

  it("leaves anything that could make the maths wrong to be refused", () => {
    // A circle with no centre is not a tidying problem; it's a broken drawing.
    expect(parsed({ points: [{ name: "O", x: 0, y: 0 }], circles: [{ radius: 10 }] }).success).toBe(false);
    // And a point with no coordinates stays missing.
    expect(parsed({ points: [{ name: "O" }] }).success).toBe(false);
  });
});
