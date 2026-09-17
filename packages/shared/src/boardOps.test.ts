import { describe, expect, it } from "vitest";
import { boardOpNames, boardOpSchemas, jsonSchemaFor } from "./boardOps";

describe("board op schemas", () => {
  it("accepts a well-formed circle call and rejects a malformed one", () => {
    expect(
      boardOpSchemas.circle.safeParse({ target: { id: "g4", box: null }, color: "mistake", note: null }).success,
    ).toBe(true);
    // Strict tool use means no extra fields and no missing ones.
    expect(boardOpSchemas.circle.safeParse({ target: { id: "g4", box: null }, color: "mistake" }).success).toBe(false);
    expect(
      boardOpSchemas.circle.safeParse({ target: { id: "g4", box: null }, color: "purple", note: null }).success,
    ).toBe(false);
  });

  it("accepts a box target and an angle arc", () => {
    expect(
      boardOpSchemas.highlight.safeParse({ target: { id: null, box: [10, 20, 30, 40] }, color: "attention" }).success,
    ).toBe(true);
    expect(
      boardOpSchemas.angle_arc.safeParse({
        vertex: [200, 500],
        p1: [600, 500],
        p2: [205, 222],
        label: "\\theta",
        color: "tutor",
      }).success,
    ).toBe(true);
  });

  // The API rejects strict tools whose schema allows extra or optional properties.
  it.each(boardOpNames)("emits a strict JSON Schema for %s", (name) => {
    const schema = jsonSchemaFor(name) as {
      type: string;
      properties: Record<string, unknown>;
      required?: string[];
      additionalProperties?: boolean;
      $schema?: string;
    };

    expect(schema.$schema).toBeUndefined();
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    expect([...(schema.required ?? [])].sort()).toEqual(Object.keys(schema.properties).sort());
  });

  // Strict tool schemas reject minItems above 1 and maxItems entirely, so points,
  // boxes and id lists are plain arrays whose lengths the server checks instead.
  it.each(boardOpNames)("uses no array length constraints the API refuses for %s", (name) => {
    const offenders: string[] = [];
    const walk = (node: unknown, path: string) => {
      if (!node || typeof node !== "object") return;
      const record = node as Record<string, unknown>;
      if (typeof record.minItems === "number" && record.minItems > 1) {
        offenders.push(`${path}.minItems = ${record.minItems}`);
      }
      if (record.maxItems !== undefined) offenders.push(`${path}.maxItems = ${String(record.maxItems)}`);
      for (const [key, value] of Object.entries(record)) walk(value, `${path}.${key}`);
    };
    walk(jsonSchemaFor(name), name);
    expect(offenders).toEqual([]);
  });

  /**
   * The API compiles every tool together and refuses more than 16 parameters
   * that are nullable or union-typed. Token counting doesn't enforce it, so a
   * live turn was the only thing that caught it: this counts them locally.
   */
  it("stays under the API's limit on union-typed parameters across all tools", () => {
    const unions: string[] = [];
    const walk = (node: unknown, path: string) => {
      if (!node || typeof node !== "object") return;
      const record = node as Record<string, unknown>;
      if (Array.isArray(record.anyOf) || Array.isArray(record.type)) unions.push(path);
      for (const [key, value] of Object.entries(record)) {
        if (key === "description") continue;
        walk(value, `${path}.${key}`);
      }
    };
    for (const name of boardOpNames) walk(jsonSchemaFor(name), name);

    expect(unions.length, `union-typed parameters: ${unions.join(", ")}`).toBeLessThanOrEqual(16);
  });

  it("keeps the descriptions the model relies on", () => {
    const circle = jsonSchemaFor("circle") as { properties: { target: { properties: { id: { description: string } } } } };
    expect(circle.properties.target.properties.id.description).toContain("g4");
  });
});
