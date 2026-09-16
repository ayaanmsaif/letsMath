// Turn a tool call into a drawing in world units (PLAN.md §4a).
//
// The model works in snapshot pixels and is approximate; this snaps to the real
// geometry of the board so annotations land exactly on the ink.
import {
  boardOpSchemas,
  MAX_ERASE_IDS,
  type BoardItem,
  type BoardOpName,
  type ResolvedOp,
  type WorldBox,
  type WorldPoint,
} from "@letsmath/shared";

/** How the snapshot the tutor looked at maps back onto the board. */
export interface SnapshotMapping {
  origin: [number, number];
  scale: number;
  items: BoardItem[];
  /** Snapshot size in pixels, used to keep written notes on screen. */
  width?: number;
  height?: number;
}

/** A raw box only snaps to an item that overlaps it this much. */
const SNAP_IOU = 0.3;
/** An angle's vertex snaps to a corner within this many snapshot pixels. */
const CORNER_SNAP_PX = 20;

export class OpError extends Error {}

type PixelBox = [number, number, number, number];
type PixelPoint = [number, number];

/** The API can't constrain array lengths in strict tools, so check them here. */
function asPoint(value: number[] | undefined, what: string): PixelPoint {
  if (!value || value.length !== 2) throw new OpError(`${what} needs exactly two numbers: [x, y].`);
  return [value[0], value[1]];
}

function asBox(value: number[], what: string): PixelBox {
  if (value.length !== 4) throw new OpError(`${what} needs exactly four numbers: [x1, y1, x2, y2].`);
  return [value[0], value[1], value[2], value[3]];
}

const area = (b: PixelBox) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);

const overlaps = (a: PixelBox, b: PixelBox) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

function intersectionOverUnion(a: PixelBox, b: PixelBox): number {
  const overlap: PixelBox = [
    Math.max(a[0], b[0]),
    Math.max(a[1], b[1]),
    Math.min(a[2], b[2]),
    Math.min(a[3], b[3]),
  ];
  const both = area(overlap);
  const union = area(a) + area(b) - both;
  return union <= 0 ? 0 : both / union;
}

