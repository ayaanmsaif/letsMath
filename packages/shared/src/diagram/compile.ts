// Turn a diagram the tutor described into exact geometry (PLAN.md §4b).
//
// Pure: the same code runs on the server (placing and validating), in the
// browser (drawing) and in tests. The tutor supplies maths coordinates; this
// works out every line, arc and label position, so nothing depends on the
// model guessing pixels.
import { compileExpression, ExpressionError, samplePlot } from "./plot";
import { DiagramError, len, norm, resolvePoints, sub, type Vec2 } from "./points";
import type { DiagramAxes, DiagramSpec } from "./schema";

export { DiagramError, type Vec2 } from "./points";

/** A drawn piece of a diagram, in world units, addressable as d1.AB and so on. */
export type DiagramPart =
  | { id: string; kind: "stroke"; points: Vec2[]; closed: boolean; dashed: boolean; attention: boolean; faint: boolean }
  | { id: string; kind: "label"; at: Vec2; text: string; attention: boolean; anchor: LabelAnchor };

/**
 * Which part of a label sits at its point. The compiler can't measure rendered
 * text — MathJax runs in the browser — so it names the point it means and the
 * renderer, which can measure, does the positioning.
 */
export type LabelAnchor = "top-left" | "top-centre" | "middle-left" | "middle-right" | "bottom-centre";

export interface CompiledDiagram {
  parts: DiagramPart[];
  /** The box the diagram occupies in world units: [x1, y1, x2, y2]. */
  box: [number, number, number, number];
}

/** Where the diagram should go, in world units. */
export interface DiagramPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
}

const ANGLE_STEPS = 18;
const CIRCLE_STEPS = 72;
/** How far an angle's arc sits from its corner, as a fraction of the shorter arm. */
const ARC_FRACTION = 0.28;
const MAX_ARC = 0.18;
/** How far labels sit outside the figure, as a fraction of its size. */
const LABEL_GAP = 0.09;
/** A marked point's dot, as a fraction of the figure's size. */
const DOT = 0.014;
/** Slack left around everything, so label text doesn't touch the edge. */
const MARGIN = 0.1;

/** Room kept around a graph for its tick numbers and axis names, in world units. */
const GRAPH_PAD = { left: 42, right: 22, top: 22, bottom: 42 };
const TICK = 5;
/**
 * Rough size of a small label. Measuring text needs a browser, and this runs on
 * the server too, so tick numbers are centred on an estimate.
 */
const CHAR_W = 9;
const LINE_H = 22;
const MAX_TICKS = 24;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** Maths coordinates to world coordinates, for a graph's frame. */
interface Frame {
  world: (p: Vec2) => Vec2;
  scaleX: number;
  scaleY: number;
}

/** Points around a circle, from an angle through a sweep, both in radians. */
function around(middle: Vec2, radius: number, from: number, sweep: number, steps: number): Vec2[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const turn = from + (sweep * i) / steps;
    return [middle[0] + Math.cos(turn) * radius, middle[1] + Math.sin(turn) * radius] as Vec2;
  });
}

/**
 * The anchor that keeps a label's text on the far side of its point from what
 * it labels. Text that always hung to the right ran back across a left-hand
 * side, and across the circle from a point on its left.
 *
 * @param direction Which way the label sits from its point, in maths coordinates (y up).
 */
function anchorAway(direction: Vec2): LabelAnchor {
  if (Math.abs(direction[0]) >= Math.abs(direction[1])) return direction[0] >= 0 ? "middle-left" : "middle-right";
  return direction[1] >= 0 ? "bottom-centre" : "top-centre";
}

/**
 * Roughly how wide a label will draw. LaTeX is mostly instructions rather than
 * glyphs — \frac{3\pi}{2} is fourteen characters but draws about as wide as two
 * — so a fraction counts as its wider half and each command as one symbol.
 * Only spacing decisions use this; the renderer measures the real thing.
 */
