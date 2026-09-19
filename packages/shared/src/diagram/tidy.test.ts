import { describe, expect, it } from "vitest";
import { checkMaths, checkMathsSchema } from "../checkMaths";
import { diagramSpecSchema } from "./schema";
import { tidyCheckInput, tidyDiagramInput } from "./tidy";

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

  // Seen for real: asked to check 5cos65 against 2.7, the model slipped out of
  // JSON and left tag markup in `at`. Its expression and claim were both fine,
  // and the student ended up with no answer at all.
  it("rescues a check whose expression was right all along", () => {
    const sent = {
      expr: "5*cos(65)",
      claim: "2.7",
      at: `</antml${"_"}parameter>\n<parameter name="degrees">true`,
      degrees: true,
    };
    const tidied = checkMathsSchema.safeParse(tidyCheckInput(sent));
    expect(tidied.error?.issues ?? []).toEqual([]);
    expect(tidied.data).toMatchObject({ expr: "5*cos(65)", claim: "2.7", at: "" });
    expect(checkMaths(tidied.data!)).toMatch(/2\.7 is wrong/);
  });

  it("keeps values that really are values", () => {
    const tidied = tidyCheckInput({ expr: "2*x+5", claim: "13", at: "x = 4", degrees: false });
    expect(tidied).toMatchObject({ at: "x = 4", degrees: false });
    expect(checkMaths(checkMathsSchema.parse(tidied))).toMatch(/is right/);
  });

  // Seen in the eval, repeatedly: a midpoint has no angle and no distance, so
  // the tutor leaves them out, and the whole diagram was refused for it.
  it("fills in the fields an entry has no reason to give", () => {
    const result = parsed({
      points: [
        { name: "A", x: 0, y: 0 },
        { name: "B", x: 4, y: 0 },
      ],
      constructions: [{ name: "M", kind: "midpoint", of: ["A", "B"] }],
      circles: [{ centre: "M", through: "A" }],
      markedPoints: [{ at: "M" }],
    });
    expect(result.error?.issues ?? []).toEqual([]);
    expect(result.data?.constructions[0]).toMatchObject({ angle: 0, distance: 0 });
    expect(result.data?.circles[0]).toMatchObject({ radius: 0, attention: false });
    expect(result.data?.markedPoints[0]).toMatchObject({ text: "", dot: false });
  });

  it("leaves anything that could make the maths wrong to be refused", () => {
    // A circle with no centre is not a tidying problem; it's a broken drawing.
    expect(parsed({ points: [{ name: "O", x: 0, y: 0 }], circles: [{ radius: 10 }] }).success).toBe(false);
    // And a point with no coordinates stays missing.
    expect(parsed({ points: [{ name: "O" }] }).success).toBe(false);
  });
});
