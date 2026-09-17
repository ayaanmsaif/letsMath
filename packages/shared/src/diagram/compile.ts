// Turn a diagram the tutor described into exact geometry (PLAN.md §4b).
//
// Pure: the same code runs on the server (placing and validating), in the
// browser (drawing) and in tests. The tutor supplies maths coordinates; this
// works out every line, arc and label position, so nothing depends on the
// model guessing pixels.
import type { DiagramSpec } from "./schema";

export type Vec2 = [number, number];

/** A drawn piece of a diagram, in world units, addressable as d1.AB and so on. */
export type DiagramPart =
  | { id: string; kind: "stroke"; points: Vec2[]; closed: boolean; dashed: boolean; attention: boolean }
  | { id: string; kind: "label"; at: Vec2; text: string; attention: boolean };

export interface CompiledDiagram {
  parts: DiagramPart[];
  /** The box the diagram occupies in world units: [x1, y1, x2, y2]. */
  box: [number, number, number, number];
}

export class DiagramError extends Error {}

/** Where the diagram should go, in world units. */
export interface DiagramPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
}

const ANGLE_STEPS = 18;
/** How far an angle's arc sits from its corner, as a fraction of the shorter arm. */
const ARC_FRACTION = 0.28;
const MAX_ARC = 0.18;
/** How far labels sit outside the figure, as a fraction of its size. */
const LABEL_GAP = 0.09;
/** Slack left around everything, so label text doesn't touch the edge. */
const MARGIN = 0.1;

const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const len = (v: Vec2) => Math.hypot(v[0], v[1]);
const norm = (v: Vec2): Vec2 => {
  const l = len(v) || 1;
  return [v[0] / l, v[1] / l];
};

/**
 * Compile a described diagram into strokes and labels.
 *
 * Two passes: build everything in maths coordinates first, then fit the whole
 * drawing — labels included — into the space it was given. Fitting only the
 * points would let labels spill out over the student's work.
 *
 * @param prefix Diagram id, so parts come out as d1.AB, d1.angle_A, …
 */
