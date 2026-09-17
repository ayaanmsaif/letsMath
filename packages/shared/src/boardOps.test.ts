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

  // The tutor's real input for "draw a unit circle and mark 30 degrees with its
  // coordinates". It was refused whole because the coordinate label ran three
  // characters past a 60-character limit, and the student saw nothing drawn.
  it("accepts the unit circle the tutor actually sent", () => {
    const sent = {
      axes: [
        { xMin: -1.3, xMax: 1.3, yMin: -1.3, yMax: 1.3, xLabel: "x", yLabel: "y", xStep: 0, yStep: 0, piTicks: false, grid: false, equalScale: true },
      ],
      plots: [],
      points: [
        { name: "O", x: 0, y: 0 },
        { name: "A", x: 1, y: 0 },
      ],
      constructions: [{ name: "P", kind: "polar", of: ["O"], angle: 30, distance: 1 }],
      circles: [{ centre: "O", through: "A", radius: 0, attention: false }],
      polygons: [],
      segments: [
        { from: "O", to: "P", dashed: false },
        { from: "O", to: "A", dashed: false },
      ],
      arcs: [{ centre: "O", from: "A", to: "P", attention: true }],
      angles: [{ at: "O", from: "A", to: "P", text: "30^{\\circ}", rightAngle: false }],
      labels: [],
      markedPoints: [
        { at: "P", text: "(\\cos30^{\\circ}, \\sin30^{\\circ}) = (\\frac{\\sqrt3}{2}, \\frac{1}{2})", dot: true },
      ],
      near: "g1",
      width: 400,
      caption: "Unit circle with the point at 30°",
    };
    const parsed = boardOpSchemas.draw_diagram.safeParse(sent);
    expect(parsed.error?.issues ?? []).toEqual([]);
  });

  it("keeps the descriptions the model relies on", () => {
    const circle = jsonSchemaFor("circle") as { properties: { target: { properties: { id: { description: string } } } } };
    expect(circle.properties.target.properties.id.description).toContain("g4");
  });
});
