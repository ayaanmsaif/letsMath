import { describe, expect, it } from "vitest";
import { readEvents } from "./stream";

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe("readEvents", () => {
  it("reassembles events split across network chunks", async () => {
    const chunks = ['{"type":"text","te', 'xt":"Hi "}\n{"type":"text","text":"there"}\n', '{"type":"done","stopReason":"end_turn","mock":true}'];
    const events = [];
    for await (const event of readEvents(streamOf(chunks))) events.push(event);
    expect(events).toEqual([
      { type: "text", text: "Hi " },
      { type: "text", text: "there" },
      { type: "done", stopReason: "end_turn", mock: true },
    ]);
  });
});
