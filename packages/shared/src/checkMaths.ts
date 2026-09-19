// Working a number out exactly, so the tutor never has to do sums in its head
// (PLAN.md §5).
//
// Everywhere else we've kept arithmetic away from the model: constructions
// place points, the evaluator draws curves. Marking was the hole left. A tutor
// that tells a correct student they're wrong loses their trust for good, and
// trig is where a model's mental arithmetic is weakest — decimals, degrees
// against radians, rounding.
import { z } from "zod";
import { compileFormula, ExpressionError, type Values } from "./diagram/plot";

export const CHECK_MATHS_TOOL = "check_maths";

export const checkMathsSchema = z
  .object({
    expr: z
      .string()
      .max(120)
      .describe("What to work out, written plainly: 5*cos(65), sqrt(3)/2, 2*x+5, (x+1)^2. Not LaTeX."),
    claim: z
      .string()
      .max(120)
      .describe(
        "What it is claimed to equal: the student's answer, or another expression to compare against. Empty string to simply work it out. Write a number exactly as the student wrote it, so 2.11 is judged as an answer to two decimal places.",
      ),
    at: z.string().max(60).describe("Values for any letters, as x=4 or x=4, y=2. Empty string when there are none."),
    degrees: z.boolean().describe("true when angles in the expression are in degrees, false for radians."),
  })
  .strict();

export interface CheckRequest {
  /** What to work out, e.g. "5*cos(65)" or "(x+1)^2". */
  expr: string;
  /** What it's claimed to equal — a number or another expression. Empty for none. */
  claim: string;
  /** Values for any letters, as "x=4" or "x=4, y=2". Empty for none. */
  at: string;
  /** Angles in degrees rather than radians. */
  degrees: boolean;
}

/** Values to try when comparing two expressions that still have letters in them. */
const TRIALS = [-2.3, -1.7, -0.9, 0.4, 1.1, 1.6, 2.2, 3.1, 4.3, 5.7];
const MIN_TRIALS = 4;
/** How close two worked-out values must be to count as equal. */
const CLOSE = 1e-9;

/** Write a number the way a person would, without floating-point noise. */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "undefined";
  const tidy = Number(value.toPrecision(10));
  if (Object.is(tidy, -0) || Math.abs(tidy) < 1e-12) return "0";
  return String(tidy);
}

/**
 * How far a claim may be out and still be right. A claim written to two decimal
 * places is a rounded answer, and 2.11 is a correct rounding of 2.1131.
 */
export function toleranceFor(claim: string): number {
  const decimals = /\.(\d+)/.exec(claim.trim());
  if (!decimals) return CLOSE;
  return 0.5 * 10 ** -decimals[1].length + CLOSE;
}

/** Read "x=4, y=2" into values. The right-hand side may itself be maths. */
function readValues(at: string, degrees: boolean): Values {
  const values: Values = {};
  for (const part of at.split(/[,;]/)) {
    if (!part.trim()) continue;
    const [name, ...rest] = part.split("=");
    const letter = name.trim().toLowerCase();
    if (!/^[a-z]$/.test(letter) || rest.length === 0) {
      throw new ExpressionError(`Write the values as x=4, not "${part.trim()}".`);
    }
    const formula = compileFormula(rest.join("="), { degrees });
    if (formula.variables.length > 0) throw new ExpressionError(`The value for ${letter} must be a number.`);
    values[letter] = formula.evaluate();
  }
  return values;
}

/** Letters an expression uses that weren't given a value. */
const missing = (variables: string[], values: Values) => variables.filter((name) => !Object.hasOwn(values, name));

/**
 * Work out an expression, or check a claim about it, exactly.
 *
 * @returns a sentence for the tutor to read before it says anything to the student.
 * @throws ExpressionError when the maths can't be read, so the tutor is told to fix it.
 */
export function checkMaths(request: CheckRequest): string {
  const values = readValues(request.at, request.degrees);
  const left = compileFormula(request.expr, { degrees: request.degrees });
  const claim = request.claim.trim() ? compileFormula(request.claim, { degrees: request.degrees }) : null;

  const free = [...new Set([...missing(left.variables, values), ...missing(claim?.variables ?? [], values)])];

  // Nothing left unknown: work both out and compare.
  if (free.length === 0) {
    const value = left.evaluate(values);
    if (!Number.isFinite(value)) {
      throw new ExpressionError(`${request.expr} doesn't have a real value${request.at ? ` at ${request.at}` : ""}.`);
    }
    const shown = `${request.expr}${request.at ? ` at ${request.at}` : ""} = ${formatNumber(value)}`;
    if (!claim) return `${shown}.`;

    const claimed = claim.evaluate(values);
    const gap = Math.abs(value - claimed);
    const allowed = toleranceFor(request.claim);
    if (gap <= allowed) {
      const rounded = gap > CLOSE ? ", which is a correct rounding" : "";
      return `${shown}, so ${request.claim} is right${rounded}.`;
    }
    return `${shown}, so ${request.claim} is wrong — out by ${formatNumber(gap)}.`;
  }

  // Letters left over: only a comparison can mean anything.
  if (!claim) {
    throw new ExpressionError(`Give a value for ${free.join(" and ")}, as at: "${free[0]}=2".`);
  }

  // Two expressions agreeing everywhere tried are the same expression.
  let tried = 0;
  for (const trial of TRIALS) {
    const at: Values = { ...values };
    free.forEach((name, index) => {
      at[name] = trial + index * 0.37;
    });
    const a = left.evaluate(at);
    const b = claim.evaluate(at);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    tried += 1;
    if (Math.abs(a - b) > CLOSE * (1 + Math.abs(a))) {
      const where = free.map((name) => `${name} = ${formatNumber(at[name])}`).join(", ");
      return (
        `${request.expr} and ${request.claim} are not the same: at ${where}, ` +
        `the first is ${formatNumber(a)} and the second is ${formatNumber(b)}.`
      );
    }
  }

  if (tried < MIN_TRIALS) {
    throw new ExpressionError(`I couldn't compare those: they have no real values for most ${free.join(" and ")}.`);
  }
  return `${request.expr} and ${request.claim} agree at every value I tried, so they are the same.`;
}
