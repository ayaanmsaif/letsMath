import { describe, expect, it } from "vitest";
import type { Shape } from "../model/types";
import { withGroups } from "./selection";

/** A drawn line, which is all these tests need of a shape. */
const shape = (id: string, author: "student" | "tutor"): Shape => ({
  id,
  num: 0,
  z: 1,
  author,
  color: "#000",
  size: "m",
  createdAt: 0,
  type: "polygon",
  points: [
    [0, 0],
    [10, 10],
  ],
  closed: false,
});

// A graph: its axes, a curve, and the number under a tick.
const board = Object.fromEntries(
  [
    shape("s1", "student"),
    shape("s2", "student"),
    shape("a1.xaxis", "tutor"),
    shape("a1.yaxis", "tutor"),
    shape("a1.plot1", "tutor"),
    shape("a1.xnum2", "tutor"),
    shape("a2", "tutor"),
    shape("a2#2", "tutor"),
    shape("a3.AB", "tutor"),
  ].map((s) => [s.id, s]),
);

describe("selecting a tutor's drawing", () => {
  it("takes the whole drawing when one part of it is picked", () => {
    expect(withGroups(["a1.plot1"], board).sort()).toEqual(["a1.plot1", "a1.xaxis", "a1.xnum2", "a1.yaxis"]);
  });

  it("keeps an annotation's own strokes together", () => {
    // A cross is two strokes: a2 and a2#2.
    expect(withGroups(["a2#2"], board).sort()).toEqual(["a2", "a2#2"]);
  });

  it("never mixes one drawing with another", () => {
    expect(withGroups(["a3.AB"], board)).toEqual(["a3.AB"]);
    expect(withGroups(["a1.xaxis", "a3.AB"], board)).toHaveLength(5);
  });

  it("leaves the student's own work alone", () => {
    expect(withGroups(["s1"], board)).toEqual(["s1"]);
    // Student ink picked up alongside a diagram stays a single shape.
    expect(withGroups(["s1", "a2"], board).sort()).toEqual(["a2", "a2#2", "s1"]);
  });

  it("passes through ids it doesn't know", () => {
    expect(withGroups(["gone"], board)).toEqual(["gone"]);
  });
});
