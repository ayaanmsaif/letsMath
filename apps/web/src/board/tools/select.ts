import { useDraft } from "../model/draft";
import { boxesIntersect, boxFromCorners, shapeBounds, transformShape, translateShape } from "../model/geometry";
import { updatePatch } from "../model/history";
import { sortedShapes, useBoard } from "../model/store";
import type { Box, Shape, Vec } from "../model/types";
import { openEquationEditor } from "./equation";
import { HANDLE_HIT_PX, HANDLES, handlePosition, selectionBounds, topShapeAt, type Handle } from "./selection";
import { beginTextEdit } from "./text";
import type { Tool } from "./types";

type Gesture =
  | { kind: "move"; start: Vec; originals: Shape[]; moved: boolean }
  | { kind: "resize"; handle: Handle; box: Box; originals: Shape[] }
  | { kind: "marquee"; start: Vec; base: string[] };

function handleAt(p: Vec): Handle | null {
  const box = selectionBounds();
  if (!box) return null;
  const r = HANDLE_HIT_PX / useBoard.getState().camera.z;
  return (
    HANDLES.find((h) => {
      const [x, y] = handlePosition(box, h);
      return Math.abs(p[0] - x) <= r && Math.abs(p[1] - y) <= r;
    }) ?? null
  );
}

export function createSelectTool(): Tool {
  let gesture: Gesture | null = null;

  /** Record a finished move or resize whose changes were applied live. */
  const recordTransient = (originals: Shape[], label: string) => {
    const board = useBoard.getState();
    const pairs = originals
      .map((o) => [o, board.shapes[o.id]] as [Shape, Shape | undefined])
      .filter((pair): pair is [Shape, Shape] => Boolean(pair[1]));
    board.record(updatePatch(pairs), label);
  };

  return {
    cursor: "default",

    onDown(p) {
      const board = useBoard.getState();

      const handle = board.selection.length > 0 ? handleAt(p.world) : null;
      if (handle) {
        gesture = {
          kind: "resize",
          handle,
          box: selectionBounds()!,
          originals: board.selection.map((id) => board.shapes[id]).filter(Boolean),
        };
        return;
      }

      const hit = topShapeAt(p.world);
      if (hit) {
        if (p.detail >= 2 && (hit.type === "text" || hit.type === "equation")) {
          // Editing replaces the selection outline with the editor.
          board.setSelection([]);
          return hit.type === "text" ? beginTextEdit(hit) : openEquationEditor(hit);
        }

        let selection = board.selection;
        if (p.shift) {
          selection = selection.includes(hit.id) ? selection.filter((id) => id !== hit.id) : [...selection, hit.id];
        } else if (!selection.includes(hit.id)) {
          selection = [hit.id];
        }
        board.setSelection(selection);
        gesture = {
          kind: "move",
          start: p.world,
          originals: selection.map((id) => board.shapes[id]).filter(Boolean),
          moved: false,
        };
        return;
      }

      gesture = { kind: "marquee", start: p.world, base: p.shift ? board.selection : [] };
      if (!p.shift) board.setSelection([]);
    },

    onMove(p) {
      if (!gesture) return;
      const board = useBoard.getState();

      if (gesture.kind === "move") {
        const dx = p.world[0] - gesture.start[0];
        const dy = p.world[1] - gesture.start[1];
        gesture.moved = true;
        board.setShapesTransient(gesture.originals.map((s) => translateShape(s, dx, dy)));
      } else if (gesture.kind === "resize") {
        const { box, handle } = gesture;
        const anchor: Vec = [handle[1] === "w" ? box.maxX : box.minX, handle[0] === "n" ? box.maxY : box.minY];
        let corner = p.world;
        if (p.shift) {
          const w = box.maxX - box.minX;
          const h = box.maxY - box.minY;
          const s = Math.max(Math.abs(corner[0] - anchor[0]) / w, Math.abs(corner[1] - anchor[1]) / h);
          corner = [
            anchor[0] + Math.sign(corner[0] - anchor[0] || 1) * w * s,
            anchor[1] + Math.sign(corner[1] - anchor[1] || 1) * h * s,
          ];
        }
        const next = boxFromCorners(anchor, corner);
        if (next.maxX - next.minX < 2 || next.maxY - next.minY < 2) return;
        board.setShapesTransient(gesture.originals.map((s) => transformShape(s, box, next)));
      } else {
        const marquee = boxFromCorners(gesture.start, p.world);
        useDraft.getState().set({ marquee });
        const inside = sortedShapes(board.shapes)
          .filter((s) => boxesIntersect(shapeBounds(s), marquee))
          .map((s) => s.id);
        board.setSelection([...new Set([...gesture.base, ...inside])]);
      }
    },

    onUp() {
      if (gesture?.kind === "move" && gesture.moved) recordTransient(gesture.originals, "move");
      if (gesture?.kind === "resize") recordTransient(gesture.originals, "resize");
      if (gesture?.kind === "marquee") useDraft.getState().set({ marquee: null });
      gesture = null;
    },

    onHover(p) {
      const handle = useBoard.getState().selection.length > 0 ? handleAt(p.world) : null;
      const cursor = handle
        ? handle === "nw" || handle === "se"
          ? "nwse-resize"
          : "nesw-resize"
        : topShapeAt(p.world)
          ? "move"
          : null;
      if (useDraft.getState().cursor !== cursor) useDraft.getState().set({ cursor });
    },

    onCancel() {
      // Put shapes back where they were if a drag is abandoned.
      if (gesture && gesture.kind !== "marquee") useBoard.getState().setShapesTransient(gesture.originals);
      useDraft.getState().set({ marquee: null, cursor: null });
      gesture = null;
    },
  };
}
