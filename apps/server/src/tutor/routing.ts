// How hard the tutor should think about this turn (PLAN.md §5).
//
// The eval settled the shape of this. At low effort Sonnet drew every hard
// figure correctly, including a bearing of 060, which Haiku read as a plain
// angle and drew 30 degrees out. What low effort does get wrong is smaller: it
// twice drew without saying anything, which the board papers over. So low is
// the floor, and medium is kept for turns where the tutor has to work out what
// the student means rather than draw what they described.
//
// Effort is a request setting rather than part of the cached prompt, so raising
// it for one turn costs nothing but the thinking itself. Switching *models*
// would rewrite the whole tool prefix, which is why that idea was dropped.
import type { TurnRequest } from "@letsmath/shared";

export type Effort = "low" | "medium" | "high";

/** Asking for help is always a teaching turn, whatever the words are. */
const TEACHING_TRIGGERS = new Set(["hint", "stuck", "check"]);

/**
 * Words that mean the figure has to be worked out rather than transcribed, or
 * that the student wants to understand rather than to see. "Bearing" is here
 * because of a measured failure: bearings run clockwise from north while the
 * board's construction runs anticlockwise from east, and reading one as the
 * other draws a tidy, confident, wrong diagram.
 */
const NEEDS_THOUGHT =
  /\b(why|how come|explain|prove|proof|show that|derive|don't understand|do not understand|confused|stuck|makes no sense|bearing|elevation|depression|word problem|wrong|mistake|check|verify|am i right|is (that|this|it) (right|correct)|did i get)\b/i;

/** Past this, a question is a word problem rather than an instruction. */
const LONG_QUESTION = 160;

export function routeEffort(request: Pick<TurnRequest, "trigger" | "text">): Effort {
  if (TEACHING_TRIGGERS.has(request.trigger)) return "medium";
  if (NEEDS_THOUGHT.test(request.text)) return "medium";
  if (request.text.length > LONG_QUESTION) return "medium";
  return "low";
}
