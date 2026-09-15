import { boxesIntersect, shapeBounds } from "../model/geometry";
import { groupInk } from "../model/inkGroups";
import type { Box, Shape } from "../model/types";

/** The world region a snapshot shows, and how world units map to its pixels. */
export interface SnapshotFrame {
  box: Box;
  width: number;
  height: number;
  scale: number;
}

/** What the tutor has already seen: item id → a signature that changes when the item does. */
export type SeenItems = Map<string, unknown>;

const SHAPE_NAMES: Record<Shape["type"], string> = {
  ink: "ink",
  line: "line",
  rect: "rectangle",
  ellipse: "ellipse",
  polygon: "polygon",
  text: "text",
  equation: "equation",
};

function pixelBox(box: Box, frame: SnapshotFrame): string {
  const x = (v: number) => Math.round(Math.min(frame.width, Math.max(0, (v - frame.box.minX) * frame.scale)));
  const y = (v: number) => Math.round(Math.min(frame.height, Math.max(0, (v - frame.box.minY) * frame.scale)));
  return `[${x(box.minX)}, ${y(box.minY)}, ${x(box.maxX)}, ${y(box.maxY)}]`;
}

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
    default:
      return "";
  }
}

/**
 * Describe the board for the tutor in compact text (PLAN.md §3). Returns the
 * digest and the updated "seen" map to keep once the tutor has received it.
 */
export function buildDigest(shapes: Shape[], frame: SnapshotFrame, seen: SeenItems): { text: string; seen: SeenItems } {
  const nextSeen: SeenItems = new Map();
  const lines: string[] = [
    `Snapshot: ${frame.width}×${frame.height} px of the student's current view. Boxes are [x1, y1, x2, y2] in snapshot pixels.`,
  ];
  let outside = 0;

  const mark = (id: string, signature: unknown) => {
    nextSeen.set(id, signature);
    return seen.get(id) === signature ? "  " : "* ";
  };

  const groups = groupInk(shapes);
  const visibleGroups = groups.filter((g) => boxesIntersect(g.box, frame.box));
  outside += groups.length - visibleGroups.length;
  if (visibleGroups.length > 0) {
    lines.push("Handwriting (one group per line of working, top to bottom):");
    for (const g of visibleGroups) {
      const prefix = mark(g.id, g.strokeIds.join(","));
      lines.push(`${prefix}${g.id} ${pixelBox(g.box, frame)} ${g.strokeIds.length} stroke${g.strokeIds.length === 1 ? "" : "s"}`);
    }
  }

  const others = shapes.filter((s) => s.type !== "ink");
  const visibleOthers = others.filter((s) => boxesIntersect(shapeBounds(s), frame.box));
  outside += others.length - visibleOthers.length;
  if (visibleOthers.length > 0) {
    lines.push("Shapes, text and equations:");
    for (const s of visibleOthers) {
      const prefix = mark(`#${s.num}`, s);
      lines.push(`${prefix}#${s.num} ${SHAPE_NAMES[s.type]} ${pixelBox(shapeBounds(s), frame)}${shapeDetail(s)}`);
    }
  }

  const highlights = shapes.filter(
    (s) => s.type === "ink" && s.tool === "highlighter" && boxesIntersect(shapeBounds(s), frame.box),
  ).length;
  if (highlights > 0) lines.push(`Highlighter strokes in view: ${highlights}.`);

  if (visibleGroups.length === 0 && visibleOthers.length === 0) lines.push("Nothing is written in this view.");
  if (outside > 0) lines.push(`Outside this view: ${outside} more item${outside === 1 ? "" : "s"}.`);

  return { text: lines.join("\n"), seen: nextSeen };
}
