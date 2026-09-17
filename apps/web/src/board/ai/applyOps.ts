// Turn the tutor's resolved drawings into board shapes (PLAN.md §4).
//
// Marks are stroked wobbly paths rather than pressure ink, so they can be
// animated as if drawn. They live on the same board as the student's work but
// are authored "tutor", so they can be hidden, erased, or undone on their own.
import type { ResolvedOp, TutorColor } from "@letsmath/shared";
import { panBy } from "../model/camera";
import { useDraft } from "../model/draft";
import { shapeBounds, unionBoxes } from "../model/geometry";
import { removePatch, type Patch } from "../model/history";
import { addPatch } from "../model/history";
import { useBoard } from "../model/store";
import { viewport } from "../render/viewport";
import { FONT_SIZE } from "../model/style";
import type { EquationShape, PolygonShape, Shape, TextShape, Vec } from "../model/types";
import { measureText } from "../tools/text";
import {
  angleArc,
  arrowStrokes,
  circleAround,
  crossAt,
  highlightThrough,
  isRightAngle,
  tickAt,
  underlineUnder,
  type Box,
  type Pt,
} from "./handDrawn";

const COLORS: Record<TutorColor, string> = {
  mistake: "#f0625a",
  correct: "#16a34a",
  attention: "#f59e0b",
  tutor: "#7c3aed",
};

const STROKE_WIDTH = 2.6;

/** Ids of the shapes each annotation drew, so erase and animation can find them. */
const shapesByAnnotation = new Map<string, string[]>();

export function forgetAnnotations() {
  shapesByAnnotation.clear();
}