function estimateWidth(text: string): number {
  const symbols = text
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, (_, top: string, bottom: string) =>
      top.length >= bottom.length ? top : bottom,
    )
    // A function name draws as its letters, a Greek letter as a single glyph,
    // and the spaces around an equals sign take room of their own.
    .replace(/\\(sin|cos|tan|sec|csc|cot|log|ln|exp)\b/g, "$1")
    .replace(/\\[a-zA-Z]+/g, "n")
    .replace(/[{}^_$]/g, "");
  return Math.max(1, symbols.length) * CHAR_W;
}

/** Leave room for the widest number on the y-axis, or it hangs off the left. */
function leftPad(axes: DiagramAxes): number {
  const widest = tickValues(axes.yMin, axes.yMax, axes.yStep, false).reduce(
    (most, value) => Math.max(most, estimateWidth(formatTick(value, false))),
    CHAR_W,
  );
  return Math.max(GRAPH_PAD.left, widest + TICK + 10);
}

function graphFrame(axes: DiagramAxes, placement: DiagramPlacement): Frame {
  const xSpan = axes.xMax - axes.xMin;
  const ySpan = axes.yMax - axes.yMin;
  if (!(xSpan > 0)) throw new DiagramError("The axes need xMax to be greater than xMin.");
  if (!(ySpan > 0)) throw new DiagramError("The axes need yMax to be greater than yMin.");

  const left0 = leftPad(axes);
  const boxW = Math.max(40, placement.width - left0 - GRAPH_PAD.right);
  const boxH = Math.max(40, placement.height - GRAPH_PAD.top - GRAPH_PAD.bottom);
  let scaleX = boxW / xSpan;
  let scaleY = boxH / ySpan;
  // A circle only stays round if both axes are scaled the same.
  if (axes.equalScale) scaleX = scaleY = Math.min(scaleX, scaleY);

  // Centre whatever space the scaling leaves over.
  const left = placement.x + left0 + (boxW - xSpan * scaleX) / 2;
  const top = placement.y + GRAPH_PAD.top + (boxH - ySpan * scaleY) / 2;
  return {
    scaleX,
    scaleY,
    world: (p) => [left + (p[0] - axes.xMin) * scaleX, top + (axes.yMax - p[1]) * scaleY],
  };
}

/** A tick spacing that gives round numbers: 1, 2, 2.5 or 5 times a power of ten. */
function niceStep(span: number): number {
  const rough = span / 8;
  const magnitude = 10 ** Math.floor(Math.log10(rough || 1));
  for (const step of [1, 2, 2.5, 5]) if (rough <= step * magnitude) return step * magnitude;
  return 10 * magnitude;
}

function tickValues(min: number, max: number, step: number, piTicks: boolean): number[] {
  const size = step > 0 ? step : piTicks ? Math.PI / 2 : niceStep(max - min);
  const values: number[] = [];
  for (let i = Math.ceil(min / size - 1e-9); values.length < MAX_TICKS; i++) {
    const value = i * size;
    if (value > max + 1e-9) break;
    values.push(Math.abs(value) < 1e-9 ? 0 : value);
  }
  return values;
}

/** Tick numbers, as multiples of pi where that's what the graph is about. */
function formatTick(value: number, piTicks: boolean): string {
  if (!piTicks) return String(Number(value.toFixed(4)));
  const halves = Math.round((value / Math.PI) * 2);
  if (Math.abs((halves * Math.PI) / 2 - value) > 1e-6) return String(Number(value.toFixed(2)));
  if (halves === 0) return "0";
  const sign = halves < 0 ? "-" : "";
  const count = Math.abs(halves);
  if (count % 2 === 0) return `${sign}${count / 2 === 1 ? "" : count / 2}\\pi`;
  return `${sign}\\frac{${count === 1 ? "" : count}\\pi}{2}`;
}

/**
 * Build the axes, ticks and curves of a graph, straight into world units.
 *
 * Unlike the figure below, a graph knows its scale up front, so tick marks and
 * numbers can be offset by exact pixel amounts rather than fractions of the
 * drawing.
 */