export function compileDiagram(spec: DiagramSpec, placement: DiagramPlacement, prefix: string): CompiledDiagram {
  const points = new Map<string, Vec2>();
  for (const p of spec.points) {
    if (points.has(p.name)) throw new DiagramError(`Point ${p.name} is defined twice.`);
    points.set(p.name, [p.x, p.y]);
  }
  if (points.size === 0) throw new DiagramError("A diagram needs at least one point.");

  const at = (name: string, role: string): Vec2 => {
    const point = points.get(name);
    if (!point) throw new DiagramError(`No point called ${name} for the ${role}. Defined: ${[...points.keys()].join(", ")}.`);
    return point;
  };

  const xs = [...points.values()].map((p) => p[0]);
  const ys = [...points.values()].map((p) => p[1]);
  const figureSize = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 1;
  /** Labels are pushed away from here, so they sit outside the figure. */
  const centre: Vec2 = [
    xs.reduce((sum, x) => sum + x, 0) / points.size,
    ys.reduce((sum, y) => sum + y, 0) / points.size,
  ];

  // ---- pass one: build the drawing in maths coordinates ----
  const drawn: DiagramPart[] = [];
  const stroke = (id: string, pts: Vec2[], options: { dashed?: boolean; attention?: boolean } = {}) =>
    drawn.push({
      id: `${prefix}.${id}`,
      kind: "stroke",
      points: pts,
      closed: false,
      dashed: options.dashed ?? false,
      attention: options.attention ?? false,
    });
  const label = (id: string, point: Vec2, text: string, attention = false) =>
    drawn.push({ id: `${prefix}.${id}`, kind: "label", at: point, text, attention });

  // Shapes first, the way a figure is drawn.
  for (const shape of spec.polygons) {
    if (shape.through.length < 3) throw new DiagramError("A polygon needs at least three points.");
    const corners = shape.through.map((name) => at(name, "polygon"));
    // One stroke per side, so each is addressable: d1.AB, d1.BC, …
    for (let i = 0; i < corners.length; i++) {
      const next = (i + 1) % corners.length;
      stroke(`${shape.through[i]}${shape.through[next]}`, [corners[i], corners[next]]);
    }
  }

  for (const line of spec.segments) {
    stroke(`${line.from}${line.to}`, [at(line.from, "segment"), at(line.to, "segment")], { dashed: line.dashed });
  }

  // Then the angle marks.
  for (const mark of spec.angles) {
    const corner = at(mark.at, "angle");
    const first = at(mark.from, "angle arm");
    const second = at(mark.to, "angle arm");
    const armA = norm(sub(first, corner));
    const armB = norm(sub(second, corner));
    const radius = Math.min(
      Math.min(len(sub(first, corner)), len(sub(second, corner))) * ARC_FRACTION,
      figureSize * MAX_ARC,
    );

    if (mark.rightAngle) {
      // The usual little square, rather than an arc.
      stroke(`angle_${mark.at}`, [
        [corner[0] + armA[0] * radius, corner[1] + armA[1] * radius],
        [corner[0] + (armA[0] + armB[0]) * radius, corner[1] + (armA[1] + armB[1]) * radius],
        [corner[0] + armB[0] * radius, corner[1] + armB[1] * radius],
      ]);
      continue;
    }

    const start = Math.atan2(armA[1], armA[0]);
    let sweep = Math.atan2(armB[1], armB[0]) - start;
    while (sweep > Math.PI) sweep -= Math.PI * 2;
    while (sweep < -Math.PI) sweep += Math.PI * 2;
    stroke(
      `angle_${mark.at}`,
      Array.from({ length: ANGLE_STEPS + 1 }, (_, i) => {
        const angle = start + sweep * (i / ANGLE_STEPS);
        return [corner[0] + Math.cos(angle) * radius, corner[1] + Math.sin(angle) * radius] as Vec2;
      }),
    );

    if (mark.text) {
      const middle = start + sweep / 2;
      label(
        `label_${mark.at}`,
        [corner[0] + Math.cos(middle) * radius * 2, corner[1] + Math.sin(middle) * radius * 2],
        mark.text,
      );
    }
  }

  // Labels last, so they can be placed clear of everything.
  const placedLabels: Vec2[] = [];
  /** Push a label away until it isn't sitting on one already placed. */
  const clearOfOthers = (spot: Vec2, outward: Vec2): Vec2 => {
    let point = spot;
    for (let attempt = 0; attempt < 6; attempt++) {
      const tooClose = placedLabels.some((other) => len(sub(other, point)) < figureSize * LABEL_GAP * 1.6);
      if (!tooClose) break;
      point = [point[0] + outward[0] * figureSize * LABEL_GAP, point[1] + outward[1] * figureSize * LABEL_GAP];
    }
    placedLabels.push(point);
    return point;
  };

  for (const side of spec.labels) {
    const a = at(side.from, "side label");
    const b = at(side.to, "side label");
    if (!side.text) continue;
    const middle: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    // Sit just outside the side, on the far side from the figure's centre.
    const along = norm(sub(b, a));
    let outward: Vec2 = [-along[1], along[0]];
    const toCentre = sub(centre, middle);
    if (outward[0] * toCentre[0] + outward[1] * toCentre[1] > 0) outward = [-outward[0], -outward[1]];

    // Text sits to the right of its anchor and hangs below it, so a label on a
    // vertical side needs more room sideways, and one below a horizontal side
    // needs more room downwards, or it lands back on the line.
    const vertical = Math.abs(along[1]) > Math.abs(along[0]);
    const room = figureSize * LABEL_GAP * (vertical ? 1.8 : 1.3);
    const spot: Vec2 = [middle[0] + outward[0] * room, middle[1] + outward[1] * room];

    label(`side_${side.from}${side.to}`, clearOfOthers(spot, outward), side.text, side.attention);
  }

  for (const mark of spec.markedPoints) {
    if (!mark.text) continue;
    const point = at(mark.at, "point");
    // Nudge the name away from the middle of the figure.
    const away = norm(sub(point, centre));
    label(
      `point_${mark.at}`,
      [point[0] + away[0] * figureSize * LABEL_GAP, point[1] + away[1] * figureSize * LABEL_GAP],
      mark.text,
    );
  }

  if (drawn.length === 0) throw new DiagramError("That diagram would draw nothing.");

  // ---- pass two: fit the whole drawing into the space it was given ----
  const everything = drawn.flatMap((part) => (part.kind === "stroke" ? part.points : [part.at]));
  const minX = Math.min(...everything.map((p) => p[0]));
  const maxX = Math.max(...everything.map((p) => p[0]));
  const minY = Math.min(...everything.map((p) => p[1]));
  const maxY = Math.max(...everything.map((p) => p[1]));
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;

  const scale = Math.min((placement.width * (1 - MARGIN)) / spanX, (placement.height * (1 - MARGIN)) / spanY);
  const offsetX = placement.x + (placement.width - spanX * scale) / 2 - minX * scale;
  // Maths counts y upwards and screens count it downwards, so the drawing flips.
  const offsetY = placement.y + (placement.height - spanY * scale) / 2 + maxY * scale;
  const world = (p: Vec2): Vec2 => [offsetX + p[0] * scale, offsetY - p[1] * scale];

  const parts: DiagramPart[] = drawn.map((part) =>
    part.kind === "stroke" ? { ...part, points: part.points.map(world) } : { ...part, at: world(part.at) },
  );

  return {
    parts,
    box: [offsetX + minX * scale, offsetY - maxY * scale, offsetX + maxX * scale, offsetY - minY * scale],
  };
}