/** Bring an annotation into view and make it glow briefly (used by the chat chips). */
export function focusAnnotation(annotationId: string) {
  const board = useBoard.getState();
  const ids = shapesByAnnotation.get(annotationId) ?? [annotationId];
  const shapes = ids.map((id) => board.shapes[id]).filter(Boolean);
  if (shapes.length === 0) return;

  const box = unionBoxes(shapes.map(shapeBounds))!;
  const centre = [(box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2] as const;
  const camera = board.camera;
  const onScreen = [centre[0] * camera.z + camera.x, centre[1] * camera.z + camera.y];
  // Only move the board when the annotation isn't comfortably in view.
  const margin = 80;
  const needsMove =
    onScreen[0] < margin ||
    onScreen[1] < margin ||
    onScreen[0] > viewport.width - margin ||
    onScreen[1] > viewport.height - margin;
  if (needsMove) {
    board.setCamera(panBy(camera, viewport.width / 2 - onScreen[0], viewport.height / 2 - onScreen[1]));
  }

  useDraft.getState().set({ pulsing: ids });
  window.setTimeout(() => {
    const still = useDraft.getState().pulsing;
    if (still === ids || still.every((id) => ids.includes(id))) useDraft.getState().set({ pulsing: [] });
  }, 900);
}

function baseShape(op: ResolvedOp, index: number, color: string) {
  return {
    id: index === 0 ? op.id : `${op.id}#${index + 1}`,
    num: 0,
    z: 100_000 + useBoard.getState().nextZ + index,
    author: "tutor" as const,
    color,
    size: "m" as const,
    createdAt: Date.now(),
  };
}

const stroke = (op: ResolvedOp, index: number, color: string, points: Pt[], width = STROKE_WIDTH): PolygonShape => ({
  ...baseShape(op, index, color),
  strokeWidth: width,
  type: "polygon",
  points: points as Vec[],
  closed: false,
});

/** Maths labels render through MathJax; plain notes are text. */
async function labelShape(op: ResolvedOp, index: number, color: string, at: Pt, content: string, latex: boolean, size: "s" | "m" | "l"): Promise<Shape> {
  const fontSize = FONT_SIZE[size];
  if (latex) {
    const { texToSvg } = await import("../math/mathjax");
    const rendered = await texToSvg(content);
    const equation: EquationShape = {
      ...baseShape(op, index, color),
      type: "equation",
      x: at[0],
      y: at[1],
      w: rendered.width * fontSize,
      h: rendered.height * fontSize,
      latex: content,
      svg: rendered.svg,
      viewBox: rendered.viewBox,
    };
    return equation;
  }
  const text: TextShape = {
    ...baseShape(op, index, color),
    type: "text",
    x: at[0],
    y: at[1],
    ...measureText(content, fontSize),
    text: content,
    fontSize,
  };
  return text;
}

const looksLikeLatex = (text: string) => /[\\^_{}]/.test(text);

/** Where the tutor's pen should be while it draws this mark. */
function penPointFor(op: ResolvedOp): [number, number] | null {
  switch (op.kind) {
    case "circle":
    case "highlight":
    case "underline":
      return [op.box[0], op.box[1]];
    case "mark":
    case "write":
      return op.at;
    case "arrow":
      return op.from;
    case "angle_arc":
      return op.vertex;
    case "diagram": {
      const first = op.parts[0];
      if (!first) return null;
      return first.kind === "stroke" ? first.points[0] : first.at;
    }
    case "erase":
      return null;
  }
}

/** Build the shapes for one drawing. */
async function shapesFor(op: ResolvedOp): Promise<Shape[]> {
  switch (op.kind) {
    case "circle": {
      const colour = COLORS[op.color];
      const shapes: Shape[] = [stroke(op, 0, colour, circleAround(op.box as Box, op.id))];
      if (op.note) {
        shapes.push(await labelShape(op, 1, colour, [op.box[2] + 16, op.box[1] - 4], op.note, looksLikeLatex(op.note), "s"));
      }
      return shapes;
    }
    case "highlight": {
      const { path, thickness } = highlightThrough(op.box as Box);
      return [{ ...stroke(op, 0, COLORS[op.color], path, thickness), opacity: 0.32 }];
    }
    case "underline":
      return [stroke(op, 0, COLORS[op.color], underlineUnder(op.box as Box, op.id))];
    case "mark": {
      const colour = op.symbol === "check" ? COLORS.correct : COLORS.mistake;
      if (op.symbol === "check") return [stroke(op, 0, colour, tickAt(op.at as Pt, op.size), 3)];
      if (op.symbol === "cross") {
        return crossAt(op.at as Pt, op.size).map((points, i) => stroke(op, i, colour, points, 3));
      }
      return [await labelShape(op, 0, COLORS.attention, op.at as Pt, "?", false, "m")];
    }
    case "arrow": {
      const colour = COLORS[op.color];
      const shapes: Shape[] = arrowStrokes(op.from as Pt, op.to as Pt, op.id).map((points, i) => stroke(op, i, colour, points));
      if (op.label) {
        shapes.push(await labelShape(op, shapes.length, colour, op.from as Pt, op.label, looksLikeLatex(op.label), "s"));
      }
      return shapes;
    }
    case "angle_arc": {
      const colour = COLORS[op.color];
      const { path, labelAt } = angleArc(op.vertex as Pt, op.p1 as Pt, op.p2 as Pt, op.radius);
      const shapes: Shape[] = [stroke(op, 0, colour, path)];
      if (isRightAngle(op.vertex as Pt, op.p1 as Pt, op.p2 as Pt)) {
        // A right angle gets the usual square instead of a plain arc.
        const [vx, vy] = op.vertex;
        const a1 = Math.atan2(op.p1[1] - vy, op.p1[0] - vx);
        const a2 = Math.atan2(op.p2[1] - vy, op.p2[0] - vx);
        const r = op.radius * 0.7;
        shapes[0] = stroke(op, 0, colour, [
          [vx + Math.cos(a1) * r, vy + Math.sin(a1) * r],
          [vx + Math.cos(a1) * r + Math.cos(a2) * r, vy + Math.sin(a1) * r + Math.sin(a2) * r],
          [vx + Math.cos(a2) * r, vy + Math.sin(a2) * r],
        ]);
      }
      if (op.label) {
        shapes.push(await labelShape(op, 1, colour, labelAt, op.label, looksLikeLatex(op.label), "s"));
      }
      return shapes;
    }
    case "write":
      return [await labelShape(op, 0, COLORS[op.color], op.at as Pt, op.content, op.format === "latex", op.size)];
    case "diagram": {
      const shapes: Shape[] = [];
      for (const [index, part] of op.parts.entries()) {
        const colour = part.attention ? COLORS.attention : COLORS.tutor;
        if (part.kind === "stroke") {
          // Keep the compiler's id (d1.AB), so the tutor can point at a side later.
          shapes.push({ ...stroke(op, index, colour, part.points as Pt[]), id: part.id, closed: part.closed });
        } else {
          const text = await labelShape(op, index, colour, part.at as Pt, part.text, looksLikeLatex(part.text), "s");
          shapes.push({ ...text, id: part.id });
        }
      }
      if (op.caption && shapes.length > 0) {
        // Below everything drawn, not just the first part, so it can't land on a label.
        const box = unionBoxes(shapes.map(shapeBounds))!;
        shapes.push(
          await labelShape(op, shapes.length, COLORS.tutor, [box.minX, box.maxY + 28], op.caption, false, "s"),
        );
      }
      return shapes;
    }
    case "erase":
      return [];
  }
}

/**
 * Draw one op onto the board. All the ops of a turn share a mergeKey, so a
 * single undo removes the whole annotation.
 */
export async function applyOp(op: ResolvedOp, turnId: string): Promise<string[]> {
  const board = useBoard.getState();

  if (op.kind === "erase") {
    const ids =
      op.ids === "all"
        ? Object.values(board.shapes).filter((s) => s.author === "tutor").map((s) => s.id)
        : op.ids.flatMap((id) => shapesByAnnotation.get(id) ?? [id]);
    const doomed = ids.map((id) => board.shapes[id]).filter(Boolean);
    if (doomed.length > 0) board.commit(removePatch(doomed) as Patch, "tutor erased", "tutor", turnId);
    for (const id of op.ids === "all" ? [...shapesByAnnotation.keys()] : op.ids) shapesByAnnotation.delete(id);
    return [];
  }

  const shapes = await shapesFor(op);
  if (shapes.length === 0) return [];

  // Move the tutor's pen to where this mark begins.
  useDraft.getState().set({ tutorCursor: penPointFor(op) });

  useBoard.setState({ nextZ: board.nextZ + shapes.length });
  useBoard.getState().commit(addPatch(shapes), `tutor ${op.kind}`, "tutor", turnId);
  const ids = shapes.map((s) => s.id);
  shapesByAnnotation.set(op.id, ids);
  return ids;
}
