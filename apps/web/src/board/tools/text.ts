import { useDraft } from "../model/draft";
import { addPatch, removePatch, updatePatch } from "../model/history";
import { FONT_SIZE } from "../model/style";
import { useBoard } from "../model/store";
import type { TextShape } from "../model/types";
import { TEXT_FONT, TEXT_LINE_HEIGHT } from "../render/ShapeView";
import { topShapeAt } from "./selection";
import type { Tool } from "./types";

let measureCtx: CanvasRenderingContext2D | null = null;

export function measureText(text: string, fontSize: number): { w: number; h: number } {
  measureCtx ??= document.createElement("canvas").getContext("2d")!;
  measureCtx.font = `${fontSize}px ${TEXT_FONT}`;
  const lines = text.split("\n");
  const w = Math.max(fontSize * 0.5, ...lines.map((line) => measureCtx!.measureText(line).width));
  return { w, h: lines.length * fontSize * TEXT_LINE_HEIGHT };
}

export function beginTextEdit(shape: TextShape) {
  commitTextDraft();
  useDraft.getState().set({
    text: { id: shape.id, x: shape.x, y: shape.y, value: shape.text, fontSize: shape.fontSize, color: shape.color },
  });
}

/** Turn the open text editor into a shape (or delete the shape if the text was cleared). */
export function commitTextDraft() {
  const draft = useDraft.getState().text;
  if (!draft) return;
  useDraft.getState().set({ text: null });

  const board = useBoard.getState();
  const existing = draft.id ? board.shapes[draft.id] : undefined;
  const value = draft.value.replace(/\s+$/, "");

  if (!value.trim()) {
    if (existing) board.commit(removePatch([existing]), "delete text");
    return;
  }

  const { w, h } = measureText(value, draft.fontSize);
  if (existing?.type === "text") {
    if (existing.text !== value) board.commit(updatePatch([[existing, { ...existing, text: value, w, h }]]), "edit text");
    return;
  }

  const shape: TextShape = {
    ...board.allocate(),
    type: "text",
    author: "student",
    color: draft.color,
    size: board.size,
    x: draft.x,
    y: draft.y,
    w,
    h,
    text: value,
    fontSize: draft.fontSize,
  };
  board.commit(addPatch([shape]), "text");
}

export function createTextTool(): Tool {
  return {
    cursor: "text",

    onDown(p) {
      const hit = topShapeAt(p.world);
      if (hit?.type === "text") return beginTextEdit(hit);
      // Clicking away from an open editor just finishes it.
      if (useDraft.getState().text) return commitTextDraft();

      const board = useBoard.getState();
      const fontSize = FONT_SIZE[board.size];
      useDraft.getState().set({
        text: { id: null, x: p.world[0], y: p.world[1] - fontSize * 0.65, value: "", fontSize, color: board.inkColor },
      });
    },

    onMove() {},
    onUp() {},
    onCancel() {},
  };
}
