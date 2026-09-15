// Wire format between the web app and the tutor server.

/** A rendered view of the board plus the text digest that describes it. */
export interface BoardSnapshot {
  /** Base64 image data, without a data: prefix. */
  data: string;
  mediaType: "image/webp" | "image/jpeg" | "image/png";
  /** Pixel size. Chosen so Claude never resizes the image. */
  width: number;
  height: number;
  /** Image pixel = (world − origin) × scale. */
  origin: [number, number];
  scale: number;
  /** Compact description of what's on the board, in image pixel coordinates. */
  digest: string;
}

export type TurnTrigger = "message" | "check" | "hint" | "stuck";

export interface TurnRequest {
  sessionId: string;
  trigger: TurnTrigger;
  text: string;
  /** Null when the board hasn't changed since the tutor last looked. */
  snapshot: BoardSnapshot | null;
  /** Development only: stream a scripted reply instead of calling Claude (costs nothing). */
  mock?: boolean;
}

export interface TurnUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  /** Development spend so far, after this turn. */
  spentUsd: number;
  budgetUsd: number;
}

/** Streamed from the server as newline-delimited JSON, one event per line. */
export type TurnEvent =
  | { type: "text"; text: string }
  | { type: "usage"; usage: TurnUsage }
  | { type: "done"; stopReason: string | null; mock: boolean }
  | { type: "error"; code: "budget" | "api" | "invalid" | "refusal"; message: string };
