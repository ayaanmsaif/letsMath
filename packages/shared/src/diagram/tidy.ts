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
/** Tool-call markup that leaked into a value. It must never reach the board. */
const MARKUP = /<\/?[a-z:]*parameter[^>]*>/gi;

const strip = (text: string) => text.replace(MARKUP, " ").replace(/\s+/g, " ").trim();

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
