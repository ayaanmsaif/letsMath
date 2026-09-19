// What a test case is, and what counts as passing it (PLAN.md §8, M6).
//
// A case freezes a student: what the board showed and what they asked. The
// tutor is the only thing that varies, so two models can be put to the same
// questions and the answers compared.
import type { ResolvedOp, TurnTrigger } from "@letsmath/shared";

/**
 * A check is written against what the board ended up with, not against the
 * names the tutor happened to choose. Point letters are the tutor's to pick;
 * the compiler's own part names (xaxis, plot1, circle_O) are stable.
 */
export interface Checks {
  /** Kinds of drawing that must appear, such as "diagram" or "mark". */
  drew?: ResolvedOp["kind"][];
  /** Patterns at least one drawn part's id must match, e.g. "\\.xaxis$". */
  parts?: string[];
  /** A part matching this pattern must be as wide as it is tall. */
  round?: string;
  /** A straight line must run from a circle's centre to its edge at this angle, in degrees. */
  radiusAt?: number;
  /** Some straight line must run at this angle, measured as a student would read it. */
  segmentAt?: number;
  /** At least this many parts must match the pattern. */
  atLeast?: { pattern: string; count: number }[];
  /** No plotted curve may leap vertically, which is what drawing through an asymptote looks like. */
  smooth?: boolean;
  /** Two parallel lines whose lengths are in this ratio, as in a trapezium. */
  parallelRatio?: number;
  /** The tutor must have worked the number out rather than trusting itself. */
  checked?: boolean;
  /** A reply that is only a drawing looks broken to the student. */
  saysSomething?: boolean;
  /** Patterns the reply must contain, and must not. */
  says?: string[];
  saysNot?: string[];
  /** Nothing the tutor tried to draw may have been refused. */
  noRefusals?: boolean;
}

export interface Fixture {
  id: string;
  /** The harder half, which the dearest models are only run against. */
  hard?: boolean;
  /** What the student says. */
  ask: string;
  trigger?: TurnTrigger;
  /** A board recorded from the app, if the question needs one. */
  board?: string;
  /** Why this case is here, so a failure is readable a month later. */
  about: string;
  expect: Checks;
}

export interface CheckResult {
  name: string;
  passed: boolean;
  detail?: string;
}

export interface FixtureResult {
  id: string;
  checks: CheckResult[];
  reply: string;
  tools: string[];
  refusals: number;
  rounds: number;
  costUsd: number;
  firstWordMs?: number;
  totalMs: number;
  error?: string;
}
