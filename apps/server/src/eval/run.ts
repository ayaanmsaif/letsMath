// Put the tutor to a fixed set of questions and mark what it does (PLAN.md §8, M6).
//
//   npm run eval -w @letsmath/server -- --model claude-haiku-4-5 --effort low
//
// Every case runs through the real turn path, so the resolver, the retry loop
// and tool choice are all exercised. Cases run one after another in one process,
// which means the tool definitions are written to the cache once and read at a
// tenth of the price after that.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { ResolvedOp, TurnEvent, TurnRequest } from "@letsmath/shared";
import { routeEffort } from "../tutor/routing";
import { fixtures } from "./fixtures";
import { scoreAttempt } from "./score";
import type { FixtureResult } from "./types";

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
};

const model = flag("model", process.env.TUTOR_MODEL ?? "claude-sonnet-5");
/** Without --effort the tutor chooses per turn, which is what it does in the app. */
const effort = flag("effort", "");
const only = flag("only", "");
const mock = args.includes("--mock");

// Set before anything reads the configuration, so one process can be pointed at
// any model without editing .env.
process.env.TUTOR_MODEL = model;
if (effort) process.env.TUTOR_EFFORT = effort;
else delete process.env.TUTOR_EFFORT;

const root = (path: string) => fileURLToPath(new URL(`../../../../${path}`, import.meta.url));
const LEDGER = process.env.USAGE_LEDGER_PATH ?? root(".usage/ledger.jsonl");
const TOOL_ERRORS = process.env.TOOL_ERRORS_PATH ?? root(".usage/tool-errors.jsonl");

/** Lines in a file that may not exist yet. */
async function lineCount(path: string): Promise<number> {
  try {
    const text = await readFile(path, "utf8");
    return text.split("\n").filter(Boolean).length;
  } catch {
    return 0;
  }
}

const { runTurn } = await import("../tutor/turn");
const { getSession } = await import("../tutor/session");

/** Tool names the tutor used, read back out of the conversation it just had. */
function toolsUsed(sessionId: string): string[] {
  const names: string[] = [];
  for (const message of getSession(sessionId).messages) {
    if (message.role !== "assistant" || typeof message.content === "string") continue;
    for (const block of message.content) if (block.type === "tool_use") names.push(block.name);
  }
  return names;
}

async function runFixture(fixture: (typeof fixtures)[number]): Promise<FixtureResult> {
  const sessionId = `eval-${fixture.id}-${Date.now()}`;
  const request: TurnRequest = {
    sessionId,
    trigger: fixture.trigger ?? "message",
    text: fixture.ask,
    snapshot: null,
    ...(mock ? { mock: true } : {}),
  } as TurnRequest;

  const spentBefore = await lineCount(LEDGER);
  const refusedBefore = await lineCount(TOOL_ERRORS);
  const started = Date.now();

  const ops: ResolvedOp[] = [];
  let reply = "";
  let costUsd = 0;
  let firstWordMs: number | undefined;
  let error: string | undefined;

  await runTurn(
    request,
    async (event: TurnEvent) => {
      if (event.type === "text") reply += event.text;
      else if (event.type === "op") ops.push(event.op);
      else if (event.type === "usage") {
        costUsd = event.usage.costUsd;
        firstWordMs = event.usage.firstWordMs;
      } else if (event.type === "error") error = `${event.code}: ${event.message}`;
    },
    new AbortController().signal,
  );

  const refusals = (await lineCount(TOOL_ERRORS)) - refusedBefore;
  const tools = toolsUsed(sessionId);
  return {
    id: fixture.id,
    checks: scoreAttempt(fixture.expect, { ops, reply, tools, refusals }),
    reply: reply.trim(),
    tools,
    refusals,
    rounds: (await lineCount(LEDGER)) - spentBefore,
    costUsd,
    firstWordMs,
    totalMs: Date.now() - started,
    error,
  };
}

const hardOnly = args.includes("--hard");
const chosen = only
  ? fixtures.filter((fixture) => fixture.id === only)
  : hardOnly
    ? fixtures.filter((fixture) => fixture.hard)
    : fixtures;
if (chosen.length === 0) {
  console.error(`No case called "${only}".`);
  process.exit(1);
}

console.log(`\n${model} at ${effort || "the effort it chooses"}${mock ? " (mock, free)" : ""} — ${chosen.length} cases\n`);

const results: FixtureResult[] = [];
for (const fixture of chosen) {
  const result = await runFixture(fixture);
  results.push(result);

  const failed = result.checks.filter((check) => !check.passed);
  const mark = result.error ? "!" : failed.length === 0 ? "ok" : "X";
  const level = effort || routeEffort({ trigger: fixture.trigger ?? "message", text: fixture.ask });
  console.log(
    `${mark.padEnd(3)} ${result.id.padEnd(18)} ${level.padEnd(7)} ${String(result.checks.length - failed.length)}/${result.checks.length}` +
      `  ${result.rounds} round${result.rounds === 1 ? " " : "s"}` +
      `  ${result.costUsd ? `${(result.costUsd * 100).toFixed(1)}p` : "—"}` +
      `  first word ${result.firstWordMs ?? "—"}ms`,
  );
  for (const check of failed) console.log(`      ${check.name}${check.detail ? ` — ${check.detail}` : ""}`);
  if (result.error) console.log(`      ${result.error}`);

  // A spent budget stops everything; there is no point asking the rest.
  if (result.error?.startsWith("budget")) break;
}

const checks = results.flatMap((result) => result.checks);
const passed = checks.filter((check) => check.passed).length;
const cost = results.reduce((total, result) => total + result.costUsd, 0);
const words = results.map((r) => r.firstWordMs).filter((ms): ms is number => ms !== undefined);
const median = words.sort((a, b) => a - b)[Math.floor(words.length / 2)];

console.log(
  `\n${passed}/${checks.length} checks passed` +
    `  ·  ${(cost * 100).toFixed(1)}p` +
    `  ·  median first word ${median ?? "—"}ms\n`,
);

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const out = root(`.usage/eval/${model}-${effort}-${stamp}.json`);
await mkdir(root(".usage/eval"), { recursive: true });
await writeFile(out, JSON.stringify({ model, effort, at: Date.now(), results }, null, 2));
console.log(`Written to ${out}\n`);
