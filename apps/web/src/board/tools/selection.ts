import { hitTestShape, shapeBounds, unionBoxes } from "../model/geometry";
import { sortedShapes, useBoard } from "../model/store";
import type { Box, Shape, Vec } from "../model/types";

export type Handle = "nw" | "ne" | "sw" | "se";
export const HANDLES: Handle[] = ["nw", "ne", "sw", "se"];

/** Half the handle hit area in screen pixels (44px touch target). */
export const HANDLE_HIT_PX = 22;

export function selectionBounds(): Box | null {
  const { shapes, selection } = useBoard.getState();
  return unionBoxes(
    selection
      .map((id) => shapes[id])
      .filter(Boolean)
      .map(shapeBounds),
  );
}

export function handlePosition(box: Box, handle: Handle): Vec {
  return [handle[1] === "w" ? box.minX : box.maxX, handle[0] === "n" ? box.minY : box.maxY];
}

/** The top-most shape under a world point. */
export function topShapeAt(p: Vec, tolerancePx = 6): Shape | null {
  const { shapes, camera } = useBoard.getState();
  const list = sortedShapes(shapes);
  for (let i = list.length - 1; i >= 0; i--) {
    if (hitTestShape(list[i], p, tolerancePx / camera.z)) return list[i];
  }
  return null;
}
