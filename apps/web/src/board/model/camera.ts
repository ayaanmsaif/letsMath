import type { Box, Camera, Vec } from "./types";

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export const screenToWorld = (cam: Camera, p: Vec): Vec => [(p[0] - cam.x) / cam.z, (p[1] - cam.y) / cam.z];

export const worldToScreen = (cam: Camera, p: Vec): Vec => [p[0] * cam.z + cam.x, p[1] * cam.z + cam.y];

/** Zoom to z while keeping the world point under screenPoint fixed. */
export function zoomAt(cam: Camera, screenPoint: Vec, z: number): Camera {
  const nextZ = clampZoom(z);
  const [wx, wy] = screenToWorld(cam, screenPoint);
  return { x: screenPoint[0] - wx * nextZ, y: screenPoint[1] - wy * nextZ, z: nextZ };
}

export const panBy = (cam: Camera, dx: number, dy: number): Camera => ({ ...cam, x: cam.x + dx, y: cam.y + dy });

/** The world-space box visible in a viewport of the given screen size. */
export function viewportBox(cam: Camera, width: number, height: number): Box {
  const [minX, minY] = screenToWorld(cam, [0, 0]);
  const [maxX, maxY] = screenToWorld(cam, [width, height]);
  return { minX, minY, maxX, maxY };
}

/** Camera that centres box in the viewport, capped at 100% zoom so small drawings don't blow up. */
export function fitBox(box: Box, width: number, height: number, padding = 80): Camera {
  const bw = Math.max(box.maxX - box.minX, 1);
  const bh = Math.max(box.maxY - box.minY, 1);
  const z = clampZoom(Math.min((width - padding * 2) / bw, (height - padding * 2) / bh, 1));
  return {
    x: width / 2 - (box.minX + bw / 2) * z,
    y: height / 2 - (box.minY + bh / 2) * z,
    z,
  };
}
