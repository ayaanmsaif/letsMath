import { useDraft } from "../model/draft";
import { addPatch } from "../model/history";
import { useBoard } from "../model/store";
import type { InkPoint, InkShape } from "../model/types";
import type { Tool } from "./types";

/** Pen and highlighter: collect every coalesced sample, redraw at most once per frame. */
export function createInkTool(kind: "pen" | "highlighter"): Tool {
  let points: InkPoint[] = [];
  let predicted: InkPoint[] = [];
  let simulatePressure = true;
  let frame = 0;

  const flush = () => {
    frame = 0;
    const board = useBoard.getState();
    useDraft.getState().set({
      ink: {
        tool: kind,
        color: kind === "highlighter" ? board.highlighterColor : board.inkColor,
        size: board.size,
        simulatePressure,
        points: points.slice(),
        predicted,
      },
    });
  };

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(flush);
  };

  const addSamples = (samples: InkPoint[]) => {
    // Drop samples closer than half a screen pixel; they add weight without detail.
    const minGap = 0.5 / useBoard.getState().camera.z;
    for (const s of samples) {
      const prev = points.at(-1);
      if (prev && Math.abs(prev[0] - s[0]) < minGap && Math.abs(prev[1] - s[1]) < minGap) continue;
      points.push(s);
    }
  };

  const reset = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    points = [];
    predicted = [];
    useDraft.getState().set({ ink: null });
  };

  return {
    cursor: "crosshair",

    onDown(p) {
      simulatePressure = p.pointerType !== "pen";
      points = [];
      addSamples(p.samples);
      predicted = [];
      flush();
    },

    onMove(p) {
      addSamples(p.samples);
      predicted = p.predicted;
      schedule();
    },

    onUp(p) {
      addSamples(p.samples);
      if (points.length > 0) {
        const board = useBoard.getState();
        const shape: InkShape = {
          ...board.allocate(),
          type: "ink",
          tool: kind,
          author: "student",
          color: kind === "highlighter" ? board.highlighterColor : board.inkColor,
          size: board.size,
          simulatePressure,
          points,
        };
        board.commit(addPatch([shape]), kind === "highlighter" ? "highlight" : "draw");
      }
      reset();
    },

    onCancel: reset,
  };
}
