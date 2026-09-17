// Evaluating and sampling functions for graphs (PLAN.md §4b).
//
// A small parser rather than a maths library: the tutor writes things like
// "sin(x)", "x^2 - 3" or "2sin(x)+1", and a graph needs those evaluated at a
// few hundred points. Nothing here executes the string — unknown names are
// rejected outright — so a model's output can never run as code.

export class ExpressionError extends Error {}

type Token = { kind: "number"; value: number } | { kind: "name"; value: string } | { kind: "op"; value: string };

const FUNCTIONS: Record<string, (x: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  sqrt: Math.sqrt,
  abs: Math.abs,
  ln: Math.log,
  log: Math.log10,
  exp: Math.exp,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
};

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

/** Tidy up the LaTeX-isms a model might reach for, before parsing. */
function normalise(source: string): string {
  return source
    .replace(/\\left|\\right/g, "")
    .replace(/\\cdot|\\times/g, "*")
    .replace(/\\div/g, "/")
    .replace(/\\pi/g, "pi")
    .replace(/\\(sin|cos|tan|sqrt|ln|log|exp|abs)/g, "$1")
    .replace(/[{}]/g, (brace) => (brace === "{" ? "(" : ")"))
    .replace(/\s+/g, "");
}

function tokenise(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const char = source[i];
    if (/[0-9.]/.test(char)) {
      const match = /^[0-9]*\.?[0-9]+/.exec(source.slice(i));
      if (!match) throw new ExpressionError(`Can't read the number at position ${i + 1}.`);
      tokens.push({ kind: "number", value: Number(match[0]) });
      i += match[0].length;
    } else if (/[a-zA-Z]/.test(char)) {
      const match = /^[a-zA-Z]+/.exec(source.slice(i))!;
      tokens.push({ kind: "name", value: match[0] });
      i += match[0].length;
    } else if ("+-*/^(),".includes(char)) {
      tokens.push({ kind: "op", value: char });
      i += 1;
    } else {
      throw new ExpressionError(`I don't understand "${char}" in that expression.`);
    }
  }
  return tokens;
}

/**
 * Turn an expression in x into a function. Throws ExpressionError if it can't
 * be read, so the tutor gets told rather than the graph coming out empty.
 */
export function compileExpression(source: string, variable = "x"): (x: number) => number {
  const tokens = tokenise(normalise(source));
  if (tokens.length === 0) throw new ExpressionError("That expression is empty.");
  let position = 0;

  const peek = () => tokens[position];
  const eat = (value: string) => {
    const token = peek();
    if (token?.kind === "op" && token.value === value) {
      position += 1;
      return true;
    }
    return false;
  };

  // Precedence climbing: + - lowest, then * /, then ^, then unary minus.
  const parseExpression = (): ((x: number) => number) => {
    let left = parseTerm();
    for (;;) {
      if (eat("+")) {
        const right = parseTerm();
        const previous = left;
        left = (x) => previous(x) + right(x);
      } else if (eat("-")) {
        const right = parseTerm();
        const previous = left;
        left = (x) => previous(x) - right(x);
      } else return left;
    }
  };

  const parseTerm = (): ((x: number) => number) => {
    let left = parseUnary();
    for (;;) {
      if (eat("*")) {
        const right = parseUnary();
        const previous = left;
        left = (x) => previous(x) * right(x);
      } else if (eat("/")) {
        const right = parseUnary();
        const previous = left;
        left = (x) => previous(x) / right(x);
      } else if (startsImplicitProduct()) {
        // "2x", "2sin(x)" and "3(x+1)" all mean multiplication.
        const right = parseUnary();
        const previous = left;
        left = (x) => previous(x) * right(x);
      } else return left;
    }
  };

  const startsImplicitProduct = () => {
    const token = peek();
    if (!token) return false;
    if (token.kind === "name") return true;
    return token.kind === "op" && token.value === "(";
  };

  const parseUnary = (): ((x: number) => number) => {
    if (eat("-")) {
      const operand = parseUnary();
      return (x) => -operand(x);
    }
    eat("+");
    return parsePower();
  };

  const parsePower = (): ((x: number) => number) => {
    const base = parseAtom();
    if (eat("^")) {
      // Right associative: 2^3^2 is 2^(3^2).
      const exponent = parseUnary();
      return (x) => base(x) ** exponent(x);
    }
    return base;
  };

  const parseAtom = (): ((x: number) => number) => {
    const token = peek();
    if (!token) throw new ExpressionError("That expression stops early.");

    if (token.kind === "number") {
      position += 1;
      return () => token.value;
    }

    if (token.kind === "name") {
      position += 1;
      const name = token.value.toLowerCase();
      if (name === variable) return (x) => x;
      // Own properties only: "constructor" and "toString" are on every object's
      // prototype, and `in` would happily hand one back as if it were maths.
      if (Object.hasOwn(CONSTANTS, name)) return () => CONSTANTS[name];
      if (Object.hasOwn(FUNCTIONS, name)) {
        if (!eat("(")) throw new ExpressionError(`${name} needs brackets, like ${name}(x).`);
        const argument = parseExpression();
        if (!eat(")")) throw new ExpressionError(`${name}( is missing its closing bracket.`);
        return (x) => FUNCTIONS[name](argument(x));
      }
      throw new ExpressionError(`I don't know "${token.value}". Use ${variable}, a number, or a function like sin.`);
    }

    if (eat("(")) {
      const inner = parseExpression();
      if (!eat(")")) throw new ExpressionError("A bracket is left open.");
      return inner;
    }

    throw new ExpressionError(`"${token.value}" doesn't belong there.`);
  };

  const fn = parseExpression();
  if (position < tokens.length) throw new ExpressionError("There's something left over at the end of that expression.");
  return fn;
}

