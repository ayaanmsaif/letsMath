import type Anthropic from "@anthropic-ai/sdk";
import type { SnapshotMapping } from "./resolve";

export interface TutorSession {
  id: string;
  /** Append-only conversation history, including thinking blocks, exactly as the API returned it. */
  messages: Anthropic.MessageParam[];
  /** Total input tokens of the last request, to estimate the next request's worst-case cost. */
  lastInputTokens: number;
  /**
   * How the last snapshot maps onto the board. Kept so a turn where nothing
   * changed can still resolve what the tutor targets.
   */
  mapping: SnapshotMapping | null;
  /**
   * Results for the tool calls of the last turn. Every tool_use needs exactly
   * one tool_result, and they lead the next user message (PLAN.md §4).
   */
  pendingToolResults: Anthropic.ToolResultBlockParam[];
  /** Annotation ids run a1, a2, … for the life of the session. */
  annotationCount: number;
  /** One request per session at a time. */
  busy: boolean;
}

// In memory for the MVP (PLAN.md §5); sessions reset when the server restarts.
const sessions = new Map<string, TutorSession>();

export function getSession(id: string): TutorSession {
  let session = sessions.get(id);
  if (!session) {
    session = {
      id,
      messages: [],
      lastInputTokens: 0,
      mapping: null,
      pendingToolResults: [],
      annotationCount: 0,
      busy: false,
    };
    sessions.set(id, session);
  }
  return session;
}
