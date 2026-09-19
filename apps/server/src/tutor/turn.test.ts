import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import type { TurnEvent } from "@letsmath/shared";
import { describe, expect, it, vi } from "vitest";

type Block = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: unknown };

/** One streamed reply: fires the events the turn listens for, then resolves. */
function fakeStream(content: Block[], failWith?: Error) {
  const handlers: Record<string, ((payload: unknown) => void)[]> = {};
  const message = {
    id: "msg",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5",
    content,
    stop_reason: content.some((block) => block.type === "tool_use") ? "tool_use" : "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  };
  const stream = {
    currentMessage: undefined as typeof message | undefined,
    on(event: string, handler: (payload: unknown) => void) {
      (handlers[event] ??= []).push(handler);
      return stream;
    },
    async finalMessage() {
      if (failWith) throw failWith;
      stream.currentMessage = message;
      for (const block of content) {
        if (block.type === "text") for (const handler of handlers.text ?? []) handler(block.text);
        for (const handler of handlers.streamEvent ?? []) handler({ type: "content_block_stop" });
      }
      return message;
    },
  };
  return stream;
}

/** Claude, as far as the turn can tell: hands out the scripted replies in order and keeps every request. */
function fakeClaude(replies: { content: Block[]; failWith?: Error }[]) {
  const requests: { messages: Anthropic.MessageParam[] }[] = [];
  return {
    requests,
    messages: {
      stream(params: { messages: Anthropic.MessageParam[] }) {
        requests.push(structuredClone({ messages: params.messages }));
        const reply = replies.shift();
        if (!reply) throw new Error("The turn asked Claude more times than this test expected.");
        return fakeStream(reply.content, reply.failWith);
      },
    },
  };
}

/** A fresh turn module whose spend and error logs go to a temporary folder, never the real ledger. */
async function loadTurn() {
  const dir = mkdtempSync(join(tmpdir(), "letsmath-turn-"));
  process.env.USAGE_LEDGER_PATH = join(dir, "ledger.jsonl");
  process.env.TOOL_ERRORS_PATH = join(dir, "tool-errors.jsonl");
  process.env.DEV_BUDGET_USD = "5";
  vi.resetModules();
  const turn = await import("./turn");
  const { getSession } = await import("./session");
  return { turn, getSession };
}

async function runWith(replies: { content: Block[]; failWith?: Error }[]) {
  const { turn, getSession } = await loadTurn();
  const claude = fakeClaude(replies);
  turn.useClaudeForTests(claude as never);
  const events: TurnEvent[] = [];
  const sessionId = `test-${Math.random()}`;
  const run = turn.runTurn(
    { sessionId, trigger: "message", text: "Draw me a unit circle", snapshot: null } as never,
    async (event) => {
      events.push(event);
    },
    new AbortController().signal,
  );
  return { run, events, claude, session: () => getSession(sessionId) };
}

const refused = (id: string): Block => ({ type: "tool_use", id, name: "draw_diagram", input: {} });
const asked = (id: string): Block => ({
  type: "tool_use",
  id,
  name: "check_maths",
  input: { expr: "5*cos(65)", claim: "2.7", at: "", degrees: true },
});
const drawn = (id: string): Block => ({ type: "tool_use", id, name: "erase_drawings", input: { ids: ["all"] } });

/** Every tool_use in the history must be answered by the very next user message, or the API refuses the session. */
function expectHistoryWhole(messages: Anthropic.MessageParam[], pending: Anthropic.ToolResultBlockParam[]) {
  const withPending = [...messages, { role: "user" as const, content: pending }];
  for (const [index, message] of withPending.entries()) {
    if (message.role !== "assistant" || typeof message.content === "string") continue;
    const asked = message.content.flatMap((block) => (block.type === "tool_use" ? [block.id] : []));
    const next = withPending[index + 1];
    const answered =
      next && typeof next.content !== "string"
        ? next.content.flatMap((block) => (block.type === "tool_result" ? [block.tool_use_id] : []))
        : [];
    expect([...answered].sort()).toEqual([...asked].sort());
  }
}

describe("a tutor turn", () => {
  it("asks Claude once when every drawing works", async () => {
    const { run, events, claude, session } = await runWith([
      { content: [{ type: "text", text: "Done." }, drawn("t1")] },
    ]);
    await run;

    expect(claude.requests).toHaveLength(1);
    expect(events.filter((e) => e.type === "done")).toHaveLength(1);
    expectHistoryWhole(session().messages, session().pendingToolResults);
  });

  it("sends a refused drawing straight back, so the tutor fixes it in the same turn", async () => {
    const { run, events, claude, session } = await runWith([
      { content: [{ type: "text", text: "Here it is." }, refused("t1"), drawn("t2")] },
      { content: [drawn("t3")] },
    ]);
    await run;

    expect(claude.requests).toHaveLength(2);
    // The retry answers both calls, and tells the tutor what to do about the refused one.
    const retry = claude.requests[1].messages.at(-1)!;
    expect(retry.role).toBe("user");
    const results = retry.content as Anthropic.ToolResultBlockParam[];
    expect(results.map((r) => r.tool_use_id).sort()).toEqual(["t1", "t2"]);
    expect(results.find((r) => r.tool_use_id === "t1")).toMatchObject({ is_error: true });
    expect(String(results.find((r) => r.tool_use_id === "t1")!.content)).toMatch(/Call the tool again now/);

    // The history ends on the retry, with its result owed to the student's next message.
    expect(session().pendingToolResults.map((r) => r.tool_use_id)).toEqual(["t3"]);
    expectHistoryWhole(session().messages, session().pendingToolResults);

    // One usage line and one finish for the whole turn, with both rounds' spend in it.
    const usage = events.filter((e) => e.type === "usage");
    expect(usage).toHaveLength(1);
    expect(usage[0].type === "usage" && usage[0].usage.outputTokens).toBe(200);
    expect(events.filter((e) => e.type === "done")).toHaveLength(1);
  });

  // The tutor has to know the number before it can say anything about it, so the
  // answer can't wait for the student's next message the way a drawing's can.
  it("answers a number the tutor asks for, in the same turn", async () => {
    const { run, claude, session } = await runWith([
      { content: [asked("c1")] },
      { content: [{ type: "text", text: "Not quite — it comes to 2.11." }] },
    ]);
    await run;

    expect(claude.requests).toHaveLength(2);
    const answer = claude.requests[1].messages.at(-1)!.content as Anthropic.ToolResultBlockParam[];
    expect(answer[0].tool_use_id).toBe("c1");
    expect(answer[0].is_error).toBeFalsy();
    // Worked out exactly, not in the model's head: 5cos65° is 2.113, so 2.7 is wrong.
    expect(String(answer[0].content)).toMatch(/2\.113/);
    expect(String(answer[0].content)).toMatch(/wrong/);
    expectHistoryWhole(session().messages, session().pendingToolResults);
  });

  it("gives up after one retry, and says so instead of leaving an empty board", async () => {
    const { run, events, claude, session } = await runWith([
      { content: [{ type: "text", text: "Here it is." }, refused("t1")] },
      { content: [refused("t2")] },
    ]);
    await run;

    expect(claude.requests).toHaveLength(2);
    const said = events.flatMap((e) => (e.type === "text" ? [e.text] : [])).join("");
    expect(said).toMatch(/didn't work/);
    expectHistoryWhole(session().messages, session().pendingToolResults);
  });

  it("keeps the history whole if the retry itself fails", async () => {
    const { run, claude, session } = await runWith([
      { content: [{ type: "text", text: "Here it is." }, refused("t1")] },
      { content: [], failWith: new Error("connection dropped") },
    ]);
    await expect(run).rejects.toThrow(/connection dropped/);

    expect(claude.requests).toHaveLength(2);
    // Still ends on the first reply, with its result still owed, so the next message works.
    expect(session().pendingToolResults.map((r) => r.tool_use_id)).toEqual(["t1"]);
    expectHistoryWhole(session().messages, session().pendingToolResults);
    expect(session().busy).toBe(false);
  });
});
