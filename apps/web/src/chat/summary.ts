import type { ResolvedOp } from "@letsmath/shared";

const PHRASES: Record<ResolvedOp["kind"], string> = {
  circle: "circled it",
  highlight: "highlighted it",
  underline: "underlined it",
  mark: "marked it",
  arrow: "added an arrow",
  angle_arc: "marked the angle",
  write: "written it on the board",
  diagram: "drawn a diagram",
  erase: "cleared my marks",
};

/**
 * A short line for when the tutor draws but says nothing. A reply that is only
 * a chip looks broken, so the board always gets described in words too.
 */
export function describeDrawings(kinds: ResolvedOp["kind"][]): string {
  const phrases = [...new Set(kinds.map((kind) => PHRASES[kind]))];
  if (phrases.length === 0) return "";
  const list =
    phrases.length === 1 ? phrases[0] : `${phrases.slice(0, -1).join(", ")} and ${phrases[phrases.length - 1]}`;
  return `Done — ${list}.`;
}
