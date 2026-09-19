import type { ResolvedOp, TurnTrigger, TurnUsage } from "@letsmath/shared";
import { create } from "zustand";
import { applyOp, forgetAnnotations } from "../board/ai/applyOps";
import { useDraft } from "../board/model/draft";
import { captureSnapshot, resetSnapshotMemory } from "../board/snapshot/snapshot";
import { readEvents } from "./stream";
import { describeDrawings } from "./summary";

/** A drawing the tutor made during a reply, shown as a chip under it. */
export interface Drawing {
  id: string;
  label: string;
  kind: ResolvedOp["kind"];
}

export interface ChatMessage {
  id: string;
  role: "student" | "tutor";
  text: string;
  status: "streaming" | "done" | "error";
  error?: string;
  usage?: TurnUsage;
  mock?: boolean;
  drawings?: Drawing[];
}

const DRAWING_LABELS: Record<ResolvedOp["kind"], string> = {
  circle: "circled your working",
  highlight: "highlighted a line",
  underline: "underlined a line",
  mark: "marked your work",
  arrow: "drew an arrow",
  angle_arc: "marked an angle",
  write: "wrote on the board",
  diagram: "drew a diagram",
  erase: "cleared its marks",
};

/** What the tutor was last shown, for the dev inspector. */
export interface LastLook {
  imageUrl: string;
  digest: string;
  width: number;
  height: number;
}

interface ChatState {
  sessionId: string;
  messages: ChatMessage[];
  busy: boolean;
  /** Set while the tutor is looking at the board and hasn't started replying. */
  looking: boolean;
  lastLook: LastLook | null;
  spend: { spentUsd: number; budgetUsd: number } | null;
  serverOnline: boolean | null;

  send: (trigger: TurnTrigger, text: string) => Promise<void>;
  /** Show a saved conversation. Its id is the tutor's session id on the server. */
  load: (saved: { sessionId: string; messages: ChatMessage[] }) => void;
  newSession: () => void;
  refreshUsage: () => Promise<void>;
}

// Development only: ?mock=1 streams scripted replies from the server and costs nothing.
const mock = new URLSearchParams(window.location.search).has("mock");

export const useChat = create<ChatState>()((set, get) => ({
  sessionId: crypto.randomUUID(),
  messages: [],
  busy: false,
  looking: false,
  lastLook: null,
  spend: null,
  serverOnline: null,

  send: async (trigger, text) => {
    if (get().busy) return;
    const student: ChatMessage = { id: crypto.randomUUID(), role: "student", text, status: "done" };
    const tutor: ChatMessage = { id: crypto.randomUUID(), role: "tutor", text: "", status: "streaming" };
    set({ busy: true, looking: true, messages: [...get().messages, student, tutor] });

    const update = (patch: Partial<ChatMessage>) =>
      set({ messages: get().messages.map((m) => (m.id === tutor.id ? { ...m, ...patch } : m)) });

    try {
      const pending = await captureSnapshot();
      if (pending) {
        const { snapshot } = pending;
        set({
          lastLook: {
            imageUrl: `data:${snapshot.mediaType};base64,${snapshot.data}`,
            digest: snapshot.digest,
            width: snapshot.width,
            height: snapshot.height,
          },
        });
      }

      const res = await fetch("/api/tutor/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: get().sessionId,
          trigger,
          text,
          snapshot: pending?.snapshot ?? null,
          ...(mock ? { mock: true } : {}),
        }),
      });
      if (!res.ok || !res.body) throw new Error(`The tutor server returned ${res.status}.`);

      let reply = "";
      let delivered = true;
      let finished = false;
      const drawings: Drawing[] = [];
      for await (const event of readEvents(res.body)) {
        if (event.type === "text") {
          reply += event.text;
          set({ looking: false });
          update({ text: reply });
        } else if (event.type === "op") {
          // Draw it straight away; all of a turn's marks undo together.
          void applyOp(event.op, tutor.id);
          if (event.op.kind !== "erase") {
            drawings.push({ id: event.op.id, label: DRAWING_LABELS[event.op.kind], kind: event.op.kind });
            update({ drawings: [...drawings] });
          }
        } else if (event.type === "usage") {
          update({ usage: event.usage });
          set({ spend: { spentUsd: event.usage.spentUsd, budgetUsd: event.usage.budgetUsd } });
        } else if (event.type === "error") {
          // A refusal still means the tutor saw the board; other errors mean the turn didn't happen.
          if (event.code !== "refusal") delivered = false;
          update({ status: "error", error: event.message });
        } else if (event.type === "done") {
          finished = true;
          if (delivered) {
            pending?.commit();
            const failed = get().messages.find((m) => m.id === tutor.id)?.status === "error";
            // The tutor sometimes draws without saying anything; describe it rather than show a blank reply.
            const text = reply.trim() ? reply : describeDrawings(drawings.map((d) => d.kind));
            update({ text, status: failed ? "error" : "done", mock: event.mock });
          }
        }
      }
      if (!finished && delivered) update({ status: "error", error: "The connection to the tutor dropped. Try again." });
    } catch (err) {
      update({ status: "error", error: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      set({ busy: false, looking: false });
      // Let the pen rest on the last mark for a moment, then put it away.
      window.setTimeout(() => useDraft.getState().set({ tutorCursor: null }), 900);
      if (!mock) void get().refreshUsage();
    }
  },

  load: ({ sessionId, messages }) => {
    // A reply streaming into the old problem must not land in the new one.
    set({ sessionId, messages, busy: false, looking: false, lastLook: null });
  },

  newSession: () => {
    resetSnapshotMemory();
    forgetAnnotations();
    set({ sessionId: crypto.randomUUID(), messages: [], lastLook: null });
  },

  refreshUsage: async () => {
    try {
      const res = await fetch("/api/usage");
      if (!res.ok) throw new Error();
      const status = (await res.json()) as { spentUsd: number; budgetUsd: number };
      set({ spend: { spentUsd: status.spentUsd, budgetUsd: status.budgetUsd }, serverOnline: true });
    } catch {
      set({ serverOnline: false });
    }
  },
}));
