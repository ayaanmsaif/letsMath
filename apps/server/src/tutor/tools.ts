// The tutor's drawing tools (PLAN.md §4a), built from the shared schemas so the
// validator and the model see the same contract.
import type Anthropic from "@anthropic-ai/sdk";
import {
  boardOpNames,
  checkMathsSchema,
  CHECK_MATHS_TOOL,
  jsonSchemaFor,
  toToolSchema,
  type BoardOpName,
} from "@letsmath/shared";

const DESCRIPTIONS: Record<BoardOpName, string> = {
  circle:
    "Draw a hand-drawn loop around something on the board to draw the student's eye to it. Best for the line, term, or angle you're talking about.",
  highlight: "Sweep a translucent highlighter over something, for emphasis rather than error.",
  underline: "Underline something, for a term or result worth noting.",
  mark: "Put a teacher's tick, cross, or question mark beside a piece of work. Use sparingly and never before you've explained why.",
  arrow: "Draw an arrow from one point to another, to connect a hint to the work it refers to.",
  angle_arc:
    "Mark an angle with a small arc and an optional label. The vertex snaps to a detected corner when one is close, so give the corner's approximate position.",
  write:
    "Write a short note, correction, or piece of maths on the board. Use format \"latex\" for maths. Place it in clear space, never over the student's work.",
  draw_diagram:
    "Draw a figure or a graph from scratch: a triangle for the question, a unit circle, a ladder against a wall, or y = sin x on axes. For a figure, give named points in maths coordinates and say what to draw between them: polygons, segments, circles, arcs, angle marks and labels. Never work out a coordinate with trigonometry yourself — build the point with a construction instead: polar for a point at a distance and angle (the top of a 5 m ladder at 65°, a point on the unit circle), or midpoint, intersection, or the foot of a perpendicular. For a graph, give the axes range and the functions to plot, written plainly as sin(x) or x^2-3; the board samples the real curve, so never list the points of a curve yourself. Either way the board works out every line, arc, tick and label, so your numbers only need to be mathematically right, not positioned on screen. It goes in clear space near what you name in near.",
  erase_drawings: "Remove your own earlier annotations by id, or pass \"all\" to clear everything you've drawn.",
};

/**
 * Strict mode compiles a grammar per tool, and all of them share one size
 * budget. The diagram schema is far bigger than the rest put together, so it
 * opts out: every call is still validated against the same zod schema on the
 * way in, and a bad one comes back to the tutor as a message it can act on.
 */
const NON_STRICT: BoardOpName[] = ["draw_diagram"];

/**
 * The tutor's tools, with input streaming on so each drawing can be applied
 * the moment its call finishes rather than at the end of the reply.
 */
export const boardTools: Anthropic.Tool[] = [
  ...boardOpNames.map((name) => ({
    name,
    description: DESCRIPTIONS[name],
    strict: !NON_STRICT.includes(name),
    eager_input_streaming: true,
    input_schema: jsonSchemaFor(name) as Anthropic.Tool["input_schema"],
  })),
  {
    // Not a drawing: the board works the number out and tells the tutor, which
    // then decides what to say. Its schema is small enough to stay strict.
    name: CHECK_MATHS_TOOL,
    description:
      "Work out a number exactly, or check one, using the board's own arithmetic. Use it before you tell a student that a value is right or wrong, and before you state a value yourself: give expr as the working (5*cos(65)) and claim as the answer being checked (2.7), or leave claim empty to just get the value. It also checks a solution by putting it back in (expr 2*x+5, claim 13, at x=4), and tells whether two expressions are the same ((x+1)^2 against x^2+2*x+1). The answer comes straight back, in the same turn.",
    strict: true,
    eager_input_streaming: true,
    input_schema: toToolSchema(checkMathsSchema) as Anthropic.Tool["input_schema"],
  },
];

/** Guidance that belongs with the tools rather than the persona. */
export const TOOL_GUIDANCE = `## Drawing on the board

You can draw on the board with the tools provided. They are how you point at things: mark the work rather than describing where it is in words.

- Always say something to the student first, even when they only asked you to draw ("Here it is — the 13 is circled."). A reply that is only a drawing looks broken. Then make your tool calls; your turn ends after them, and you'll see whether each one worked alongside the student's next message.
- Target by id whenever you can (g4, #12, or a recognised part like g4.v1 for a corner and g4.s2 for a side). Ids are exact. Only fall back to a box in snapshot pixels when nothing fits.
- At most three annotations per turn, and only where they help. A tidy board teaches better than a decorated one.
- To show a graph, use draw_diagram with axes and plots rather than describing the shape of a curve in words. Ask for pi ticks on trig graphs, and equal scales only when the shape must stay true, such as a circle.
- Never work a number out in your head. Before you tell a student their value is right or wrong, and before you state one yourself, call check_maths — it uses the same exact arithmetic the board draws with. Telling a student their correct work is wrong costs their trust, and you don't get it back.
- Colours carry meaning: "mistake" for an error, "correct" for work that's right, "attention" to draw the eye, "tutor" for your own writing.
- You may only change your own annotations. Never try to alter or erase the student's work.`;
