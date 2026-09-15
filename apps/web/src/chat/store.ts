import type { TurnTrigger, TurnUsage } from "@letsmath/shared";
import { create } from "zustand";
import { captureSnapshot, resetSnapshotMemory } from "../board/snapshot/snapshot";
import { readEvents } from "./stream";

export interface ChatMessage {
  id: string;
  role: "student" | "tutor";
  text: string;
  status: "streaming" | "done" | "error";
  error?: string;
  usage?: TurnUsage;
  mock?: boolean;
}

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
      for await (const event of readEvents(res.body)) {
        if (event.type === "text") {
          reply += event.text;
          set({ looking: false });
          update({ text: reply });
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
            update({ status: get().messages.find((m) => m.id === tutor.id)?.status === "error" ? "error" : "done", mock: event.mock });
          }
        }
      }
      if (!finished && delivered) update({ status: "error", error: "The connection to the tutor dropped. Try again." });
    } catch (err) {
      update({ status: "error", error: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      set({ busy: false, looking: false });
      if (!mock) void get().refreshUsage();
    }
  },

  newSession: () => {
    resetSnapshotMemory();
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
