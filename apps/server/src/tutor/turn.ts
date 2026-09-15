import Anthropic from "@anthropic-ai/sdk";
import { countImageTokens, type TurnEvent, type TurnRequest } from "@letsmath/shared";
import { createClaude } from "../claude";
import { config } from "../config";
import { worstCaseUsd, type Usage } from "./cost";
import { BudgetExceededError, budgetStatus, reserve } from "./ledger";
import { mockReply } from "./mock";
import { TUTOR_SYSTEM_PROMPT } from "./prompt";
import { getSession, type TutorSession } from "./session";

/** Replies are a few sentences; this leaves room for thinking. Raised in M4 for draw_svg. */
const MAX_TOKENS = 4096;
/** Rough allowance for the system prompt and message framing when estimating worst-case cost. */
const PROMPT_ALLOWANCE_TOKENS = 2500;

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
      for await (const chunk of mockReply(request, signal)) await emit({ type: "text", text: chunk });
      await emit({ type: "done", stopReason: "end_turn", mock: true });
    } else {
      await runClaudeTurn(session, request, emit, signal);
    }
  } finally {
    session.busy = false;
  }
}

function userContent(request: TurnRequest): Anthropic.ContentBlockParam[] {
  const content: Anthropic.ContentBlockParam[] = [];
  if (request.snapshot) {
    // Image first, then its digest, then the student's words.
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

  client ??= createClaude();
  const messages: Anthropic.MessageParam[] = [...session.messages, { role: "user", content: userContent(request) }];
  const stream = client.messages.stream(
    {
      model,
      max_tokens: MAX_TOKENS,
      system: TUTOR_SYSTEM_PROMPT,
      // Caches everything up to the newest message, so each turn re-reads history at 0.1× price.
      cache_control: { type: "ephemeral" },
      thinking: { type: "adaptive" },
      output_config: { effort: config.tutorEffort as "low" | "medium" | "high" },
      messages,
    },
    { signal },
  );
  stream.on("text", (text) => void emit({ type: "text", text }));

  try {
    const message = await stream.finalMessage();
    // Only a completed turn joins the history, so a failed one can simply be retried.
    session.messages = [...messages, { role: "assistant", content: message.content }];
    session.lastInputTokens =
      message.usage.input_tokens +
      (message.usage.cache_read_input_tokens ?? 0) +
      (message.usage.cache_creation_input_tokens ?? 0);

    const entry = await slot.settle("tutor", message.model, message.usage);
    const status = await budgetStatus();
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
