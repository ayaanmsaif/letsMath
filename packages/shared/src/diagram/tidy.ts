// Make the tutor's diagram input usable where the fix is obvious (PLAN.md §4b).
//
// draw_diagram can't be a strict tool — its schema is far too big for the API's
// shared grammar budget — so nothing holds the model's output to the shape of
// the schema. A mathematically correct drawing was once refused twice over
// because `width` was missing and `near` held 48 characters of leaked tool-call
// markup: the model had slipped out of JSON mid-call, and the stray text landed
// in the previous field. None of that can make the maths wrong, so none of it
// should cost a drawing. Anything that could make it wrong is left exactly as
// sent, for the schema to refuse.

/** Every list the schema expects. A list left out simply means "none of these". */
const LISTS = [
  "axes",
  "plots",
  "points",
  "constructions",
  "circles",
  "polygons",
  "segments",
  "arcs",
  "angles",
  "labels",
  "markedPoints",
] as const;

/** Text fields inside those lists, which end up written on the board. */
const WRITTEN = ["text", "label", "xLabel", "yLabel", "expr"] as const;

/** Kept in step with schema.ts, where a test checks that tidied input passes. */
const DEFAULT_WIDTH = 360;
const MAX_NEAR = 40;

/** An id names a group, a shape, or a part of one: g4, #12, d1, g4.s2. */
const IS_ID = /^[#a-z]+\d+(\.[a-z]+\d*)?$/i;
const HAS_ID = /(?:^|[\s(])([gad]\d+|#\d+)(?:\.[a-z]+\d*)?\b/i;
/**
 * Tool-call markup that leaked into a value, which must never reach the board.
 * Any tag at all, not only a parameter one: the leaks seen so far include
 * </antml_parameter> and a stray <antml name name="at">. Maths never contains a
 * whole tag, so this can't eat anything real.
 */
const MARKUP = /<\/?[a-z][^<>]*>/gi;

export const stripMarkup = (text: string) => text.replace(MARKUP, " ").replace(/\s+/g, " ").trim();
const strip = stripMarkup;

export function tidyDiagramInput(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const given = raw as Record<string, unknown>;
  const tidied: Record<string, unknown> = {};

  for (const list of LISTS) {
    const items = Array.isArray(given[list]) ? (given[list] as unknown[]) : [];
    tidied[list] = items.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return item;
      const entry = { ...(item as Record<string, unknown>) };
      for (const field of WRITTEN) {
        if (typeof entry[field] === "string") entry[field] = strip(entry[field] as string);
      }
      return entry;
    });
  }

  // A missing width is a missing preference, not a mistake; the board has one.
  const width = typeof given.width === "number" ? given.width : Number(given.width);
  tidied.width = Number.isFinite(width) && width > 0 ? width : DEFAULT_WIDTH;

  // near should name something on the board. A sentence isn't an id, but usually
  // mentions one; failing that, the diagram just goes wherever there's room.
  const near = typeof given.near === "string" ? strip(given.near) : "";
  tidied.near = IS_ID.test(near) && near.length <= MAX_NEAR ? near : (near.match(HAS_ID)?.[1] ?? "");

  return tidied;
}

/**
 * The same care for a request to work a number out. Seen for real: the model
 * slipped out of JSON mid-call and left tag markup in `at`, which refused a
 * check whose expression and claim were both perfectly good. Being strict
 * doesn't prevent it — strictness fixes the shape of the JSON, not what ends up
 * inside a string.
 */
export function tidyCheckInput(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const given = raw as Record<string, unknown>;
  const text = (key: string) => (typeof given[key] === "string" ? strip(given[key] as string) : "");

  // Values look like "x=4". Anything left without an equals sign is debris.
  const at = text("at");
  return {
    expr: text("expr"),
    claim: text("claim"),
    at: at.includes("=") ? at : "",
    degrees: given.degrees !== false,
  };
}
