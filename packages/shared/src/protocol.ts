// Wire format between the web app and the tutor server.
import type { ResolvedOp } from "./boardOps";

/**
 * One addressable thing on the board, in snapshot pixels, so the server can
 * resolve what the tutor targets and snap to real geometry.
 */
export interface BoardItem {
  /** g4 (handwriting), #12 (shape), a3 (the tutor's own annotation). */
  id: string;
  kind: "handwriting" | "shape" | "annotation";
  box: [number, number, number, number];
  /** Recognised corners, addressable as g4.v1, g4.v2, … */
  corners?: [number, number][];
  /** Recognised sides, addressable as g4.s1, g4.s2, … */
  sides?: { id: string; a: [number, number]; b: [number, number] }[];
}

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
  /** The same items in structured form, for resolving and snapping the tutor's targets. */
  items: BoardItem[];
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
  /** Time from the request arriving to the first word of the reply. */
  firstWordMs?: number;
  /** Time from the request arriving to the reply finishing. */
  totalMs?: number;
}

/** Streamed from the server as newline-delimited JSON, one event per line. */
export type TurnEvent =
  | { type: "text"; text: string }
  /** A drawing to apply to the board, in world units, as soon as it arrives. */
  | { type: "op"; op: ResolvedOp }
  | { type: "usage"; usage: TurnUsage }
  | { type: "done"; stopReason: string | null; mock: boolean }
  | { type: "error"; code: "budget" | "api" | "invalid" | "refusal"; message: string };
