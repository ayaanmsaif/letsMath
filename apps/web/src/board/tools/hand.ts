import { panBy } from "../model/camera";
import { useBoard } from "../model/store";
import type { Camera, Vec } from "../model/types";
import type { Tool } from "./types";

export function createHandTool(): Tool {
  let start: { screen: Vec; camera: Camera } | null = null;

  return {
    cursor: "grab",

    onDown(p) {
      start = { screen: p.screen, camera: useBoard.getState().camera };
    },

    onMove(p) {
      if (!start) return;
      useBoard
        .getState()
        .setCamera(panBy(start.camera, p.screen[0] - start.screen[0], p.screen[1] - start.screen[1]));
    },

    onUp() {
      start = null;
    },

    onCancel() {
      start = null;
    },
  };
}
