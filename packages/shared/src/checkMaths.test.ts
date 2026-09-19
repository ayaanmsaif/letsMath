import { describe, expect, it } from "vitest";
import { checkMaths, formatNumber, toleranceFor } from "./checkMaths";

const check = (expr: string, claim = "", at = "", degrees = true) => checkMaths({ expr, claim, at, degrees });

describe("working a number out for the tutor", () => {
  it("works out what the tutor would otherwise do in its head", () => {
    expect(check("5*cos(65)")).toBe("5*cos(65) = 2.113091309.");
    expect(check("sin(30)")).toBe("sin(30) = 0.5.");
    expect(check("sin(pi/6)", "", "", false)).toBe("sin(pi/6) = 0.5.");
  });

  it("catches a wrong answer and says how far out it is", () => {
    expect(check("5*cos(65)", "2.7")).toMatch(/2\.7 is wrong — out by 0\.58/);
  });

  // The whole point: a tutor that marks correct work wrong is worse than none.
  it("accepts an answer rounded the way a student would round it", () => {
    expect(check("5*cos(65)", "2.11")).toMatch(/is right, which is a correct rounding/);
    expect(check("5*cos(65)", "2.1")).toMatch(/is right/);
    expect(check("sqrt(3)/2", "0.87")).toMatch(/is right/);
    // But a rounding that doesn't hold up is still wrong.
    expect(check("sqrt(3)/2", "0.85")).toMatch(/wrong/);
  });

  it("knows degrees from radians", () => {
    expect(check("cos(60)")).toBe("cos(60) = 0.5.");
    expect(check("cos(60)", "", "", false)).toMatch(/= -0\.952/);
  });

  it("checks a claimed solution by putting it back in", () => {
    expect(check("2*x+5", "13", "x=4")).toMatch(/is right/);
    expect(check("2*x+5", "13", "x=5")).toMatch(/wrong/);
  });

  it("tells two expressions apart without doing any algebra", () => {
    expect(check("(x+1)^2", "x^2+2*x+1")).toMatch(/are the same/);
    expect(check("(x+1)^2", "x^2+1")).toMatch(/not the same/);
    // Several letters at once.
    expect(check("(a+b)^2", "a^2+2*a*b+b^2")).toMatch(/are the same/);
  });

  it("asks for what it needs instead of guessing", () => {
    expect(() => check("2*x+5")).toThrow(/Give a value for x/);
    expect(() => check("wibble(3)")).toThrow(/don't know/);
    expect(() => check("1/0", "2")).toThrow(/doesn't have a real value/);
    expect(() => check("2*x", "6", "x")).toThrow(/Write the values as/);
  });

  it("writes numbers the way a person would", () => {
    expect(formatNumber(0.1 + 0.2)).toBe("0.3");
    expect(formatNumber(2)).toBe("2");
    expect(formatNumber(-0)).toBe("0");
    expect(formatNumber(1 / 0)).toBe("undefined");
  });

  it("takes its tolerance from how precisely the claim was written", () => {
    expect(toleranceFor("2.11")).toBeCloseTo(0.005, 6);
    expect(toleranceFor("2.1")).toBeCloseTo(0.05, 6);
    expect(toleranceFor("13")).toBeLessThan(1e-8);
  });
});
