import type Anthropic from "@anthropic-ai/sdk";

export interface TutorSession {
  id: string;
  /** Append-only conversation history, including thinking blocks, exactly as the API returned it. */
  messages: Anthropic.MessageParam[];
  /** Total input tokens of the last request, to estimate the next request's worst-case cost. */
  lastInputTokens: number;
  /** One request per session at a time. */
  busy: boolean;
}

// In memory for the MVP (PLAN.md §5); sessions reset when the server restarts.
const sessions = new Map<string, TutorSession>();

export function getSession(id: string): TutorSession {
  let session = sessions.get(id);
  if (!session) {
    session = { id, messages: [], lastInputTokens: 0, busy: false };
    sessions.set(id, session);
  }
  return session;
}