function buildGraph(spec: DiagramSpec, axes: DiagramAxes, frame: Frame, placement: DiagramPlacement, prefix: string) {
  const parts: DiagramPart[] = [];
  const stroke = (
    id: string,
    points: Vec2[],
    options: { dashed?: boolean; attention?: boolean; faint?: boolean } = {},
  ) =>
    parts.push({
      id: `${prefix}.${id}`,
      kind: "stroke",
      points,
      closed: false,
      dashed: options.dashed ?? false,
      attention: options.attention ?? false,
      faint: options.faint ?? false,
    });
  const label = (id: string, at: Vec2, text: string, attention = false, anchor: LabelAnchor = "top-left") =>
    parts.push({ id: `${prefix}.${id}`, kind: "label", at, text, attention, anchor });

  const xTicks = tickValues(axes.xMin, axes.xMax, axes.xStep, axes.piTicks);
  const yTicks = tickValues(axes.yMin, axes.yMax, axes.yStep, false);
  // The axes cross at zero when zero is in view, and hug the edge otherwise.
  const originX = clamp(0, axes.xMin, axes.xMax);
  const originY = clamp(0, axes.yMin, axes.yMax);

  // Faint grid first, so everything else sits on top of it. It is drawn thin and
  // pale: at full weight it reads as a cage around the curve rather than a guide.
  if (axes.grid) {
    for (const [i, value] of xTicks.entries()) {
      stroke(`gridx${i + 1}`, [frame.world([value, axes.yMin]), frame.world([value, axes.yMax])], { faint: true });
    }
    for (const [i, value] of yTicks.entries()) {
      stroke(`gridy${i + 1}`, [frame.world([axes.xMin, value]), frame.world([axes.xMax, value])], { faint: true });
    }
  }

  stroke("xaxis", [frame.world([axes.xMin, originY]), frame.world([axes.xMax, originY])]);
  stroke("yaxis", [frame.world([originX, axes.yMin]), frame.world([originX, axes.yMax])]);

  // An axis running through the middle of the plot has curves crossing it, and
  // numbers written beside it get struck through — a unit circle crosses the
  // x-axis exactly at the 1 and -1 ticks. So numbers go in the margins, the way
  // graph paper reads, while the ticks themselves stay on the axes.
  const numbersBelow = Math.max(frame.world([0, originY])[1] + TICK, frame.world([0, axes.yMin])[1]) + 4;
  const numbersAt = Math.min(frame.world([originX, 0])[0] - TICK, frame.world([axes.xMin, 0])[0]) - 6;

  // The lowest y number and the first x number meet in the bottom-left corner;
  // when both would be written, the y one stays.
  const cornerTaken = yTicks.some((v) => Math.abs(v - axes.yMin) < 1e-9 && Math.abs(v - originY) >= 1e-9);

  for (const [i, value] of xTicks.entries()) {
    // Where the axes cross, one tick would be written over the other.
    if (Math.abs(value - originX) < 1e-9) continue;
    const [x, y] = frame.world([value, originY]);
    stroke(`xtick${i + 1}`, [
      [x, y - TICK],
      [x, y + TICK],
    ]);
    if (cornerTaken && Math.abs(value - axes.xMin) < 1e-9) continue;
    // Centred on the tick by the renderer: a pi fraction is many characters but
    // few glyphs, so shifting it by character count throws it onto its neighbour.
    label(`xnum${i + 1}`, [x, numbersBelow], formatTick(value, axes.piTicks), false, "top-centre");
  }

  for (const [i, value] of yTicks.entries()) {
    if (Math.abs(value - originY) < 1e-9) continue;
    const [x, y] = frame.world([originX, value]);
    stroke(`ytick${i + 1}`, [
      [x - TICK, y],
      [x + TICK, y],
    ]);
    label(`ynum${i + 1}`, [numbersAt, y], formatTick(value, false), false, "middle-right");
  }

  if (axes.xLabel) {
    // Above the axis, or it lands on the last tick number written below it.
    const [endX, endY] = frame.world([axes.xMax, originY]);
    label("xlabel", [endX + 8, endY - LINE_H - 2], axes.xLabel);
  }
  if (axes.yLabel) label("ylabel", [frame.world([originX, axes.yMax])[0] + 8, placement.y], axes.yLabel);

  /** Curve labels are few, so nudging one clear of the last is enough. */
  const curveLabels: { x: number; y: number; width: number }[] = [];
  const clearOfCurveLabels = (spot: Vec2, width: number): Vec2 => {
    let [x, y] = spot;
    for (let attempt = 0; attempt < 4; attempt++) {
      // These are centred on their point, so compare centres, not left edges.
      const clash = curveLabels.some(
        (other) => Math.abs(other.y - y) < LINE_H && Math.abs(other.x - x) < (other.width + width) / 2,
      );
      if (!clash) break;
      y += LINE_H + 2;
    }
    curveLabels.push({ x, y, width });
    return [x, y];
  };

  for (const [index, plot] of spec.plots.entries()) {
    const id = `plot${index + 1}`;
    let fn: (x: number) => number;
    try {
      fn = compileExpression(plot.expr);
    } catch (err) {
      if (err instanceof ExpressionError) throw new DiagramError(`${err.message} (in "${plot.expr}")`);
      throw err;
    }

    // from and to both zero means "across the whole x-axis".
    const whole = plot.from === plot.to;
    const from = Math.max(axes.xMin, whole ? axes.xMin : Math.min(plot.from, plot.to));
    const to = Math.min(axes.xMax, whole ? axes.xMax : Math.max(plot.from, plot.to));
    if (!(to > from)) throw new DiagramError(`The domain given for "${plot.expr}" lies outside the axes.`);

    const runs = samplePlot(fn, from, to, { range: [axes.yMin, axes.yMax] });
    if (runs.length === 0) {
      throw new DiagramError(
        `"${plot.expr}" never comes into view between y=${axes.yMin} and y=${axes.yMax}. Widen the y-axis.`,
      );
    }
    // An asymptote splits a curve into pieces, each drawn as its own stroke.
    for (const [piece, run] of runs.entries()) {
      stroke(piece === 0 ? id : `${id}_${piece + 1}`, run.map(frame.world), { attention: plot.attention });
    }

    if (plot.label) {
      // Where the curve runs furthest from the axis, and not at either end: close
      // to the axis a label lands among the tick numbers, and at the ends it runs
      // off the edge.
      const inset = (to - from) * 0.15;
      const away = runs.flat().filter((p) => p[0] >= from + inset && p[0] <= to - inset);
      const peak = (away.length > 0 ? away : runs.flat()).reduce((best, p) =>
        Math.abs(p[1] - originY) > Math.abs(best[1] - originY) ? p : best,
      );
      const [x, y] = frame.world(peak);
      const width = estimateWidth(plot.label);
      // Outside the curve's bend: above a hump, below a trough.
      const above = peak[1] >= originY;
      const spot: Vec2 = [
        clamp(x, placement.x + width / 2, placement.x + placement.width - width / 2),
        above ? y - 6 : y + 6,
      ];
      label(
        `${id}_label`,
        clearOfCurveLabels(spot, width),
        plot.label,
        plot.attention,
        above ? "bottom-centre" : "top-centre",
      );
    }
  }

  return parts;
}

