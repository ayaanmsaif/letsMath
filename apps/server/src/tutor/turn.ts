import Anthropic from "@anthropic-ai/sdk";
import {
  boardOpNames,
  countImageTokens,
  type BoardOpName,
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
import { getSession, type TutorSession } from "./session";
import { boardTools, TOOL_GUIDANCE } from "./tools";

/** Replies are a few sentences plus a few tool calls. Raised in M4 for draw_svg. */
const MAX_TOKENS = 4096;
/** Rough allowance for the system prompt, tools, and message framing when estimating cost. */
const PROMPT_ALLOWANCE_TOKENS = 3500;

const SYSTEM_PROMPT = `${TUTOR_SYSTEM_PROMPT}\n\n${TOOL_GUIDANCE}`;

type Emit = (event: TurnEvent) => Promise<void>;

let client: Anthropic | null = null;

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

async function runClaudeTurn(session: TutorSession, request: TurnRequest, emit: Emit, signal: AbortSignal) {
  const model = config.tutorModel;
  const newTokens =
    (request.snapshot ? countImageTokens(request.snapshot.width, request.snapshot.height) : 0) +
    Math.ceil((request.text.length + (request.snapshot?.digest.length ?? 0)) / 3);
  const estimatedInput = session.lastInputTokens + newTokens + PROMPT_ALLOWANCE_TOKENS;

  let slot: Awaited<ReturnType<typeof reserve>>;
  try {
    slot = await reserve(worstCaseUsd(model, estimatedInput, MAX_TOKENS));
  } catch (err) {
    if (err instanceof BudgetExceededError) return emit({ type: "error", code: "budget", message: err.message });
    throw err;
  }

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

  client ??= createClaude();
  const messages: Anthropic.MessageParam[] = [...session.messages, { role: "user", content: userContent(session, request) }];
  const stream = client.messages.stream(
    {
      model,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      tools: boardTools,
      // Caches everything up to the newest message, so each turn re-reads history at 0.1× price.
      cache_control: { type: "ephemeral" },
      thinking: { type: "adaptive" },
      output_config: { effort: config.tutorEffort as "low" | "medium" | "high" },
      messages,
    },
    { signal },
  );
  // Timings, so a slow turn can be diagnosed without guesswork.
  const started = Date.now();
  let firstWordMs: number | undefined;
  stream.on("text", (text) => {
    firstWordMs ??= Date.now() - started;
    void emit({ type: "text", text });
  });

  // Apply each drawing the moment its call finishes streaming, rather than at the end of the reply.
  const toolResults: Anthropic.ToolResultBlockParam[] = [];
  const applied = new Set<number>();
  const applyFinishedTools = async () => {
    const blocks = stream.currentMessage?.content ?? [];
    for (const [index, block] of blocks.entries()) {
      if (block.type !== "tool_use" || applied.has(index)) continue;
      applied.add(index);
      try {
        if (!boardOpNames.includes(block.name as BoardOpName)) throw new OpError(`Unknown tool ${block.name}`);
        const op = resolve(block.name as BoardOpName, block.input);
        await emit({ type: "op", op });
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Drawn as ${op.id}.` });
      } catch (err) {
        const message = err instanceof OpError ? err.message : "Couldn't draw that.";
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: message, is_error: true });
      }
    }
  };
  stream.on("streamEvent", (event) => {
    if (event.type === "content_block_stop") void applyFinishedTools();
  });

  try {
    const message = await stream.finalMessage();
    await applyFinishedTools();

    // Only a completed turn joins the history, so a failed one can simply be retried.
    session.messages = [...messages, { role: "assistant", content: message.content }];
    session.pendingToolResults = toolResults;
    session.lastInputTokens =
      message.usage.input_tokens +
      (message.usage.cache_read_input_tokens ?? 0) +
      (message.usage.cache_creation_input_tokens ?? 0);

    const entry = await slot.settle("tutor", message.model, message.usage);
    const status = await budgetStatus();
    // Every paid turn is logged, so spend is always attributable to a session.
    console.log(
      `[turn] session=${session.id.slice(0, 8)} trigger=${request.trigger} model=${message.model} ` +
        `firstWord=${firstWordMs ?? "-"}ms done=${Date.now() - started}ms ` +
        `cost=$${(entry?.costUsd ?? 0).toFixed(4)} total=$${status.spentUsd.toFixed(4)} of $${status.budgetUsd.toFixed(2)}`,
    );
    await emit({
      type: "usage",
      usage: {
        model: message.model,
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
        costUsd: entry?.costUsd ?? 0,
        spentUsd: status.spentUsd,
        budgetUsd: status.budgetUsd,
        firstWordMs,
        totalMs: Date.now() - started,
      },
    });
    if (message.stop_reason === "refusal") {
      await emit({ type: "error", code: "refusal", message: "The tutor couldn't help with that. Try rephrasing." });
    }
    await emit({ type: "done", stopReason: message.stop_reason, mock: false });
  } catch (err) {
    // Record whatever was billed before the stream ended; an API error before generation bills nothing.
    const partial: Usage | undefined = stream.currentMessage?.usage;
    if (partial) await slot.settle("tutor", model, partial);
    else if (err instanceof Anthropic.APIUserAbortError) await slot.settle("tutor", model, { input_tokens: estimatedInput, output_tokens: 0 });
    else slot.release();

    if (err instanceof Anthropic.APIUserAbortError) return;
    if (err instanceof Anthropic.APIError) {
      return emit({ type: "error", code: "api", message: `Claude API error ${err.status ?? ""}: ${err.message}` });
    }
    throw err;
  }
}
