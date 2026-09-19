// Marking what the tutor did, without a second opinion from another model
// (PLAN.md §8, M6).
//
// The compiler hands back real coordinates, so most of this is measurement
// rather than judgement: a right angle either is 90 degrees or it isn't.
import type { DiagramPart, ResolvedOp, Vec2 } from "@letsmath/shared";
import type { CheckResult, Checks } from "./types";

type Stroke = Extract<DiagramPart, { kind: "stroke" }>;

/** Every drawn part of every diagram, flattened. */
function partsOf(ops: ResolvedOp[]) {
  return ops.flatMap((op) => (op.kind === "diagram" ? op.parts : []));
}

const strokes = (ops: ResolvedOp[]) => partsOf(ops).filter((part): part is Stroke => part.kind === "stroke");

function boxOf(points: Vec2[]) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}

/** A part is round when it is as wide as it is tall, within a fiftieth. */
function roundness(points: Vec2[]) {
  const box = boxOf(points);
  const width = box.right - box.left;
  const height = box.bottom - box.top;
  return { width, height, off: Math.abs(width - height) / Math.max(width, height, 1) };
}

/**
 * The angle of a straight line drawn from a circle's centre out to its edge,
 * measured the way a student would read it: anticlockwise from the horizontal.
 * Screen coordinates count downwards, so the sign flips.
 */
function radiusAngles(ops: ResolvedOp[]): number[] {
  const circles = strokes(ops)
    .map((part) => ({ part, shape: roundness(part.points) }))
    .filter(({ part, shape }) => part.points.length > 20 && shape.off < 0.02);

  const angles: number[] = [];
  for (const { part, shape } of circles) {
    const box = boxOf(part.points);
    const centre: [number, number] = [(box.left + box.right) / 2, (box.top + box.bottom) / 2];
    const radius = shape.width / 2;
    for (const line of strokes(ops)) {
      if (line.points.length !== 2) continue;
      const [a, b] = line.points;
      const fromCentre = Math.hypot(a[0] - centre[0], a[1] - centre[1]);
      const toRim = Math.hypot(b[0] - centre[0], b[1] - centre[1]);
      // One end at the middle, the other out on the edge.
      if (fromCentre > radius * 0.15 || Math.abs(toRim - radius) > radius * 0.15) continue;
      angles.push((Math.atan2(centre[1] - b[1], b[0] - centre[0]) * 180) / Math.PI);
    }
  }
  return angles;
}

export interface Attempt {
  ops: ResolvedOp[];
  reply: string;
  tools: string[];
  refusals: number;
}

