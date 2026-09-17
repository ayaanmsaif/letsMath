// Where a diagram's named points are (PLAN.md §4b).
//
// A point can be given by its coordinates or by how it is made: the midpoint
// of AB, where AB meets CD, the foot of the perpendicular from P, or a point a
// set distance away at a set angle. Constructions exist so the tutor never
// does trigonometry to place a point — arithmetic is where a model slips, and
// a slipped coordinate draws a wrong diagram that still looks plausible.

export type Vec2 = [number, number];

/** Something wrong with a diagram, worded for the tutor to fix. */
export class DiagramError extends Error {}

export const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
export const len = (v: Vec2) => Math.hypot(v[0], v[1]);
export const norm = (v: Vec2): Vec2 => {
  const l = len(v) || 1;
  return [v[0] / l, v[1] / l];
};
const cross = (a: Vec2, b: Vec2) => a[0] * b[1] - a[1] * b[0];
const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1];

export type ConstructionKind = "midpoint" | "intersection" | "foot" | "polar";

export interface PointInput {
  name: string;
  x: number;
  y: number;
}

export interface ConstructionInput {
  name: string;
  kind: ConstructionKind;
  of: string[];
  angle: number;
  distance: number;
}

/** What each construction is built from, worded for the tutor to read. */
const BUILT_FROM: Record<ConstructionKind, { count: number; example: string }> = {
  midpoint: { count: 2, example: 'the two ends, as ["A","B"]' },
  intersection: { count: 4, example: 'two points on each line, as ["A","B","C","D"] for AB meeting CD' },
  foot: { count: 3, example: 'the point and then the line, as ["P","A","B"] for the perpendicular from P to AB' },
  polar: { count: 1, example: 'the point to measure from, as ["A"], with angle and distance set' },
};

/** Lines closer to parallel than this are treated as never meeting. */
const PARALLEL = 1e-6;

/**
 * Every named point of a diagram, from coordinates first and then from
 * constructions in the order given, so a construction can build on one before it.
 */
export function resolvePoints(explicit: PointInput[], constructions: ConstructionInput[]): Map<string, Vec2> {
  const points = new Map<string, Vec2>();
  const define = (name: string, at: Vec2) => {
    if (points.has(name)) throw new DiagramError(`Point ${name} is defined twice.`);
    if (!at.every(Number.isFinite)) throw new DiagramError(`Point ${name} has no real position.`);
    points.set(name, at);
  };

  for (const p of explicit) define(p.name, [p.x, p.y]);

  for (const made of constructions) {
    const { count, example } = BUILT_FROM[made.kind];
    if (made.of.length !== count) {
      throw new DiagramError(`${made.name} is a ${made.kind}, which is built from ${example}.`);
    }
    const [p, q, r, s] = made.of.map((name) => {
      const point = points.get(name);
      if (!point) {
        throw new DiagramError(
          `${made.name} is built from ${name}, which isn't defined before it. List points before the constructions that use them.`,
        );
      }
      return point;
    });

    switch (made.kind) {
      case "midpoint":
        define(made.name, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]);
        break;

      case "intersection": {
        const first = sub(q, p);
        const second = sub(s, r);
        if (len(first) === 0 || len(second) === 0) {
          throw new DiagramError(`${made.name}: each line needs two different points.`);
        }
        const turn = cross(first, second);
        if (Math.abs(turn) / (len(first) * len(second)) < PARALLEL) {
          const [a, b, c, d] = made.of;
          throw new DiagramError(`${made.name}: ${a}${b} and ${c}${d} are parallel, so they never meet.`);
        }
        const t = cross(sub(r, p), second) / turn;
        define(made.name, [p[0] + first[0] * t, p[1] + first[1] * t]);
        break;
      }

      case "foot": {
        const along = sub(r, q);
        if (len(along) === 0) throw new DiagramError(`${made.name}: the line needs two different points.`);
        const t = dot(sub(p, q), along) / dot(along, along);
        define(made.name, [q[0] + along[0] * t, q[1] + along[1] * t]);
        break;
      }

      case "polar": {
        // Anticlockwise from the positive x-direction, the way angles are measured in maths.
        const turn = (made.angle * Math.PI) / 180;
        define(made.name, [p[0] + made.distance * Math.cos(turn), p[1] + made.distance * Math.sin(turn)]);
        break;
      }
    }
  }

  return points;
}