/**
 * The box a diagram covers, its writing included. A label's text is estimated
 * from its anchor, since real text is only measured once rendered — but leaving
 * the text out let a long coordinate label reach well past the space the board
 * had kept clear for the diagram.
 */
function boxOf(parts: DiagramPart[]): [number, number, number, number] {
  const corners = parts.flatMap((part): Vec2[] => {
    if (part.kind === "stroke") return part.points;
    const width = estimateWidth(part.text);
    // A stacked fraction stands about half as tall again as a line of text.
    const height = /\\frac/.test(part.text) ? LINE_H * 1.6 : LINE_H;
    const [x, y] = part.at;
    const centred = part.anchor === "top-centre" || part.anchor === "bottom-centre";
    const left = centred ? x - width / 2 : part.anchor === "middle-right" ? x - width : x;
    const middle = part.anchor === "middle-left" || part.anchor === "middle-right";
    const top = part.anchor === "bottom-centre" ? y - height : middle ? y - height / 2 : y;
    return [
      [left, top],
      [left + width, top + height],
    ];
  });
  return [
    Math.min(...corners.map((p) => p[0])),
    Math.min(...corners.map((p) => p[1])),
    Math.max(...corners.map((p) => p[0])),
    Math.max(...corners.map((p) => p[1])),
  ];
}