export function scoreAttempt(expect: Checks, attempt: Attempt): CheckResult[] {
  const results: CheckResult[] = [];
  const add = (name: string, passed: boolean, detail?: string) => results.push({ name, passed, detail });
  const ids = partsOf(attempt.ops).map((part) => part.id);

  for (const kind of expect.drew ?? []) {
    add(`drew ${kind}`, attempt.ops.some((op) => op.kind === kind), `drew ${attempt.ops.map((o) => o.kind).join(", ") || "nothing"}`);
  }

  for (const pattern of expect.parts ?? []) {
    const wanted = new RegExp(pattern);
    add(`has a part matching ${pattern}`, ids.some((id) => wanted.test(id)), `parts: ${ids.slice(0, 8).join(", ")}`);
  }

  if (expect.round) {
    const wanted = new RegExp(expect.round);
    const found = strokes(attempt.ops).filter((part) => wanted.test(part.id));
    const worst = found.map((part) => roundness(part.points)).sort((a, b) => b.off - a.off)[0];
    add(
      `${expect.round} is round`,
      found.length > 0 && worst.off < 0.02,
      worst ? `${worst.width.toFixed(0)} by ${worst.height.toFixed(0)}` : "no such part",
    );
  }

  if (expect.radiusAt !== undefined) {
    const angles = radiusAngles(attempt.ops);
    const near = angles.some((angle) => Math.abs(angle - expect.radiusAt!) < 1.5);
    add(`a radius at ${expect.radiusAt}°`, near, angles.length ? `found ${angles.map((a) => a.toFixed(1)).join(", ")}` : "no radius found");
  }

  if (expect.segmentAt !== undefined) {
    const angles = strokes(attempt.ops)
      .filter((part) => part.points.length === 2)
      .map((part) => {
        const [a, b] = part.points;
        // Screen y counts downwards, so flip it to read the angle as a student would.
        const angle = (Math.atan2(a[1] - b[1], b[0] - a[0]) * 180) / Math.PI;
        return angle < -90 ? angle + 180 : angle > 90 ? angle - 180 : angle;
      });
    const near = angles.some((angle) => Math.abs(angle - expect.segmentAt!) < 4);
    add(
      `a line at ${expect.segmentAt}°`,
      near,
      angles.length ? `found ${angles.map((a) => a.toFixed(0)).join(", ")}` : "no straight lines",
    );
  }

  for (const { pattern, count } of expect.atLeast ?? []) {
    const found = ids.filter((id) => new RegExp(pattern).test(id)).length;
    add(`${count} or more parts matching ${pattern}`, found >= count, `found ${found}`);
  }

  if (expect.smooth) {
    // A curve drawn straight through an asymptote shows up as one huge vertical step.
    const curves = strokes(attempt.ops).filter((part) => /\.plot/.test(part.id));
    let worst = 0;
    for (const curve of curves) {
      const box = boxOf(curve.points);
      const height = box.bottom - box.top || 1;
      for (let i = 1; i < curve.points.length; i++) {
        worst = Math.max(worst, Math.abs(curve.points[i][1] - curve.points[i - 1][1]) / height);
      }
    }
    add("the curve doesn't leap", curves.length > 0 && worst < 0.4, `biggest step ${(worst * 100).toFixed(0)}% of the height`);
  }

  if (expect.parallelRatio !== undefined) {
    const lines = strokes(attempt.ops)
      .filter((part) => part.points.length === 2)
      .map((part) => {
        const [a, b] = part.points;
        return { angle: Math.atan2(b[1] - a[1], b[0] - a[0]), length: Math.hypot(b[0] - a[0], b[1] - a[1]) };
      });
    let best = 0;
    for (const [i, one] of lines.entries()) {
      for (const other of lines.slice(i + 1)) {
        const turn = Math.abs(((one.angle - other.angle) * 180) / Math.PI) % 180;
        if (Math.min(turn, 180 - turn) > 2) continue;
        const ratio = Math.max(one.length, other.length) / Math.max(Math.min(one.length, other.length), 1e-6);
        if (Math.abs(ratio - expect.parallelRatio!) < Math.abs(best - expect.parallelRatio!)) best = ratio;
      }
    }
    add(
      `parallel sides in the ratio ${expect.parallelRatio}`,
      Math.abs(best - expect.parallelRatio) < 0.1,
      best ? `closest pair ${best.toFixed(2)}` : "no parallel pair",
    );
  }

  if (expect.checked !== undefined) {
    const used = attempt.tools.includes("check_maths");
    add("worked the number out", used === expect.checked, `tools: ${attempt.tools.join(", ") || "none"}`);
  }

  if (expect.saysSomething) {
    add("said something, not just drew", attempt.reply.trim().length > 0, attempt.reply.slice(0, 60) || "silence");
  }

  for (const pattern of expect.says ?? []) {
    add(`says ${pattern}`, new RegExp(pattern, "i").test(attempt.reply));
  }
  for (const pattern of expect.saysNot ?? []) {
    add(`doesn't say ${pattern}`, !new RegExp(pattern, "i").test(attempt.reply));
  }

  if (expect.noRefusals) add("nothing was refused", attempt.refusals === 0, `${attempt.refusals} refused`);

  return results;
}
