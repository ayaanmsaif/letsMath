import { resizedSize, STANDARD_TIER, type BoardSnapshot } from "@letsmath/shared";
import { viewportBox } from "../model/camera";
import { sortedShapes, useBoard } from "../model/store";
import type { Camera } from "../model/types";
import type { Shapes } from "../model/history";
import { viewport } from "../render/viewport";
import { buildDigest, type SeenItems, type SnapshotFrame } from "./digest";

/**
 * About 1,500 visual tokens. It fits the standard image tier, so it's never
 * resized for any model and the pixel coordinates Claude returns stay exact.
 */
const TARGET_VISUAL_TOKENS = 1500;

export interface PendingSnapshot {
  snapshot: BoardSnapshot;
  /** Call once the tutor has actually received this snapshot. */
  commit: () => void;
}

let seen: SeenItems = new Map();
let lastSent: { shapes: Shapes; camera: Camera } | null = null;

/** Forget what the tutor has seen, e.g. when a new tutor session starts. */
export function resetSnapshotMemory() {
  seen = new Map();
  lastSent = null;
}

/**
 * Render what the student is looking at. Returns null when nothing has changed
 * since the tutor last looked, so an unchanged board costs no image tokens.
 */
export async function captureSnapshot(): Promise<PendingSnapshot | null> {
  const { shapes, camera } = useBoard.getState();
  if (lastSent && lastSent.shapes === shapes && lastSent.camera === camera) return null;

  const layer = document.querySelector<SVGGElement>('[data-layer="shapes"]');
  if (!layer || viewport.width === 0) return null;

  const box = viewportBox(camera, viewport.width, viewport.height);
  const worldW = box.maxX - box.minX;
  const worldH = box.maxY - box.minY;
  const idealScale = Math.sqrt((TARGET_VISUAL_TOKENS * 28 * 28) / (worldW * worldH));
  const [width, height] = resizedSize(
    Math.max(1, Math.round(worldW * idealScale)),
    Math.max(1, Math.round(worldH * idealScale)),
    STANDARD_TIER,
  );
  const frame: SnapshotFrame = { box, width, height, scale: width / worldW };

  const markup = new XMLSerializer().serializeToString(layer);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="${box.minX} ${box.minY} ${worldW} ${worldH}" preserveAspectRatio="none">` +
    `<rect x="${box.minX}" y="${box.minY}" width="${worldW}" height="${worldH}" fill="#ffffff"/>${markup}</svg>`;

  const { data, mediaType } = await rasterize(svg, width, height);
  const digest = buildDigest(sortedShapes(shapes), frame, seen);

  return {
    snapshot: { data, mediaType, width, height, origin: [box.minX, box.minY], scale: frame.scale, digest: digest.text },
    commit: () => {
      seen = digest.seen;
      lastSent = { shapes, camera };
    },
  };
}

async function rasterize(svg: string, width: number, height: number) {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);

    const encode = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.92));
    // Safari can't encode WebP and silently returns PNG, so fall back to JPEG.
    let blob = await encode("image/webp");
    if (!blob || blob.type !== "image/webp") blob = await encode("image/jpeg");
    if (!blob) throw new Error("Couldn't encode the board snapshot.");

    return { data: await toBase64(blob), mediaType: blob.type as BoardSnapshot["mediaType"] };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
