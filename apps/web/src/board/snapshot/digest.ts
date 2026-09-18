import { describeRecognition, recognizeShape, type BoardItem, type Point, type Recognition } from "@letsmath/shared";
import { boxesIntersect, shapeBounds } from "../model/geometry";
import { groupInk } from "../model/inkGroups";
import type { Box, InkShape, Shape } from "../model/types";

/** The world region a snapshot shows, and how world units map to its pixels. */
export interface SnapshotFrame {
  box: Box;
  width: number;
  height: number;
  scale: number;
}

/** What the tutor has already seen: item id → a signature that changes when the item does. */
export type SeenItems = Map<string, unknown>;

export interface Digest {
  text: string;
  items: BoardItem[];
  seen: SeenItems;
}

const SHAPE_NAMES: Record<Shape["type"], string> = {
  ink: "ink",
  line: "line",
  rect: "rectangle",
  ellipse: "ellipse",
  polygon: "polygon",
  text: "text",
  equation: "equation",
  image: "picture",
};

function shapeDetail(shape: Shape): string {
  switch (shape.type) {
    case "text":
      return ` "${shape.text.replace(/\s+/g, " ").slice(0, 80)}"`;
    case "equation":
      return ` ${shape.latex.slice(0, 120)}`;
    case "line":
      return shape.arrow ? " (arrow)" : "";
    case "polygon":
      return ` ${shape.points.length} corners, ${shape.closed ? "closed" : "open"}`;
    case "image":
      // The tutor can see it in the snapshot; this says it's a picture the
      // student added, not something drawn on the board.
      return " added by the student — read it from the snapshot";
    default:
      return "";
  }
}

/**
 * Describe the board for the tutor in compact text, and list the same items in
 * structured form so the server can resolve and snap what the tutor targets
 * (PLAN.md §3). Everything is in snapshot pixels.
 */
export function buildDigest(shapes: Shape[], frame: SnapshotFrame, seen: SeenItems): Digest {
  const toPixel = (x: number, y: number): Point => [
    Math.round(Math.min(frame.width, Math.max(0, (x - frame.box.minX) * frame.scale))),
    Math.round(Math.min(frame.height, Math.max(0, (y - frame.box.minY) * frame.scale))),
  ];
  const pixelBox = (box: Box): [number, number, number, number] => {
    const [x1, y1] = toPixel(box.minX, box.minY);
    const [x2, y2] = toPixel(box.maxX, box.maxY);
    return [x1, y1, x2, y2];
  };

  const nextSeen: SeenItems = new Map();
  const items: BoardItem[] = [];
  const lines: string[] = [
    `Snapshot: ${frame.width}×${frame.height} px of the student's current view. Boxes are [x1, y1, x2, y2] in snapshot pixels.`,
  ];
  let outside = 0;

  const mark = (id: string, signature: unknown) => {
    nextSeen.set(id, signature);
    return seen.get(id) === signature ? "  " : "* ";
  };

  // --- the student's handwriting, grouped into lines of working ---
  const strokesById = new Map(shapes.filter((s): s is InkShape => s.type === "ink").map((s) => [s.id, s]));
  const groups = groupInk(shapes);
  const visibleGroups = groups.filter((g) => boxesIntersect(g.box, frame.box));
  outside += groups.length - visibleGroups.length;

  if (visibleGroups.length > 0) {
    lines.push("Handwriting (one group per line of working, top to bottom):");
    for (const group of visibleGroups) {
      const prefix = mark(group.id, group.strokeIds.join(","));
      const strokes = group.strokeIds
        .map((id) => strokesById.get(id))
        .filter((s): s is InkShape => Boolean(s))
        .map((s) => s.points.map((p) => toPixel(p[0], p[1])));
      const recognition = recognizeShape(strokes);
      const note = describeRecognition(recognition);
      const count = `${group.strokeIds.length} stroke${group.strokeIds.length === 1 ? "" : "s"}`;
      const box = pixelBox(group.box);
      lines.push(`${prefix}${group.id} [${box.join(", ")}] ${count}${note ? ` · ${note}` : ""}`);
      items.push({ id: group.id, kind: "handwriting", box, ...partsOf(recognition) });
    }
  }

  // --- everything else the student made ---
  const others = shapes.filter((s) => s.type !== "ink" && s.author === "student");
  const visibleOthers = others.filter((s) => boxesIntersect(shapeBounds(s), frame.box));
  outside += others.length - visibleOthers.length;

  if (visibleOthers.length > 0) {
    lines.push("Shapes, text and equations:");
    for (const shape of visibleOthers) {
      const prefix = mark(`#${shape.num}`, shape);
      const box = pixelBox(shapeBounds(shape));
      lines.push(`${prefix}#${shape.num} ${SHAPE_NAMES[shape.type]} [${box.join(", ")}]${shapeDetail(shape)}`);
      items.push({ id: `#${shape.num}`, kind: "shape", box });
    }
  }

  // --- the tutor's own drawings, so it can refer to or erase them ---
  const annotations = shapes.filter((s) => s.author === "tutor" && boxesIntersect(shapeBounds(s), frame.box));
  if (annotations.length > 0) {
    lines.push("Your annotations already on the board:");
    for (const shape of annotations) {
      const box = pixelBox(shapeBounds(shape));
      mark(shape.id, shape);
      lines.push(`  ${shape.id} ${SHAPE_NAMES[shape.type]} [${box.join(", ")}]${shapeDetail(shape)}`);
      items.push({ id: shape.id, kind: "annotation", box });
    }
  }

  const highlights = shapes.filter(
    (s) => s.type === "ink" && s.tool === "highlighter" && s.author === "student" && boxesIntersect(shapeBounds(s), frame.box),
  ).length;
  if (highlights > 0) lines.push(`Highlighter strokes in view: ${highlights}.`);

  if (visibleGroups.length === 0 && visibleOthers.length === 0) lines.push("Nothing is written in this view.");
  if (outside > 0) lines.push(`Outside this view: ${outside} more item${outside === 1 ? "" : "s"}.`);

  return { text: lines.join("\n"), items, seen: nextSeen };
}

/** Recognised corners and sides become addressable parts: g4.v1, g4.s2. */
function partsOf(recognition: Recognition): Pick<BoardItem, "corners" | "sides"> {
  if (recognition.corners.length === 0) return {};
  return {
    corners: recognition.corners.map((c) => [Math.round(c[0]), Math.round(c[1])] as [number, number]),
    sides: recognition.sides.map((side) => ({
      id: side.id,
      a: [Math.round(side.a[0]), Math.round(side.a[1])] as [number, number],
      b: [Math.round(side.b[0]), Math.round(side.b[1])] as [number, number],
    })),
  };
}
