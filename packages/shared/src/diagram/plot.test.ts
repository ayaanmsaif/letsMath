import { describe, expect, it } from "vitest";
import { compileExpression, ExpressionError, samplePlot } from "./plot";

const at = (source: string, x: number) => compileExpression(source)(x);

describe("compileExpression", () => {
  it("does arithmetic in the right order", () => {
    expect(at("2+3*4", 0)).toBe(14);
    expect(at("(2+3)*4", 0)).toBe(20);
    expect(at("10/4", 0)).toBe(2.5);
    expect(at("-3+1", 0)).toBe(-2);
  });

  it("handles powers, right to left", () => {
    expect(at("2^3", 0)).toBe(8);
    expect(at("2^3^2", 0)).toBe(512);
    expect(at("-2^2", 0)).toBe(-4);
  });

  it("knows x, constants and functions", () => {
    expect(at("x^2", 4)).toBe(16);
    expect(at("sin(x)", Math.PI / 2)).toBeCloseTo(1);
    expect(at("sqrt(x)", 9)).toBe(3);
    expect(at("pi", 0)).toBeCloseTo(Math.PI);
    expect(at("cos(0)+e", 0)).toBeCloseTo(1 + Math.E);
  });

  it("reads the shorthand people actually write", () => {
    expect(at("2x", 5)).toBe(10);
    expect(at("2sin(x)", Math.PI / 2)).toBeCloseTo(2);
    expect(at("3(x+1)", 2)).toBe(9);
    // LaTeX creeps in from the model, so the obvious forms are tidied up first.
    expect(at("\\sin(x)", Math.PI / 2)).toBeCloseTo(1);
    expect(at("2 \\cdot x", 3)).toBe(6);
  });

  it("refuses what it doesn't understand rather than guessing", () => {
    expect(() => compileExpression("wibble(x)")).toThrow(ExpressionError);
    expect(() => compileExpression("2+")).toThrow(ExpressionError);
    expect(() => compileExpression("(2+3")).toThrow(ExpressionError);
    expect(() => compileExpression("2 $ 3")).toThrow(ExpressionError);
    expect(() => compileExpression("")).toThrow(ExpressionError);
  });

  it("never runs the string as code", () => {
    // These are just unknown names, not routes to anything.
    expect(() => compileExpression("constructor")).toThrow(ExpressionError);
    expect(() => compileExpression("process(x)")).toThrow(ExpressionError);
    expect(() => compileExpression("globalThis")).toThrow(ExpressionError);
  });
});

describe("samplePlot", () => {
  it("follows the curve it is given", () => {
    const [curve] = samplePlot(compileExpression("sin(x)"), 0, Math.PI * 2);
    expect(curve.length).toBeGreaterThan(50);
    for (const [x, y] of curve) expect(y).toBeCloseTo(Math.sin(x), 6);
  });

  it("puts more points where the curve bends", () => {
    const [gentle] = samplePlot(compileExpression("x"), 0, 10, { steps: 40 });
    const [bendy] = samplePlot(compileExpression("sin(10x)"), 0, 10, { steps: 40 });
    expect(bendy.length).toBeGreaterThan(gentle.length);
  });

  it("breaks the line at an asymptote instead of drawing through it", () => {
    const runs = samplePlot(compileExpression("tan(x)"), -Math.PI, Math.PI, { range: [-10, 10] });
    expect(runs.length).toBeGreaterThan(1);
    for (const run of runs) for (const [, y] of run) expect(Math.abs(y)).toBeLessThanOrEqual(10);
  });

  it("starts where the function becomes defined", () => {
    const [curve] = samplePlot(compileExpression("sqrt(x)"), -4, 4);
    expect(curve[0][0]).toBeGreaterThanOrEqual(0);
    expect(curve.every(([, y]) => Number.isFinite(y))).toBe(true);
  });

  it("gives nothing back when the function is never on the graph", () => {
    expect(samplePlot(compileExpression("x+100"), 0, 1, { range: [-10, 10] })).toEqual([]);
  });
});
