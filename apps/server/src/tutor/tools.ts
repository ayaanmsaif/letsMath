// The tutor's drawing tools (PLAN.md §4a), built from the shared schemas so the
// validator and the model see the same contract.
import type Anthropic from "@anthropic-ai/sdk";
import { boardOpNames, jsonSchemaFor, type BoardOpName } from "@letsmath/shared";

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
  erase_drawings: "Remove your own earlier annotations by id, or pass \"all\" to clear everything you've drawn.",
};

/**
 * Strict tools, with input streaming on so each drawing can be applied the
 * moment its call finishes rather than at the end of the reply.
 */
export const boardTools: Anthropic.Tool[] = boardOpNames.map((name) => ({
  name,
  description: DESCRIPTIONS[name],
  strict: true,
  eager_input_streaming: true,
  input_schema: jsonSchemaFor(name) as Anthropic.Tool["input_schema"],
}));

/** Guidance that belongs with the tools rather than the persona. */
export const TOOL_GUIDANCE = `## Drawing on the board

You can draw on the board with the tools provided. They are how you point at things: mark the work rather than describing where it is in words.

- Always say something to the student first, even when they only asked you to draw ("Here it is — the 13 is circled."). A reply that is only a drawing looks broken. Then make your tool calls; your turn ends after them, and you'll see whether each one worked alongside the student's next message.
- Target by id whenever you can (g4, #12, or a recognised part like g4.v1 for a corner and g4.s2 for a side). Ids are exact. Only fall back to a box in snapshot pixels when nothing fits.
- At most three annotations per turn, and only where they help. A tidy board teaches better than a decorated one.
- Colours carry meaning: "mistake" for an error, "correct" for work that's right, "attention" to draw the eye, "tutor" for your own writing.
- You may only change your own annotations. Never try to alter or erase the student's work.`;
