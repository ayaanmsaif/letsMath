import { useDraft } from "../model/draft";
import { eraserHitsShape } from "../model/geometry";
import { removePatch } from "../model/history";
import { sortedShapes, useBoard } from "../model/store";
import type { Vec } from "../model/types";
import type { Tool } from "./types";

/** Screen-pixel radius of the eraser. */
const RADIUS_PX = 10;

/** Stroke eraser: anything the eraser path touches disappears, committed as one undo step. */
export function createEraserTool(): Tool {
  let last: Vec | null = null;
  let hits: Record<string, true> = {};

  const sweep = (to: Vec) => {
    const board = useBoard.getState();
    const from = last ?? to;
    const radius = RADIUS_PX / board.camera.z;
    let changed = false;
    for (const shape of sortedShapes(board.shapes)) {
      if (!hits[shape.id] && eraserHitsShape(shape, from, to, radius)) {
        hits = { ...hits, [shape.id]: true };
        changed = true;
      }
    }
    if (changed) board.setErasing(hits);
    last = to;
  };

  const reset = () => {
    last = null;
    hits = {};
    useBoard.getState().setErasing({});
  };

  return {
    cursor: "none",

    onDown(p) {
      reset();
      sweep(p.world);
      useDraft.getState().set({ eraser: p.world });
    },

    onMove(p) {
      for (const s of p.samples) sweep([s[0], s[1]]);
      useDraft.getState().set({ eraser: p.world });
    },

    onUp() {
      const board = useBoard.getState();
      const doomed = Object.keys(hits).map((id) => board.shapes[id]).filter(Boolean);
      if (doomed.length > 0) {
        board.commit(removePatch(doomed), "erase");
        board.setSelection(board.selection.filter((id) => !hits[id]));
      }
      reset();
    },

    onHover(p) {
      useDraft.getState().set({ eraser: p.world });
    },

    onCancel() {
      reset();
      useDraft.getState().set({ eraser: null });
    },
  };
}

export const ERASER_RADIUS_PX = RADIUS_PX;
