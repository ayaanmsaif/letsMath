import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { stream } from "hono/streaming";
import { z } from "zod";
import { config } from "./config";
import { budgetStatus } from "./tutor/ledger";
import { runTurn } from "./tutor/turn";

const app = new Hono();

app.get("/api/usage", async (c) => c.json(await budgetStatus()));

const turnRequest = z.object({
  sessionId: z.string().regex(/^[\w-]{8,64}$/),
  trigger: z.enum(["message", "check", "hint", "stuck"]),
  text: z.string().trim().min(1).max(4000),
  snapshot: z
    .object({
      data: z.string().max(8_000_000),
      mediaType: z.enum(["image/webp", "image/jpeg", "image/png"]),
      width: z.number().int().positive().max(2576),
      height: z.number().int().positive().max(2576),
      origin: z.tuple([z.number(), z.number()]),
      scale: z.number().positive(),
      digest: z.string().max(20_000),
      items: z
        .array(
          z.object({
            id: z.string().max(40),
            kind: z.enum(["handwriting", "shape", "annotation"]),
            box: z.tuple([z.number(), z.number(), z.number(), z.number()]),
            corners: z.array(z.tuple([z.number(), z.number()])).max(64).optional(),
            sides: z
              .array(
                z.object({
                  id: z.string().max(8),
                  a: z.tuple([z.number(), z.number()]),
                  b: z.tuple([z.number(), z.number()]),
                }),
              )
              .max(64)
              .optional(),
          }),
        )
        .max(500),
    })
    .nullable(),
  mock: z.boolean().optional(),
});

// One tutor turn, streamed back as newline-delimited JSON events.
app.post("/api/tutor/turn", async (c) => {
  const parsed = turnRequest.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: z.prettifyError(parsed.error) }, 400);

  c.header("Content-Type", "application/x-ndjson");
  c.header("Cache-Control", "no-cache");
  return stream(c, async (out) => {
    const abort = new AbortController();
    out.onAbort(() => abort.abort());
    try {
      await runTurn(
        parsed.data,
        async (event) => {
          await out.write(`${JSON.stringify(event)}\n`);
        },
        abort.signal,
      );
    } catch (err) {
      console.error("Tutor turn failed", err);
      await out.write(`${JSON.stringify({ type: "error", code: "api", message: "Something went wrong on the server." })}\n`);
    }
  });
});

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    tutorModel: config.tutorModel,
    tutorEffort: config.tutorEffort,
    watchModel: config.watchModel,
    apiKeyInEnv: config.apiKeyInEnv,
  }),
);

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`letsMath server listening on http://localhost:${info.port}`);
});
