// What the tutor is allowed to draw (PLAN.md §4a), as one source of truth:
// zod schemas validate the model's tool calls, and the same schemas become the
// strict JSON Schemas sent to the API.
//
// The model works in snapshot image pixels. The server resolves each call
// against the board and streams back a ResolvedOp in world units.
import { z } from "zod";
import type { DiagramPart } from "./diagram/compile";
import { diagramSpecSchema } from "./diagram/schema";

/** Colours carry meaning, so the tutor picks intent and the app owns the palette. */
export const tutorColors = ["mistake", "correct", "attention", "tutor"] as const;
export type TutorColor = (typeof tutorColors)[number];

const colour = z.enum(tutorColors);

// Plain number arrays, not tuples: strict tool schemas may only use minItems of
// 0 or 1, so a fixed length would be rejected by the API. The server checks the
// lengths instead, and tells the tutor when one is wrong.
const pixelPoint = z.array(z.number()).describe("[x, y] in snapshot pixels");
const pixelBox = z.array(z.number()).describe("[x1, y1, x2, y2] in snapshot pixels");

/**
 * What to annotate: an id from the digest (preferred; a group like g4, a shape
 * like #12, or a recognised part like g4.v1 / g4.s2), or a box in image pixels.
 * Strict tools need every field present, so unused ones are null.
 */
const target = z
  .object({
    id: z.string().max(40).nullable().describe("Id from the digest, e.g. g4, #12, g4.s2. Preferred."),
    box: pixelBox.nullable().describe("Fallback box [x1, y1, x2, y2] in snapshot pixels when no id fits."),
  })
  .strict();

export const boardOpSchemas = {
  circle: z
    .object({
      target,
      color: colour,
      note: z.string().max(60).nullable().describe("Optional short label written beside the circle."),
    })
    .strict(),

  highlight: z.object({ target, color: colour }).strict(),

  underline: z.object({ target, color: colour }).strict(),

  mark: z
    .object({
      target,
      symbol: z.enum(["check", "cross", "question"]),
    })
    .strict(),

  arrow: z
    .object({
      from: pixelPoint.describe("Start point in snapshot pixels."),
      to: pixelPoint.describe("End point in snapshot pixels."),
      label: z.string().max(60).nullable(),
      color: colour,
    })
    .strict(),

  angle_arc: z
    .object({
      vertex: pixelPoint.describe("The angle's corner; snaps to a detected corner when one is close."),
      p1: pixelPoint.describe("A point along the first arm."),
      p2: pixelPoint.describe("A point along the second arm."),
      label: z.string().max(40).nullable().describe("Label such as \\theta or 30°."),
      color: colour,
    })
    .strict(),

  write: z
    .object({
      at: pixelPoint.describe("Top-left of the text, in snapshot pixels. Keep clear of the student's work."),
      content: z.string().max(240),
      format: z.enum(["text", "latex"]),
      size: z.enum(["s", "m", "l"]),
      color: colour,
    })
    .strict(),

  /** Draw a figure from scratch, described in maths terms (PLAN.md §4b). */
  draw_diagram: diagramSpecSchema,

  erase_drawings: z
    .object({
      // No length limits here: strict tool schemas reject minItems above 1 and
      // maxItems entirely. The server caps the list instead.
      ids: z
        .array(z.string().max(40))
        .describe("Your own annotation ids to remove, or the single item \"all\" to clear everything you drew."),
    })
    .strict(),
} as const;

export type BoardOpName = keyof typeof boardOpSchemas;
export type BoardOpInput<K extends BoardOpName = BoardOpName> = z.infer<(typeof boardOpSchemas)[K]>;

export const boardOpNames = Object.keys(boardOpSchemas) as BoardOpName[];

/** JSON Schema for strict tool use: every property required, nothing extra allowed. */
export function jsonSchemaFor(name: BoardOpName): Record<string, unknown> {
  const { $schema, ...schema } = z.toJSONSchema(boardOpSchemas[name], { io: "input" }) as Record<string, unknown>;
  void $schema;
  return schema;
}

// ---------- what the server streams back ----------

export type WorldPoint = [number, number];
export type WorldBox = [number, number, number, number];

/** A validated, resolved annotation in world units, ready for the board to draw. */
export type ResolvedOp =
  | { id: string; kind: "circle"; box: WorldBox; color: TutorColor; note: string | null }
  | { id: string; kind: "highlight"; box: WorldBox; color: TutorColor }
  | { id: string; kind: "underline"; box: WorldBox; color: TutorColor }
  | { id: string; kind: "mark"; at: WorldPoint; size: number; symbol: "check" | "cross" | "question" }
  | { id: string; kind: "arrow"; from: WorldPoint; to: WorldPoint; label: string | null; color: TutorColor }
  | {
      id: string;
      kind: "angle_arc";
      vertex: WorldPoint;
      p1: WorldPoint;
      p2: WorldPoint;
      radius: number;
      label: string | null;
      color: TutorColor;
    }
  | {
      id: string;
      kind: "write";
      at: WorldPoint;
      content: string;
      format: "text" | "latex";
      size: "s" | "m" | "l";
      color: TutorColor;
    }
  | { id: string; kind: "diagram"; parts: DiagramPart[]; caption: string | null }
  | { id: string; kind: "erase"; ids: string[] | "all" };

/** Lengths the API can't enforce for us, checked on the server instead. */
export const EXPECTED_LENGTHS = { point: 2, box: 4 } as const;

/** Most annotations one erase call may name. */
export const MAX_ERASE_IDS = 50;

/** Why a tool call couldn't be carried out; sent back to the model as its tool result. */
export interface OpFailure {
  toolUseId: string;
  name: string;
  message: string;
}