export function createResolver(mapping: SnapshotMapping, nextAnnotationId: () => string) {
  const toWorldPoint = ([x, y]: [number, number]): WorldPoint => [
    mapping.origin[0] + x / mapping.scale,
    mapping.origin[1] + y / mapping.scale,
  ];
  const toWorldBox = (box: PixelBox): WorldBox => {
    const [x1, y1] = toWorldPoint([box[0], box[1]]);
    const [x2, y2] = toWorldPoint([box[2], box[3]]);
    return [x1, y1, x2, y2];
  };
  const toWorldLength = (px: number) => px / mapping.scale;

  const byId = new Map(mapping.items.map((item) => [item.id, item]));
  /** Boxes drawn during this turn, so notes don't land on the tutor's own marks. */
  const placedThisTurn: PixelBox[] = [];

  /** Approximate size of a written note in snapshot pixels. */
  const noteBox = (at: PixelPoint, content: string, size: "s" | "m" | "l"): PixelBox => {
    const fontPx = { s: 18, m: 26, l: 40 }[size] * mapping.scale;
    return [at[0], at[1], at[0] + content.length * fontPx * 0.55, at[1] + fontPx * 1.3];
  };

  /** Slide a note clear of the work and of marks already made this turn. */
  function findClearSpot(at: PixelPoint, content: string, size: "s" | "m" | "l"): PixelPoint {
    const occupied = [...mapping.items.map((i) => i.box), ...placedThisTurn];
    const step = 14;
    let point: PixelPoint = [at[0], at[1]];

    for (let attempt = 0; attempt < 10; attempt++) {
      const box = noteBox(point, content, size);
      const clash = occupied.find((other) => intersectionOverUnion(box, other) > 0 || overlaps(box, other));
      if (!clash) break;
      // Prefer moving down, out of the line of working, then nudge right.
      const below: PixelPoint = [point[0], clash[3] + step];
      const fitsBelow = !mapping.height || noteBox(below, content, size)[3] < mapping.height;
      point = fitsBelow ? below : [clash[2] + step, point[1]];
    }
    return point;
  }

  /** An id may name a whole item (g4), a corner (g4.v1) or a side (g4.s2). */
  function resolvePart(id: string): { box: PixelBox; point?: [number, number] } | null {
    const item = byId.get(id);
    if (item) return { box: item.box };

    const [parentId, part] = id.split(".");
    const parent = byId.get(parentId);
    if (!parent || !part) return null;

    const corner = /^v(\d+)$/.exec(part);
    if (corner) {
      const point = parent.corners?.[Number(corner[1]) - 1];
      if (!point) return null;
      return { box: [point[0], point[1], point[0], point[1]], point };
    }

    const side = parent.sides?.find((s) => s.id === part);
    if (side) {
      return {
        box: [
          Math.min(side.a[0], side.b[0]),
          Math.min(side.a[1], side.b[1]),
          Math.max(side.a[0], side.b[0]),
          Math.max(side.a[1], side.b[1]),
        ],
      };
    }
    return null;
  }

  /** Resolve a target to a box in snapshot pixels, snapping a loose box onto real ink. */
  function resolveTarget(target: { id: string | null; box: number[] | null }): PixelBox {
    if (target.id) {
      const found = resolvePart(target.id);
      if (!found) throw new OpError(`No such thing on the board: ${target.id}`);
      return found.box;
    }
    if (!target.box) throw new OpError("Give either an id or a box.");
    const box = asBox(target.box, "target.box");

    let best: { item: BoardItem; iou: number } | null = null;
    for (const item of mapping.items) {
      const iou = intersectionOverUnion(box, item.box);
      if (iou > SNAP_IOU && (!best || iou > best.iou)) best = { item, iou };
    }
    if (best) return best.item.box;

    // A guessed box that matches nothing usually means the wrong coordinates.
    // Drawing it anyway produces marks in odd places, so ask for an id instead.
    const width = box[2] - box[0];
    const height = box[3] - box[1];
    const tooThin = width < 4 || height < 4;
    const tooBig =
      mapping.width !== undefined &&
      mapping.height !== undefined &&
      width * height > 0.6 * mapping.width * mapping.height;
    if (tooThin || tooBig) {
      throw new OpError(
        "That box doesn't match anything on the board. Use an id from the digest instead, such as g4, #12, or a part like g4.s2.",
      );
    }
    return box;
  }

  /** Pull an angle's vertex onto the nearest recognised corner. */
  function snapToCorner(point: [number, number]): [number, number] {
    let best: { corner: [number, number]; distance: number } | null = null;
    for (const item of mapping.items) {
      for (const corner of item.corners ?? []) {
        const distance = Math.hypot(corner[0] - point[0], corner[1] - point[1]);
        if (distance <= CORNER_SNAP_PX && (!best || distance < best.distance)) best = { corner, distance };
      }
    }
    return best ? best.corner : point;
  }

  return function resolve(name: BoardOpName, rawInput: unknown): ResolvedOp {
    const parsed = boardOpSchemas[name].safeParse(rawInput);
    if (!parsed.success) throw new OpError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    const id = nextAnnotationId();

    type TargetInput = { id: string | null; box: number[] | null };

    switch (name) {
      case "circle": {
        const input = parsed.data as { target: TargetInput; color: never; note: string | null };
        return { id, kind: "circle", box: toWorldBox(resolveTarget(input.target)), color: input.color, note: input.note };
      }
      case "highlight": {
        const input = parsed.data as { target: TargetInput; color: never };
        return { id, kind: "highlight", box: toWorldBox(resolveTarget(input.target)), color: input.color };
      }
      case "underline": {
        const input = parsed.data as { target: TargetInput; color: never };
        return { id, kind: "underline", box: toWorldBox(resolveTarget(input.target)), color: input.color };
      }
      case "mark": {
        const input = parsed.data as {
          target: TargetInput;
          symbol: "check" | "cross" | "question";
        };
        const box = resolveTarget(input.target);
        // Teachers mark in the margin, just to the right of the work.
        const at = toWorldPoint([box[2] + 18, (box[1] + box[3]) / 2]);
        return { id, kind: "mark", at, size: toWorldLength(26), symbol: input.symbol };
      }
      case "arrow": {
        const input = parsed.data as { from: number[]; to: number[]; label: string | null; color: never };
        return {
          id,
          kind: "arrow",
          from: toWorldPoint(asPoint(input.from, "from")),
          to: toWorldPoint(asPoint(input.to, "to")),
          label: input.label,
          color: input.color,
        };
      }
      case "angle_arc": {
        const input = parsed.data as {
          vertex: number[];
          p1: number[];
          p2: number[];
          label: string | null;
          color: never;
        };
        const p1 = asPoint(input.p1, "p1");
        const p2 = asPoint(input.p2, "p2");
        const vertex = snapToCorner(asPoint(input.vertex, "vertex"));
        const armLength = Math.min(
          Math.hypot(p1[0] - vertex[0], p1[1] - vertex[1]),
          Math.hypot(p2[0] - vertex[0], p2[1] - vertex[1]),
        );
        return {
          id,
          kind: "angle_arc",
          vertex: toWorldPoint(vertex),
          p1: toWorldPoint(p1),
          p2: toWorldPoint(p2),
          // A readable arc sits a little way along the shorter arm.
          radius: toWorldLength(Math.max(18, Math.min(48, armLength * 0.35))),
          label: input.label,
          color: input.color,
        };
      }
      case "write": {
        const input = parsed.data as {
          at: number[];
          content: string;
          format: "text" | "latex";
          size: "s" | "m" | "l";
          color: never;
        };
        const spot = findClearSpot(asPoint(input.at, "at"), input.content, input.size);
        placedThisTurn.push(noteBox(spot, input.content, input.size));
        return {
          id,
          kind: "write",
          at: toWorldPoint(spot),
          content: input.content,
          format: input.format,
          size: input.size,
          color: input.color,
        };
      }
      case "erase_drawings": {
        const input = parsed.data as { ids: string[] };
        const all = input.ids.length === 1 && input.ids[0] === "all";
        return { id, kind: "erase", ids: all ? "all" : input.ids.slice(0, MAX_ERASE_IDS) };
      }
    }
  };
}
