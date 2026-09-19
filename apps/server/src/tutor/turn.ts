import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import {
  boardOpNames,
  checkMaths,
  checkMathsSchema,
  CHECK_MATHS_TOOL,
  countImageTokens,
  ExpressionError,
  tidyCheckInput,
  type BoardOpName,
  type ResolvedOp,
  type TurnEvent,
  type TurnRequest,
} from "@letsmath/shared";
import { createClaude } from "../claude";
import { config } from "../config";
import { worstCaseUsd, type Usage } from "./cost";
import { BudgetExceededError, budgetStatus, reserve } from "./ledger";
import { mockReply } from "./mock";
import { TUTOR_SYSTEM_PROMPT } from "./prompt";
import { createResolver, OpError } from "./resolve";
import { routeEffort, type Effort } from "./routing";
import { getSession, type TutorSession } from "./session";
import { boardToolsFor, TOOL_GUIDANCE } from "./tools";

/** Replies are a few sentences plus a few tool calls. Raised in M4 for draw_svg. */
const MAX_TOKENS = 4096;
/** Rough allowance for the system prompt, tools, and message framing when estimating cost. */
const PROMPT_ALLOWANCE_TOKENS = 3500;
/**
 * A turn can take more than one round: a refused drawing goes straight back so
 * the tutor fixes it there and then (PLAN.md §4), and an arithmetic check has to
 * be answered before the tutor can say anything about the number. Three rounds
 * covers "check, then draw, then fix the drawing"; past that it's a
 * misunderstanding, and the rest waits for the student's next message.
 */
const MAX_ROUNDS = 3;
/**
 * A refused drawing gets one retry, however many rounds a turn runs to. A slip
 * it can fix, it fixes first time; twice means it has misunderstood, and trying
 * again just costs another request.
 */
const MAX_REFUSAL_RETRIES = 1;

/**
 * Adaptive thinking and the effort setting belong to the larger models. Haiku
 * 4.5 refuses the request outright rather than ignoring them, which is how the
 * eval found this: every case failed with a 400 before generating anything.
 */
const TUNEABLE = /^claude-(opus|sonnet)-[5-9]/;

const SYSTEM_PROMPT = `${TUTOR_SYSTEM_PROMPT}\n\n${TOOL_GUIDANCE}`;

type Emit = (event: TurnEvent) => Promise<void>;

const TOOL_ERRORS_FILE =
  process.env.TOOL_ERRORS_PATH ?? fileURLToPath(new URL("../../../../.usage/tool-errors.jsonl", import.meta.url));

/**
 * Keep every drawing that failed, with the tutor's input and the reason. A
 * failure is otherwise invisible: the tutor only hears about it on the
 * student's next message, and the student simply sees nothing drawn.
 */
async function recordToolError(sessionId: string, tool: string, input: unknown, err: unknown) {
  const reason = err instanceof Error ? err.message : String(err);
  console.warn(`[op] session=${sessionId.slice(0, 8)} ${tool} failed: ${reason}`);
  try {
    await mkdir(dirname(TOOL_ERRORS_FILE), { recursive: true });
    const stack = err instanceof OpError || !(err instanceof Error) ? undefined : err.stack;
    await appendFile(TOOL_ERRORS_FILE, `${JSON.stringify({ at: new Date().toISOString(), tool, reason, stack, input })}\n`);
  } catch {
    // Diagnostics must never break a turn.
  }
}

let client: Pick<Anthropic, "messages"> | null = null;

/** Tests hand in a stand-in for Claude, so the turn loop runs without a network or a bill. */
export function useClaudeForTests(standIn: Pick<Anthropic, "messages">) {
  client = standIn;
}

export async function runTurn(request: TurnRequest, emit: Emit, signal: AbortSignal): Promise<void> {
  const session = getSession(request.sessionId);
  if (session.busy) {
    return emit({ type: "error", code: "invalid", message: "The tutor is still answering your last message." });
  }
  session.busy = true;
  try {
    if (config.tutorMock || request.mock) {
      await runMockTurn(session, request, emit, signal);
    } else {
      await runClaudeTurn(session, request, emit, signal);
    }
  } finally {
    session.busy = false;
  }
}

