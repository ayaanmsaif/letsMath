import { useDraft } from "../model/draft";
import type { EquationShape } from "../model/types";
import { topShapeAt } from "./selection";
import type { Tool } from "./types";

export function openEquationEditor(shape: EquationShape) {
  useDraft.getState().set({ equation: { x: shape.x, y: shape.y, id: shape.id, latex: shape.latex } });
}

/** Click to open the equation editor at that spot, or on an equation to edit it. */
export function createEquationTool(): Tool {
  return {
    cursor: "crosshair",

    onDown(p) {
      // Don't discard an equation that's still being typed; Insert or Esc closes the editor.
      if (useDraft.getState().equation) return;
      const hit = topShapeAt(p.world);
      if (hit?.type === "equation") return openEquationEditor(hit);
      useDraft.getState().set({ equation: { x: p.world[0], y: p.world[1], id: null, latex: "" } });
    },

    onMove() {},
    onUp() {},
    onCancel() {},
  };
}