/**
 * Compile a described diagram into strokes and labels.
 *
 * A figure is built in maths coordinates and then fitted — labels included —
 * into the space it was given, since fitting only the points would let labels
 * spill out over the student's work. A graph instead works to the frame its
 * axes set, so its ticks and numbers can be placed by eye-sized amounts.
 *
 * @param prefix Diagram id, so parts come out as d1.AB, d1.angle_A, …
 */
export function compileDiagram(spec: DiagramSpec, placement: DiagramPlacement, prefix: string): CompiledDiagram {
  const axes = spec.axes[0];
  // Curves without axes come first: it's the more useful thing to be told.
  if (spec.plots.length > 0 && !axes) throw new DiagramError("A plot needs axes to sit on. Add them.");

  const points = resolvePoints(spec.points, spec.constructions);
  if (points.size === 0 && !axes) throw new DiagramError("A diagram needs at least one point.");

  const at = (name: string, role: string): Vec2 => {
    const point = points.get(name);
    if (!point) throw new DiagramError(`No point called ${name} for the ${role}. Defined: ${[...points.keys()].join(", ")}.`);
    return point;
  };

  const circles = spec.circles.map((circle) => {
    const middle = at(circle.centre, "circle");
    const radius = circle.through ? len(sub(at(circle.through, "circle"), middle)) : circle.radius;
    if (!(radius > 0)) {
      throw new DiagramError(
        `The circle centred on ${circle.centre} needs a point on it in through, or a radius above 0.`,
      );
    }
    return { ...circle, middle, radius };
  });
  const arcs = spec.arcs.map((arc) => {
    const middle = at(arc.centre, "arc");
    const start = sub(at(arc.from, "arc"), middle);
    const end = sub(at(arc.to, "arc"), middle);
    if (len(start) === 0 || len(end) === 0) {
      throw new DiagramError(`The arc from ${arc.from} to ${arc.to} needs both ends away from its centre, ${arc.centre}.`);
    }
    return { ...arc, middle, start, end, radius: len(start) };
  });
  /** Anything round, so the name of a point on one can go straight outwards. */
  const rounds = [...circles, ...arcs].map(({ middle, radius }) => ({ middle, radius }));

  // A circle only stays round if both axes are scaled alike, so it insists.
  const frame = axes ? graphFrame({ ...axes, equalScale: axes.equalScale || rounds.length > 0 }, placement) : null;
  const graphParts = axes && frame ? buildGraph(spec, axes, frame, placement, prefix) : [];

  const extents: Vec2[] = [
    ...points.values(),
    ...rounds.flatMap(({ middle, radius }): Vec2[] => [
      [middle[0] - radius, middle[1] - radius],
      [middle[0] + radius, middle[1] + radius],
    ]),
  ];
  const xs = extents.map((p) => p[0]);
  const ys = extents.map((p) => p[1]);
  const figureSize = axes
    ? Math.min(axes.xMax - axes.xMin, axes.yMax - axes.yMin)
    : Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 1;

  /** Labels are pushed away from here, so they sit outside the figure. */
  const named = [...points.values()];
  const centre: Vec2 =
    named.length > 0
      ? [named.reduce((sum, p) => sum + p[0], 0) / named.length, named.reduce((sum, p) => sum + p[1], 0) / named.length]
      : [0, 0];

  // Ids must be unique, or a later part replaces an earlier one on the board: a
  // polygon's side AB and a separate segment AB would otherwise share d1.AB.
  const used = new Set(graphParts.map((part) => part.id));
  const unique = (id: string) => {
    let candidate = `${prefix}.${id}`;
    for (let n = 2; used.has(candidate); n++) candidate = `${prefix}.${id}_${n}`;
    used.add(candidate);
    return candidate;
  };

  // ---- pass one: build the figure in maths coordinates ----
  const drawn: DiagramPart[] = [];
  const stroke = (id: string, pts: Vec2[], options: { dashed?: boolean; attention?: boolean } = {}) =>
    drawn.push({
      id: unique(id),
      kind: "stroke",
      points: pts,
      closed: false,
      dashed: options.dashed ?? false,
      attention: options.attention ?? false,
      faint: false,
    });
  const label = (id: string, point: Vec2, text: string, anchor: LabelAnchor, attention = false) =>
    drawn.push({ id: unique(id), kind: "label", at: point, text, attention, anchor });

  // Circles and shapes first, the way a figure is drawn.
  for (const circle of circles) {
    stroke(`circle_${circle.centre}`, around(circle.middle, circle.radius, 0, Math.PI * 2, CIRCLE_STEPS), {
      attention: circle.attention,
    });
  }

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

  for (const arc of arcs) {
    // Anticlockwise from one end to the other, the way angles run in maths.
    const from = Math.atan2(arc.start[1], arc.start[0]);
    let sweep = Math.atan2(arc.end[1], arc.end[0]) - from;
    while (sweep <= 0) sweep += Math.PI * 2;
    const steps = Math.max(8, Math.ceil((sweep / (Math.PI * 2)) * CIRCLE_STEPS));
    stroke(`arc_${arc.from}${arc.to}`, around(arc.middle, arc.radius, from, sweep, steps), {
      attention: arc.attention,
    });
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
    stroke(`angle_${mark.at}`, around(corner, radius, start, sweep, ANGLE_STEPS));

    if (mark.text) {
      const middle = start + sweep / 2;
      const direction: Vec2 = [Math.cos(middle), Math.sin(middle)];
      label(
        `label_${mark.at}`,
        [corner[0] + direction[0] * radius * 1.6, corner[1] + direction[1] * radius * 1.6],
        mark.text,
        anchorAway(direction),
      );
    }
  }

  // Dots, before any names are written beside them.
  for (const mark of spec.markedPoints) {
    if (mark.dot) stroke(`dot_${mark.at}`, around(at(mark.at, "point"), figureSize * DOT, 0, Math.PI * 2, 12));
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

    // The anchor keeps the text running away from the side, so a long label
    // can't reach back across its own line.
    const room = figureSize * LABEL_GAP * 1.2;
    const spot: Vec2 = [middle[0] + outward[0] * room, middle[1] + outward[1] * room];
    label(`side_${side.from}${side.to}`, clearOfOthers(spot, outward), side.text, anchorAway(outward), side.attention);
  }

  /** Straight out from a circle the point sits on, or else away from the figure's middle. */
  const outwardFrom = (point: Vec2): Vec2 => {
    const round = rounds.find(({ middle, radius }) => Math.abs(len(sub(point, middle)) - radius) <= radius * 0.02);
    if (round) return norm(sub(point, round.middle));
    const away = sub(point, centre);
    return len(away) > figureSize * 0.01 ? norm(away) : [0, 1];
  };

  for (const mark of spec.markedPoints) {
    if (!mark.text) continue;
    const point = at(mark.at, "point");
    const away = outwardFrom(point);
    const gap = figureSize * LABEL_GAP * 0.6;
    label(`point_${mark.at}`, [point[0] + away[0] * gap, point[1] + away[1] * gap], mark.text, anchorAway(away));
  }

  // ---- pass two: put it where it belongs, in world units ----
  if (frame) {
    // The axes set the frame, and any figure drawn alongside shares it.
    const parts = [
      ...graphParts,
      ...drawn.map((part) =>
        part.kind === "stroke" ? { ...part, points: part.points.map(frame.world) } : { ...part, at: frame.world(part.at) },
      ),
    ];
    return { parts, box: boxOf(parts) };
  }

  if (drawn.length === 0) throw new DiagramError("That diagram would draw nothing.");

  // A figure has no frame of its own, so fit the whole drawing into the space.
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

  return { parts, box: boxOf(parts) };
}
