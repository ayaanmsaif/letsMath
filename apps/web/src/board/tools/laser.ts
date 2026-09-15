import { useDraft } from "../model/draft";
import type { Tool } from "./types";

/** Laser pointer: a fading trail for pointing at things. Nothing is stored. */
export function createLaserTool(): Tool {
  let down = false;

  const push = (points: [number, number, number][]) => {
    const now = performance.now();
    // Keep only the last second of trail; the overlay fades it out.
    const trail = [...useDraft.getState().laser, ...points].filter((pt) => now - pt[2] < 1000);
    useDraft.getState().set({ laser: trail });
  };

  return {
    cursor: "none",

    onDown(p) {
      down = true;
      push([[p.world[0], p.world[1], performance.now()]]);
    },

    onMove(p) {
      if (!down) return;
      const now = performance.now();
      push(p.samples.map((s) => [s[0], s[1], now]));
    },

    onUp() {
      down = false;
    },

    onCancel() {
      down = false;
    },
  };
}
