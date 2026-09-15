// Scripted replies for building and testing the UI without calling Claude (PLAN.md §12).
import type { TurnRequest } from "@letsmath/shared";

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
      return `${seen} (Mock mode: I'm not really checking.) In a real turn I'd find your first mistake, for example if you'd written $\\sin 30^\\circ = \\frac{\\sqrt{3}}{2}$ when it's $\\frac{1}{2}$.`;
    case "hint":
      return `${seen} (Mock mode.) A hint would go here, such as: which side is **opposite** the angle $\\theta$?`;
    case "stuck":
      return `${seen} (Mock mode.) No problem. Let's label the sides first:\n\n$$\\sin\\theta = \\frac{\\text{opposite}}{\\text{hypotenuse}}$$`;
    default:
      return `${seen} (Mock mode.) You said: "${request.text.slice(0, 120)}".`;
  }
}

/** Yields the scripted reply a word at a time, paced like a real stream. */
export async function* mockReply(request: TurnRequest, signal: AbortSignal): AsyncGenerator<string> {
  await sleep(350);
  for (const word of scriptFor(request).split(/(?<=\s)/)) {
    if (signal.aborted) return;
    yield word;
    await sleep(18);
  }
}