async function runMockTurn(session: TutorSession, request: TurnRequest, emit: Emit, signal: AbortSignal) {
  if (request.snapshot) {
    session.mapping = {
      origin: request.snapshot.origin,
      scale: request.snapshot.scale,
      items: request.snapshot.items,
    };
  }
  console.log(`[turn] session=${session.id.slice(0, 8)} trigger=${request.trigger} mock (free)`);
  const { text, ops } = await mockReply(request, session, signal);
  for await (const chunk of text) await emit({ type: "text", text: chunk });
  for (const op of ops) {
    if (signal.aborted) return;
    await emit({ type: "op", op });
  }
  await emit({ type: "done", stopReason: "end_turn", mock: true });
}

function userContent(session: TutorSession, request: TurnRequest): Anthropic.ContentBlockParam[] {
  // Results for last turn's drawings come first, as the API requires.
  const content: Anthropic.ContentBlockParam[] = [...session.pendingToolResults];

  if (request.snapshot) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: request.snapshot.mediaType, data: request.snapshot.data },
    });
    content.push({ type: "text", text: `<board>\n${request.snapshot.digest}\n</board>` });
  } else {
    content.push({ type: "text", text: "<board>unchanged since the last snapshot</board>" });
  }
  content.push({ type: "text", text: request.text });
  return content;
}

/**
 * The results of a round in which a drawing was refused, sent straight back.
 * Each refused one says what to do about it. The student never saw the
 * failure, so there's nothing to apologise for.
 */
function retryContent(results: Anthropic.ToolResultBlockParam[]): Anthropic.ToolResultBlockParam[] {
  return results.map((result) =>
    result.is_error
      ? {
          ...result,
          content: `Refused, so nothing was drawn: ${result.content} Call the tool again now with that fixed. The student hasn't seen the failure, so don't mention it; just draw.`,
        }
      : result,
  );
}

interface Round {
  message: Anthropic.Message;
  toolResults: Anthropic.ToolResultBlockParam[];
  /** Questions the tutor asked the board, which it's now waiting on. */
  answers: number;
  costUsd: number;
  firstWordMs: number | undefined;
}

/**
 * One request to Claude: reserve its worst case, stream the reply, apply each
 * drawing the moment its call finishes, then settle what it really cost.
 * Returns null when the round ended early, having already told the student why.
 */
