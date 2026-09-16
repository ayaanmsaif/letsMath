import { describe, expect, it } from "vitest";
import {
  addPatch,
  applyPatch,
  emptyHistory,
  pushEntry,
  redo,
  removePatch,
  undo,
  updatePatch,
  type Shapes,
} from "./history";
import type { RectShape } from "./types";

const rect: RectShape = {
  id: "r1",
  num: 1,
  z: 1,
  author: "student",
  color: "#000",
  size: "m",
  createdAt: 0,
  type: "rect",
  x: 0,
  y: 0,
  w: 10,
  h: 10,
};

describe("history", () => {
  it("undoes and redoes an add", () => {
    const patch = addPatch([rect]);
    let shapes: Shapes = applyPatch({}, patch, "forward");
    let history = pushEntry(emptyHistory(), { patch, label: "draw", author: "student" });
    expect(shapes.r1).toBe(rect);

    const undone = undo(shapes, history)!;
    ({ shapes, history } = undone);
    expect(shapes.r1).toBeUndefined();
    expect(history.redo).toHaveLength(1);

    const redone = redo(shapes, history)!;
    expect(redone.shapes.r1).toBe(rect);
    expect(redone.history.undo).toHaveLength(1);
  });

  it("restores the previous version of an updated shape", () => {
    const moved = { ...rect, x: 50 };
    const shapes = applyPatch({ r1: rect }, updatePatch([[rect, moved]]), "forward");
    expect(shapes.r1.type === "rect" && shapes.r1.x).toBe(50);
    const back = applyPatch(shapes, updatePatch([[rect, moved]]), "backward");
    expect(back.r1).toBe(rect);
  });

  it("brings back erased shapes on undo", () => {
    const patch = removePatch([rect]);
    const history = pushEntry(emptyHistory(), { patch, label: "erase", author: "student" });
    const result = undo(applyPatch({ r1: rect }, patch, "forward"), history)!;
    expect(result.shapes.r1).toBe(rect);
  });

  it("clears redo when new work is recorded and ignores empty patches", () => {
    let history = pushEntry(emptyHistory(), { patch: addPatch([rect]), label: "a", author: "student" });
    history = undo({ r1: rect }, history)!.history;
    expect(history.redo).toHaveLength(1);
    history = pushEntry(history, { patch: addPatch([{ ...rect, id: "r2" }]), label: "b", author: "student" });
    expect(history.redo).toHaveLength(0);
    expect(pushEntry(history, { patch: {}, label: "noop", author: "student" })).toBe(history);
  });

  it("returns null when there is nothing to undo or redo", () => {
    expect(undo({}, emptyHistory())).toBeNull();
    expect(redo({}, emptyHistory())).toBeNull();
  });
});

// The tutor draws one mark at a time, but a turn should undo as a single step.
describe("merging steps", () => {
  const second: RectShape = { ...rect, id: "r2", num: 2 };

  it("folds entries sharing a merge key into one undoable step", () => {
    let shapes: Shapes = {};
    let history = emptyHistory();
    for (const shape of [rect, second]) {
      const patch = addPatch([shape]);
      shapes = applyPatch(shapes, patch, "forward");
      history = pushEntry(history, { patch, label: "tutor circle", author: "tutor", mergeKey: "turn-1" });
    }
    expect(history.undo).toHaveLength(1);

    const undone = undo(shapes, history)!;
    expect(undone.shapes).toEqual({});
  });

  it("keeps different turns separate", () => {
    let history = pushEntry(emptyHistory(), { patch: addPatch([rect]), label: "a", author: "tutor", mergeKey: "turn-1" });
    history = pushEntry(history, { patch: addPatch([second]), label: "b", author: "tutor", mergeKey: "turn-2" });
    expect(history.undo).toHaveLength(2);
  });

  it("does not merge steps without a key", () => {
    let history = pushEntry(emptyHistory(), { patch: addPatch([rect]), label: "a", author: "student" });
    history = pushEntry(history, { patch: addPatch([second]), label: "b", author: "student" });
    expect(history.undo).toHaveLength(2);
  });

  it("undoes to the state before the whole batch when a shape changes twice", () => {
    const moved = { ...rect, x: 50 };
    const movedAgain = { ...rect, x: 90 };
    let shapes: Shapes = { r1: rect };
    let history = emptyHistory();

    for (const [before, after] of [
      [rect, moved],
      [moved, movedAgain],
    ] as [RectShape, RectShape][]) {
      const patch = updatePatch([[before, after]]);
      shapes = applyPatch(shapes, patch, "forward");
      history = pushEntry(history, { patch, label: "tutor move", author: "tutor", mergeKey: "turn-1" });
    }
    expect(history.undo).toHaveLength(1);
    expect(undo(shapes, history)!.shapes.r1).toBe(rect);
  });
});
