import { useDraft } from "../model/draft";
import { boxFromCorners, dist, snapAngle } from "../model/geometry";
import { addPatch } from "../model/history";
import { useBoard } from "../model/store";
import type { PolygonShape, Shape, Vec } from "../model/types";
import type { BoardPointer, Tool } from "./types";

function draftBase() {
  const { inkColor, size } = useBoard.getState();
  return { id: "draft", num: 0, z: Infinity, author: "student" as const, color: inkColor, size, createdAt: 0 };
}

/** Line, arrow, rectangle, ellipse: press, drag, release. Shift snaps angles or keeps it square. */
export function createDragShapeTool(kind: "line" | "arrow" | "rect" | "ellipse"): Tool {
  let start: Vec | null = null;

  const build = (p: BoardPointer): Shape | null => {
    if (!start) return null;
    if (kind === "line" || kind === "arrow") {
      const b = p.shift ? snapAngle(start, p.world) : p.world;
      return { ...draftBase(), type: "line", a: start, b, arrow: kind === "arrow" };
    }
    let [x, y] = p.world;
    if (p.shift) {
      const side = Math.max(Math.abs(x - start[0]), Math.abs(y - start[1]));
      x = start[0] + Math.sign(x - start[0] || 1) * side;
      y = start[1] + Math.sign(y - start[1] || 1) * side;
    }
    const box = boxFromCorners(start, [x, y]);
    return { ...draftBase(), type: kind, x: box.minX, y: box.minY, w: box.maxX - box.minX, h: box.maxY - box.minY };
  };

  const reset = () => {
    start = null;
    useDraft.getState().set({ shape: null });
  };

  return {
    cursor: "crosshair",

    onDown(p) {
      start = p.world;
      useDraft.getState().set({ shape: build(p) });
    },

    onMove(p) {
      if (start) useDraft.getState().set({ shape: build(p) });
    },

    onUp(p) {
      const board = useBoard.getState();
      const shape = build(p);
      // Ignore accidental taps: require a few screen pixels of drag.
      if (shape && start && dist(start, p.world) * board.camera.z > 3) {
        board.commit(addPatch([{ ...shape, ...board.allocate() } as Shape]), kind);
      }
      reset();
    },

    onCancel: reset,
  };
}

const CLOSE_PX = 12;

/** Polygon: click to add corners, click the first corner to close, double-click or Enter to finish open. */
export function createPolygonTool(): Tool {
  let points: Vec[] = [];
  let cursor: Vec | null = null;

  const preview = () => {
    if (points.length === 0) return useDraft.getState().set({ shape: null });
    const shape: PolygonShape = {
      ...draftBase(),
      type: "polygon",
      points: cursor ? [...points, cursor] : points,
      closed: false,
    };
    useDraft.getState().set({ shape });
  };

  const reset = () => {
    points = [];
    cursor = null;
    useDraft.getState().set({ shape: null });
  };

  const finish = (closed: boolean) => {
    const board = useBoard.getState();
    if (points.length >= (closed ? 3 : 2)) {
      const shape: PolygonShape = {
        ...draftBase(),
        ...board.allocate(),
        type: "polygon",
        points,
        closed,
      };
      board.commit(addPatch([shape]), "polygon");
    }
    reset();
  };

  const target = (p: BoardPointer): Vec => {
    const last = points.at(-1);
    return p.shift && last ? snapAngle(last, p.world) : p.world;
  };

  return {
    cursor: "crosshair",

    onDown(p) {
      const z = useBoard.getState().camera.z;
      if (points.length >= 3 && dist(p.world, points[0]) * z <= CLOSE_PX) return finish(true);
      // The first click of a double-click already placed the final corner.
      if (p.detail >= 2 && points.length >= 2) return finish(false);
      points.push(target(p));
      preview();
    },

    onMove(p) {
      cursor = target(p);
      preview();
    },

    onHover(p) {
      if (points.length === 0) return;
      cursor = target(p);
      preview();
    },

    onUp() {},

    onCancel: reset,

    onKey(e) {
      if (points.length === 0) return false;
      if (e.key === "Enter") finish(false);
      else if (e.key === "Escape") reset();
      else if (e.key === "Backspace") {
        points.pop();
        preview();
      } else return false;
      return true;
    },
  };
}