async function requestReply(
  session: TutorSession,
  messages: Anthropic.MessageParam[],
  resolve: ReturnType<typeof createResolver>,
  estimatedInput: number,
  effort: Effort,
  emit: Emit,
  signal: AbortSignal,
  textPrefix: string,
): Promise<Round | null> {
  const model = config.tutorModel;
  let slot: Awaited<ReturnType<typeof reserve>>;
  try {
    slot = await reserve(worstCaseUsd(model, estimatedInput, MAX_TOKENS));
  } catch (err) {
    if (!(err instanceof BudgetExceededError)) throw err;
    await emit({ type: "error", code: "budget", message: err.message });
    return null;
  }

  client ??= createClaude();
  const stream = client.messages.stream(
    {
      model,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      tools: boardToolsFor(model),
      // Caches everything up to the newest message, so each turn re-reads history at 0.1× price.
      cache_control: { type: "ephemeral" },
      ...(TUNEABLE.test(model) ? { thinking: { type: "adaptive" as const }, output_config: { effort } } : {}),
      messages,
    },
    { signal },
  );
  // Timings, so a slow turn can be diagnosed without guesswork.
  const started = Date.now();
  let firstWordMs: number | undefined;
  stream.on("text", (text) => {
    if (firstWordMs === undefined) {
      firstWordMs = Date.now() - started;
      text = textPrefix + text;
    }
    void emit({ type: "text", text });
  });

  // Apply each drawing the moment its call finishes streaming, rather than at the end of the reply.
  const toolResults: Anthropic.ToolResultBlockParam[] = [];
  const applied = new Set<number>();
  let answers = 0;
  const applyFinishedTools = async () => {
    const blocks = stream.currentMessage?.content ?? [];
    for (const [index, block] of blocks.entries()) {
      if (block.type !== "tool_use" || applied.has(index)) continue;
      applied.add(index);

      // Working a number out isn't a drawing: the answer goes back to the tutor,
      // which then decides what to say about it.
      if (block.name === CHECK_MATHS_TOOL) {
        try {
          const parsed = checkMathsSchema.safeParse(tidyCheckInput(block.input));
          if (!parsed.success) {
            throw new ExpressionError(parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "));
          }
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: checkMaths(parsed.data) });
          answers += 1;
        } catch (err) {
          const why = err instanceof ExpressionError ? err.message : "I couldn't work that out.";
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: why, is_error: true });
          void recordToolError(session.id, block.name, block.input, err);
        }
        continue;
      }

      let op: ResolvedOp;
      try {
        if (!boardOpNames.includes(block.name as BoardOpName)) throw new OpError(`Unknown tool ${block.name}`);
        op = resolve(block.name as BoardOpName, block.input);
      } catch (err) {
        const message = err instanceof OpError ? err.message : "Couldn't draw that.";
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: message, is_error: true });
        void recordToolError(session.id, block.name, block.input, err);
        continue;
      }
      // Recorded before the op is sent, never after: once finalMessage resolves,
      // every call must already have its result, or the next request pairs a
      // tool_use with nothing and the API refuses the session from then on.
      toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Drawn as ${op.id}.` });
      await emit({ type: "op", op });
    }
  };
  stream.on("streamEvent", (event) => {
    if (event.type === "content_block_stop") void applyFinishedTools();
  });

  try {
    const message = await stream.finalMessage();
    await applyFinishedTools();
    const entry = await slot.settle("tutor", message.model, message.usage);
    return { message, toolResults, answers, costUsd: entry?.costUsd ?? 0, firstWordMs };
  } catch (err) {
    // Record whatever was billed before the stream ended; an API error before generation bills nothing.
    const partial: Usage | undefined = stream.currentMessage?.usage;
    if (partial) await slot.settle("tutor", model, partial);
    else if (err instanceof Anthropic.APIUserAbortError) await slot.settle("tutor", model, { input_tokens: estimatedInput, output_tokens: 0 });
    else slot.release();

    if (err instanceof Anthropic.APIUserAbortError) return null;
    if (err instanceof Anthropic.APIError) {
      await emit({ type: "error", code: "api", message: `Claude API error ${err.status ?? ""}: ${err.message}` });
      return null;
    }
    throw err;
  }
}

async function runClaudeTurn(session: TutorSession, request: TurnRequest, emit: Emit, signal: AbortSignal) {
  const newTokens =
    (request.snapshot ? countImageTokens(request.snapshot.width, request.snapshot.height) : 0) +
    Math.ceil((request.text.length + (request.snapshot?.digest.length ?? 0)) / 3);

  if (request.snapshot) {
    session.mapping = {
      origin: request.snapshot.origin,
      scale: request.snapshot.scale,
      items: request.snapshot.items,
      width: request.snapshot.width,
      height: request.snapshot.height,
    };
  }
  const resolve = createResolver(session.mapping ?? { origin: [0, 0], scale: 1, items: [] }, () => {
    session.annotationCount += 1;
    return `a${session.annotationCount}`;
  });

  // Low is the floor; interpretation and teaching get more (§5). A fixed
  // TUTOR_EFFORT pins every turn, which is how the eval compares levels.
  const chosenEffort: Effort =
    config.tutorEffort === "auto" ? routeEffort(request) : (config.tutorEffort as Effort);

  const started = Date.now();
  const rounds: Round[] = [];
  let retries = 0;

  // Time to the student seeing anything, across the whole turn. A turn that
  // works a number out first says nothing in its opening round, and timing only
  // that round would report no answer at all.
  let firstWordAt: number | undefined;
  const watched: Emit = async (event) => {
    if (event.type === "text" && firstWordAt === undefined) firstWordAt = Date.now();
    await emit(event);
  };
  let messages: Anthropic.MessageParam[] = [...session.messages, { role: "user", content: userContent(session, request) }];
  let estimatedInput = session.lastInputTokens + newTokens + PROMPT_ALLOWANCE_TOKENS;

  for (let attempt = 0; attempt < MAX_ROUNDS; attempt++) {
    // A break only reads as a break if something was said before it.
    const prefix = rounds.some((earlier) => earlier.firstWordMs !== undefined) ? "\n\n" : "";
    // A turn that has already had something refused is worth more thought.
    const effort: Effort = retries > 0 ? "medium" : chosenEffort;
    const round = await requestReply(session, messages, resolve, estimatedInput, effort, watched, signal, prefix);
    if (!round) break;
    rounds.push(round);

    // Only a completed round joins the history, so one that fails part-way leaves
    // it whole: the last assistant message and the results still owed for it.
    const { message, toolResults } = round;
    session.messages = [...messages, { role: "assistant", content: message.content }];
    session.pendingToolResults = toolResults;
    session.lastInputTokens =
      message.usage.input_tokens +
      (message.usage.cache_read_input_tokens ?? 0) +
      (message.usage.cache_creation_input_tokens ?? 0);

    if (message.stop_reason === "refusal" || signal.aborted) break;
    const refused = toolResults.some((result) => result.is_error);
    const owed = round.answers > 0;
    // Either something was refused, or the tutor is waiting on a number.
    if (!refused && !owed) break;

    // A tutor that has said nothing yet gets another round even after a tool has
    // failed twice: being left in silence is worse for the student than the cost
    // of one more request, and it can always answer in words instead.
    const spoke = rounds.some((earlier) => earlier.firstWordMs !== undefined);
    const outOfRounds = attempt === MAX_ROUNDS - 1;
    const triedEnough = refused && !owed && retries >= MAX_REFUSAL_RETRIES && spoke;
    if (outOfRounds || triedEnough) {
      if (refused) {
        await emit({
          type: "text",
          text: spoke
            ? "\n\n_(That didn't work. Ask me to try it another way.)_"
            : "_(I couldn't work that out just now. Ask me to try it another way.)_",
        });
      }
      break;
    }
    if (refused) retries += 1;

    console.log(
      `[turn] session=${session.id.slice(0, 8)} ${refused ? "a drawing was refused" : "the tutor asked for a number"}; going straight back`,
    );
    messages = [...session.messages, { role: "user", content: retryContent(toolResults) }];
    estimatedInput = session.lastInputTokens + message.usage.output_tokens + PROMPT_ALLOWANCE_TOKENS;
  }

  const last = rounds.at(-1);
  if (!last) return;

  // One usage line for the whole turn, however many rounds it took.
  const total = (pick: (usage: Anthropic.Usage) => number | null | undefined) =>
    rounds.reduce((sum, round) => sum + (pick(round.message.usage) ?? 0), 0);
  const costUsd = rounds.reduce((sum, round) => sum + round.costUsd, 0);
  const firstWordMs = firstWordAt === undefined ? undefined : firstWordAt - started;
  const status = await budgetStatus();
  // Every paid turn is logged, so spend is always attributable to a session.
  console.log(
    `[turn] session=${session.id.slice(0, 8)} trigger=${request.trigger} model=${last.message.model} ` +
      `effort=${chosenEffort} rounds=${rounds.length} firstWord=${firstWordMs ?? "-"}ms done=${Date.now() - started}ms ` +
      `cost=$${costUsd.toFixed(4)} total=$${status.spentUsd.toFixed(4)} of $${status.budgetUsd.toFixed(2)}`,
  );
  await emit({
    type: "usage",
    usage: {
      model: last.message.model,
      inputTokens: total((usage) => usage.input_tokens),
      outputTokens: total((usage) => usage.output_tokens),
      cacheReadTokens: total((usage) => usage.cache_read_input_tokens),
      cacheWriteTokens: total((usage) => usage.cache_creation_input_tokens),
      costUsd,
      spentUsd: status.spentUsd,
      budgetUsd: status.budgetUsd,
      firstWordMs,
      totalMs: Date.now() - started,
    },
  });
  if (rounds.some((round) => round.message.stop_reason === "refusal")) {
    await emit({ type: "error", code: "refusal", message: "The tutor couldn't help with that. Try rephrasing." });
  }
  await emit({ type: "done", stopReason: last.message.stop_reason, mock: false });
}
