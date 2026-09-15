import { fitBox, zoomAt } from "../model/camera";
import { useDraft } from "../model/draft";
import { shapeBounds, unionBoxes } from "../model/geometry";
import { useBoard, type ToolId } from "../model/store";
import { viewport } from "../render/viewport";
import { getTool } from "../tools/registry";

export const TOOL_SHORTCUTS: Record<ToolId, string> = {
  select: "V",
  hand: "H",
  pen: "P",
  highlighter: "M",
  eraser: "E",
  line: "L",
  arrow: "A",
  rect: "R",
  ellipse: "O",
  polygon: "G",
  text: "T",
  equation: "Q",
  laser: "Z",
};

const TOOL_BY_KEY = Object.fromEntries(
  Object.entries(TOOL_SHORTCUTS).map(([tool, key]) => [key.toLowerCase(), tool as ToolId]),
);

export function isTypingTarget(target: EventTarget | null): boolean {
  // MathLive's <math-field> keeps its editable area in a shadow root, so check the host tag too.
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|MATH-FIELD)$/.test(target.tagName));
}

const viewportCentre = (): [number, number] => [viewport.width / 2, viewport.height / 2];

export function zoomBy(factor: number) {
  const board = useBoard.getState();
  board.setCamera(zoomAt(board.camera, viewportCentre(), board.camera.z * factor));
}

export function resetZoom() {
  const board = useBoard.getState();
  board.setCamera(zoomAt(board.camera, viewportCentre(), 1));
}

export function zoomToFit() {
  const board = useBoard.getState();
  const box = unionBoxes(Object.values(board.shapes).map(shapeBounds));
  if (!box) return resetZoom();
  board.setCamera(fitBox(box, viewport.width, viewport.height));
}

export function installShortcuts(): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    if (isTypingTarget(e.target)) return;
    const board = useBoard.getState();
    const tool = getTool(board.tool);

    if (tool.onKey?.(e)) return e.preventDefault();

    const key = e.key.toLowerCase();
    if (e.ctrlKey || e.metaKey) {
      if (key === "z") e.shiftKey ? board.redo() : board.undo();
      else if (key === "y") board.redo();
      else if (key === "a") board.selectAll();
      else if (key === "d") board.duplicateSelection();
      else return;
      return e.preventDefault();
    }

    if (e.key === "Delete" || e.key === "Backspace") {
      if (board.selection.length > 0) {
        e.preventDefault();
        board.deleteSelection();
      }
    } else if (e.key === "Escape") {
      tool.onCancel();
      board.setSelection([]);
      useDraft.getState().set({ equation: null });
    } else if (e.shiftKey && e.code === "Digit1") {
      zoomToFit();
    } else if (e.shiftKey && e.code === "Digit0") {
      resetZoom();
    } else if (e.key === "+" || e.key === "=") {
      zoomBy(1.25);
    } else if (e.key === "-" || e.key === "_") {
      zoomBy(0.8);
    } else if (!e.shiftKey && !e.altKey && TOOL_BY_KEY[key]) {
      board.setTool(TOOL_BY_KEY[key]);
    }
  };

  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}
