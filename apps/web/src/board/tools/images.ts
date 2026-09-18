// Bringing a picture onto the board (PLAN.md §6).
//
// A photographed or pasted question is the quickest way to get work in front of
// the tutor, and since a snapshot is rendered from the board itself, whatever is
// dropped here is something the tutor can read and mark up.
import { addPatch } from "../model/history";
import { useBoard } from "../model/store";
import type { ImageShape, Vec } from "../model/types";

/** Formats the browser can decode. SVG is left out: it can carry scripts. */
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

const MAX_BYTES = 20 * 1024 * 1024;
/** Longest edge kept, in pixels: a phone photo is far bigger than the board needs. */
const MAX_EDGE = 1600;
/** Longest edge a newly placed picture covers on screen, in screen pixels. */
const PLACED_EDGE = 460;

/** What's wrong with this file, in words for the student, or null if it's fine. */
export function imageProblem(file: { type: string; size: number }): string | null {
  if (!IMAGE_TYPES.includes(file.type)) {
    return file.type === "image/svg+xml"
      ? "SVG pictures can carry scripts, so they can't go on the board. Try a PNG or a photo."
      : "That file isn't a picture the board can read.";
  }
  if (file.size > MAX_BYTES) return "That picture is too big to add.";
  return null;
}

/** Fit a picture inside a square of this edge, keeping its shape. Never enlarges. */
export function fitWithin(width: number, height: number, edge: number): { width: number; height: number } {
  const scale = Math.min(1, edge / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Shrink a picture to something the board can hold, as a data URL. */
async function toDataUrl(file: Blob): Promise<{ dataUrl: string; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_EDGE);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // WebP keeps transparency at a fraction of PNG's size; JPEG covers browsers without it.
  let dataUrl = canvas.toDataURL("image/webp", 0.85);
  if (!dataUrl.startsWith("data:image/webp")) dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return { dataUrl, width, height };
}

/**
 * Put pictures on the board around a point, as one undoable step each, and
 * leave them selected so they can be moved or resized straight away.
 *
 * @returns what went wrong with the first file that couldn't be added, if any.
 */
export async function addImagesToBoard(files: readonly File[], centre: Vec): Promise<string | null> {
  let problem: string | null = null;
  const added: string[] = [];

  for (const [index, file] of files.entries()) {
    const wrong = imageProblem(file);
    if (wrong) {
      problem ??= wrong;
      continue;
    }

    const { dataUrl, width, height } = await toDataUrl(file);
    const board = useBoard.getState();
    const placed = fitWithin(width, height, PLACED_EDGE / board.camera.z);
    // Several at once are stepped down the board rather than stacked exactly.
    const at: Vec = [centre[0] + index * 24, centre[1] + index * 24];
    const shape: ImageShape = {
      ...board.allocate(),
      type: "image",
      author: "student",
      color: "#000000",
      size: "m",
      x: at[0] - placed.width / 2,
      y: at[1] - placed.height / 2,
      w: placed.width,
      h: placed.height,
      imageId: board.addImage(dataUrl),
    };
    board.commit(addPatch([shape]), "add picture");
    added.push(shape.id);
  }

  if (added.length > 0) {
    useBoard.getState().setTool("select");
    useBoard.getState().setSelection(added);
  }
  return problem;
}

/** The image files in a drop or a paste, ignoring anything else carried along. */
export function imageFilesFrom(data: DataTransfer | null): File[] {
  return [...(data?.files ?? [])].filter((file) => file.type.startsWith("image/"));
}
