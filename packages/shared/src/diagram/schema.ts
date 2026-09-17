// What the tutor may draw from scratch (PLAN.md §4b).
//
// The tutor works in maths coordinates with named points, never in pixels: it
// says "A=(0,0), B=(4,0), C=(4,3), triangle ABC, right angle at B" and the
// compiler works out where every line, arc and label goes.
//
// Two API rules shape this schema, both learned the hard way:
//   - strict tools reject fixed-length arrays and maximum lengths, so lengths
//     are checked on the server;
//   - all tools together may use at most 16 nullable or union-typed
//     parameters, so nothing here is nullable. Each kind of thing to draw gets
//     its own list, and "no label" is an empty string.
//
// Drawing order is fixed rather than given: shapes, then construction lines,
// then angle marks, then labels — the order a teacher draws them in.
import { z } from "zod";

const pointName = z.string().max(12);

const namedPoint = z
  .object({
    name: pointName.describe("Short name, e.g. A, B, C."),
    x: z.number(),
    y: z.number(),
  })
  .strict();

const polygon = z
  .object({
    through: z.array(pointName).describe("Point names in order, at least three, e.g. [\"A\",\"B\",\"C\"]."),
  })
  .strict();

const segment = z
  .object({
    from: pointName,
    to: pointName,
    dashed: z.boolean().describe("true for a construction line, such as a height."),
  })
  .strict();

const angle = z
  .object({
    at: pointName.describe("The corner the angle sits at."),
    from: pointName.describe("A point along the first arm."),
    to: pointName.describe("A point along the second arm."),
    text: z.string().max(40).describe("Label such as \\theta or 30^{\\circ}. Empty string for no label."),
    rightAngle: z.boolean().describe("true to draw the usual little square instead of an arc."),
  })
  .strict();

const sideLabel = z
  .object({
    from: pointName,
    to: pointName,
    text: z.string().max(40).describe("What to write beside that side, e.g. 5 cm."),
    attention: z.boolean().describe("true to draw it in the attention colour."),
  })
  .strict();

const markedPoint = z
  .object({
    at: pointName,
    text: z.string().max(20).describe("Name to show beside the point. Empty string to leave it unlabelled."),
  })
  .strict();

const axes = z
  .object({
    xMin: z.number(),
    xMax: z.number(),
    yMin: z.number(),
    yMax: z.number(),
    xLabel: z.string().max(20).describe("Name for the x-axis, such as x. Empty string for none."),
    yLabel: z.string().max(20).describe("Name for the y-axis, such as y. Empty string for none."),
    xStep: z.number().describe("Gap between ticks along x. Use 0 to have them spaced sensibly."),
    yStep: z.number().describe("Gap between ticks along y. Use 0 to have them spaced sensibly."),
    piTicks: z.boolean().describe("true to tick x in multiples of pi, which suits trig graphs."),
    grid: z.boolean().describe("true for faint grid lines behind the curve."),
    equalScale: z
      .boolean()
      .describe(
        "true when x and y must be scaled alike, so a circle stays round. false lets the graph fill its space, which suits y = sin x.",
      ),
  })
  .strict();

const plot = z
  .object({
    expr: z
      .string()
      .max(80)
      .describe("A function of x written plainly, such as sin(x), 2x+1, x^2-3 or sqrt(x). Not LaTeX."),
    from: z.number().describe("Start of the domain. Set from and to both to 0 to use the whole x-axis."),
    to: z.number().describe("End of the domain."),
    label: z.string().max(40).describe("Name to write beside the curve, such as y = \\sin x. Empty string for none."),
    attention: z.boolean().describe("true to draw this curve in the attention colour."),
  })
  .strict();

export const diagramSpecSchema = z
  .object({
    axes: z
      .array(axes)
      .describe("Give one of these to draw a graph with axes. Leave the list empty for a plain figure."),
    plots: z
      .array(plot)
      .describe("Curves to draw on those axes. The board works each one out from the function itself."),
    points: z.array(namedPoint).describe("Every named point, in maths coordinates (y upwards)."),
    polygons: z.array(polygon).describe("Closed shapes joining named points."),
    segments: z.array(segment).describe("Individual lines, for anything not part of a polygon."),
    angles: z.array(angle).describe("Angle marks, with or without labels."),
    labels: z.array(sideLabel).describe("Labels for sides, placed outside the shape."),
    markedPoints: z.array(markedPoint).describe("Points to show with a name."),
    near: z.string().max(40).describe("Id to sit beside, e.g. g4. Empty string to put it anywhere clear."),
    width: z.number().describe("Roughly how wide the diagram should be, in snapshot pixels. 300-450 suits most."),
    caption: z.string().max(80).describe("Short caption under the diagram, or an empty string."),
  })
  .strict();

export type DiagramSpec = z.infer<typeof diagramSpecSchema>;
export type DiagramPoint = z.infer<typeof namedPoint>;
export type DiagramAxes = z.infer<typeof axes>;