export interface SampleOptions {
  /** Values outside this band are treated as off the top or bottom of the graph. */
  range?: [number, number];
  /** Points to try before refining. */
  steps?: number;
}

const MAX_DEPTH = 5;
/** Refine a segment when the curve turns more sharply than this. */
const BEND_TOLERANCE = 0.02;

/**
 * Sample a function across a domain, refining where it bends and breaking the
 * line where it leaves the graph or is undefined, so an asymptote doesn't turn
 * into a vertical stroke.
 */
export function samplePlot(
  fn: (x: number) => number,
  from: number,
  to: number,
  options: SampleOptions = {},
): [number, number][][] {
  const steps = options.steps ?? 120;
  const [low, high] = options.range ?? [-Infinity, Infinity];
  const usable = (y: number) => Number.isFinite(y) && y >= low && y <= high;

  const runs: [number, number][][] = [];
  let run: [number, number][] = [];
  const push = (x: number, y: number) => {
    if (usable(y)) {
      run.push([x, y]);
    } else if (run.length > 0) {
      // Off the graph or undefined: end this piece and start again later.
      runs.push(run);
      run = [];
    }
  };

  /** Add points between two samples while the curve keeps bending. */
  const refine = (x1: number, y1: number, x2: number, y2: number, depth: number) => {
    if (depth >= MAX_DEPTH) return;
    const mx = (x1 + x2) / 2;
    const my = fn(mx);
    if (!usable(my) || !usable(y1) || !usable(y2)) {
      push(mx, my);
      return;
    }
    // How far the middle sits from the straight line between its neighbours,
    // relative to the span, tells us whether more points are needed.
    const straight = (y1 + y2) / 2;
    const spread = Math.abs(y2 - y1) + Math.abs(to - from);
    if (Math.abs(my - straight) / (spread || 1) > BEND_TOLERANCE) {
      refine(x1, y1, mx, my, depth + 1);
      push(mx, my);
      refine(mx, my, x2, y2, depth + 1);
    }
  };

  let previousX = from;
  let previousY = fn(from);
  push(previousX, previousY);
  for (let i = 1; i <= steps; i++) {
    const x = from + ((to - from) * i) / steps;
    const y = fn(x);
    refine(previousX, previousY, x, y, 0);
    push(x, y);
    previousX = x;
    previousY = y;
  }
  if (run.length > 0) runs.push(run);

  return runs.filter((piece) => piece.length > 1);
}
