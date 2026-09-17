// Scripted replies for building and testing the UI without calling Claude (PLAN.md §12).
import type { ResolvedOp, TurnRequest } from "@letsmath/shared";
import { createResolver } from "./resolve";
import type { TutorSession } from "./session";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function describeBoard(request: TurnRequest): string {
  const snapshot = request.snapshot;
  if (!snapshot) return "The board hasn't changed since I last looked.";
  const lines = snapshot.digest.split("\n");
  const groups = lines.filter((line) => /^\*?\s*g\d+\b/.test(line)).length;
  const items = lines.filter((line) => /^\*?\s*#\d+\b/.test(line)).length;
  const fresh = lines.filter((line) => line.startsWith("*")).length;
  return (
    `I can see ${groups} line${groups === 1 ? "" : "s"} of working and ${items} other item${items === 1 ? "" : "s"}` +
    `${fresh ? `, ${fresh} of them new` : ""}, in a ${snapshot.width}×${snapshot.height} snapshot.`
  );
}

function scriptFor(request: TurnRequest): string {
  const seen = describeBoard(request);
  switch (request.trigger) {
    case "check":
      return `${seen} (Mock mode: I'm not really checking.) I've circled the line I'd look at first — in a real turn that would be your first mistake.`;
    case "hint":
      return `${seen} (Mock mode.) A hint would go here, such as: which side is **opposite** the angle $\\theta$?`;
    case "stuck":
      return `${seen} (Mock mode.) No problem. Let's label the sides first:\n\n$$\\sin\\theta = \\frac{\\text{opposite}}{\\text{hypotenuse}}$$`;
    default:
      return `${seen} (Mock mode.) You said: "${request.text.slice(0, 120)}".`;
  }
}

const blankSpec = {
  points: [],
  polygons: [],
  segments: [],
  angles: [],
  labels: [],
  markedPoints: [],
  axes: [],
  plots: [],
  constructions: [],
  circles: [],
  arcs: [],
  near: "",
  width: 360,
  caption: "",
};

/** A labelled 3-4-5 triangle, for exercising the diagram compiler without calling Claude. */
const mockTriangle = {
  ...blankSpec,
  points: [
    { name: "A", x: 0, y: 0 },
    { name: "B", x: 4, y: 0 },
    { name: "C", x: 4, y: 3 },
  ],
  polygons: [{ through: ["A", "B", "C"] }],
  segments: [],
  angles: [
    { at: "B", from: "A", to: "C", text: "", rightAngle: true },
    { at: "A", from: "B", to: "C", text: "\\theta", rightAngle: false },
  ],
  labels: [
    { from: "A", to: "B", text: "4", attention: false },
    { from: "B", to: "C", text: "3", attention: false },
    { from: "C", to: "A", text: "5", attention: true },
  ],
};

/** Sine and cosine on pi-ticked axes, for exercising graphs without calling Claude. */
const mockGraph = {
  ...blankSpec,
  axes: [
    {
      xMin: -Math.PI * 2,
      xMax: Math.PI * 2,
      yMin: -1.3,
      yMax: 1.3,
      xLabel: "x",
      yLabel: "y",
      xStep: 0,
      yStep: 0.5,
      piTicks: true,
      grid: true,
      equalScale: false,
    },
  ],
  plots: [
    { expr: "sin(x)", from: 0, to: 0, label: "y = \\sin x", attention: false },
    { expr: "cos(x)", from: 0, to: 0, label: "y = \\cos x", attention: true },
  ],
  width: 420,
  caption: "sin and cos from -2pi to 2pi",
};

/** The unit circle with 30° marked, its point built rather than calculated, for exercising circles for free. */
const mockUnitCircle = {
  ...blankSpec,
  axes: [
    {
      xMin: -1.5,
      xMax: 1.5,
      yMin: -1.5,
      yMax: 1.5,
      xLabel: "x",
      yLabel: "y",
      xStep: 0.5,
      yStep: 0.5,
      piTicks: false,
      grid: false,
      equalScale: true,
    },
  ],
  points: [
    { name: "O", x: 0, y: 0 },
    { name: "A", x: 1, y: 0 },
  ],
  constructions: [
    { name: "P", kind: "polar", of: ["O"], angle: 30, distance: 1 },
    { name: "F", kind: "foot", of: ["P", "O", "A"], angle: 0, distance: 0 },
  ],
  circles: [{ centre: "O", through: "A", radius: 0, attention: false }],
  segments: [
    { from: "O", to: "P", dashed: false },
    { from: "P", to: "F", dashed: true },
  ],
  angles: [{ at: "O", from: "A", to: "P", text: "30^{\\circ}", rightAngle: false }],
  markedPoints: [{ at: "P", text: "\\left(\\frac{\\sqrt{3}}{2}, \\frac{1}{2}\\right)", dot: true }],
  width: 400,
};

/** Scripted drawings, so the board's annotation rendering can be built for free. */
function opsFor(request: TurnRequest, session: TutorSession): ResolvedOp[] {
  const mapping = session.mapping;
  if (!mapping || mapping.items.length === 0) return [];

  const resolve = createResolver(mapping, () => {
    session.annotationCount += 1;
    return `a${session.annotationCount}`;
  });
  const target = mapping.items.find((item) => item.kind === "handwriting") ?? mapping.items[0];
  const ops: ResolvedOp[] = [];

  try {
    // Asking for a circle or a graph gets one, whichever button it came from.
    // Circles first: a unit-circle request often mentions sin and cos too.
    if (/circle/i.test(request.text)) {
      ops.push(resolve("draw_diagram", { ...mockUnitCircle, near: target.id }));
      return ops;
    }
    if (/graph|plot|sketch|sin|cos/i.test(request.text)) {
      ops.push(resolve("draw_diagram", { ...mockGraph, near: target.id }));
      return ops;
    }

    switch (request.trigger) {
      case "check":
        ops.push(resolve("circle", { target: { id: target.id, box: null }, color: "mistake", note: null }));
        ops.push(resolve("mark", { target: { id: target.id, box: null }, symbol: "cross" }));
        break;
      case "hint":
        ops.push(resolve("highlight", { target: { id: target.id, box: null }, color: "attention" }));
        break;
      case "stuck": {
        // Draw the worked figure, the way the tutor would when starting a problem.
        ops.push(resolve("draw_diagram", { ...mockTriangle, near: target.id }));
        ops.push(
          resolve("write", {
            at: [target.box[0], Math.max(0, target.box[1] - 60)],
            content: "\\sin\\theta = \\frac{o}{h}",
            format: "latex",
            size: "m",
            color: "tutor",
          }),
        );
        break;
      }
      default:
        ops.push(resolve("underline", { target: { id: target.id, box: null }, color: "tutor" }));
    }
  } catch {
    // Mock drawings are best-effort; a board with nothing to point at just gets words.
  }
  return ops;
}

/** The scripted reply, a word at a time, plus the drawings to apply after it. */
export async function mockReply(
  request: TurnRequest,
  session: TutorSession,
  signal: AbortSignal,
): Promise<{ text: AsyncGenerator<string>; ops: ResolvedOp[] }> {
  const script = scriptFor(request);
  const ops = opsFor(request, session);

  async function* words() {
    await sleep(350);
    for (const word of script.split(/(?<=\s)/)) {
      if (signal.aborted) return;
      yield word;
      await sleep(18);
    }
  }

  return { text: words(), ops };
}
