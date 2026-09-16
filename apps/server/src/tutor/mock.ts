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
    switch (request.trigger) {
      case "check":
        ops.push(resolve("circle", { target: { id: target.id, box: null }, color: "mistake", note: null }));
        ops.push(resolve("mark", { target: { id: target.id, box: null }, symbol: "cross" }));
        break;
      case "hint":
        ops.push(resolve("highlight", { target: { id: target.id, box: null }, color: "attention" }));
        break;
      case "stuck": {
        const corner = mapping.items.find((item) => item.corners && item.corners.length >= 3);
        if (corner?.corners) {
          ops.push(
            resolve("angle_arc", {
              vertex: corner.corners[0],
              p1: corner.corners[1],
              p2: corner.corners[2],
              label: "\\theta",
              color: "tutor",
            }),
          );
        }
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
