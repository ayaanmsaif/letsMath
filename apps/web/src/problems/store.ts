// Keeping a student's problems, and moving between them (PLAN.md §6).
//
// Before this, a refresh brought the board back but not the conversation, so
// the tutor reappeared with no memory of work it had just been discussing. A
// problem now holds both, and there can be more than one of them.
import { create } from "zustand";
import { forgetAnnotations } from "../board/ai/applyOps";
import { useBoard, type SavedBoard } from "../board/model/store";
import { resetSnapshotMemory } from "../board/snapshot/snapshot";
import { useChat } from "../chat/store";
import {
  deleteProblem,
  forgetOldBoard,
  readIndex,
  readOldBoard,
  readProblem,
  writeIndex,
  writeProblem,
  type ProblemRecord,
  type ProblemSummary,
} from "./storage";

const SAVE_DELAY_MS = 500;
export const UNTITLED = "New problem";

const emptyBoard = (): SavedBoard => ({
  version: 1,
  shapes: {},
  images: {},
  nextNum: 1,
  nextZ: 1,
  camera: { x: 0, y: 0, z: 1 },
  background: useBoard.getState().background,
});

/** A problem is named after the first thing the student said about it. */
function titleNow(): string {
  const asked = useChat.getState().messages.find((message) => message.role === "student");
  const text = asked?.text.replace(/\s+/g, " ").trim() ?? "";
  if (!text) return UNTITLED;
  return text.length > 48 ? `${text.slice(0, 47)}…` : text;
}

const gather = (): ProblemRecord => {
  const { shapes, images, nextNum, nextZ, camera, background } = useBoard.getState();
  const { sessionId, messages } = useChat.getState();
  return {
    version: 1,
    board: { version: 1, shapes, images, nextNum, nextZ, camera, background },
    chat: { sessionId, messages },
  };
};

interface ProblemsState {
  list: ProblemSummary[];
  current: string;
  /** Nothing is saved until the first problem has been loaded, or it would be overwritten. */
  ready: boolean;

  start: () => Promise<void>;
  open: (id: string) => Promise<void>;
  create: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Write the open problem now, rather than waiting for the pause after a change. */
  flush: () => Promise<void>;
}

let timer = 0;

export const useProblems = create<ProblemsState>()((set, get) => {
  /** Put the open problem away, and keep the index in step with it. */
  const save = async () => {
    const { current, ready, list } = get();
    if (!ready || !current) return;
    const saved = gather();
    const title = titleNow();
    const summary: ProblemSummary = { id: current, title, updatedAt: Date.now() };
    const next = [summary, ...list.filter((problem) => problem.id !== current)];
    set({ list: next });
    await Promise.all([writeProblem(current, saved), writeIndex(next)]);
  };

  const saveSoon = () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => void save(), SAVE_DELAY_MS);
  };

  /** Put a problem's board and conversation in front of the student. */
  const show = (id: string, saved: ProblemRecord) => {
    resetSnapshotMemory();
    forgetAnnotations();
    useBoard.getState().load(saved.board);
    useChat.getState().load(saved.chat);
    set({ current: id });
  };

  // A change to either half of a problem starts the clock on saving it.
  useBoard.subscribe((state, prev) => {
    if (state.shapes !== prev.shapes || state.images !== prev.images || state.background !== prev.background) saveSoon();
  });
  useChat.subscribe((state, prev) => {
    if (state.messages !== prev.messages) saveSoon();
  });

  return {
    list: [],
    current: "",
    ready: false,

    start: async () => {
      const list = await readIndex();

      // A board saved before problems existed becomes the first problem.
      if (list.length === 0) {
        const old = await readOldBoard();
        const id = crypto.randomUUID();
        const saved: ProblemRecord = {
          version: 1,
          board: old ?? emptyBoard(),
          chat: { sessionId: id, messages: [] },
        };
        show(id, saved);
        set({ ready: true, list: [{ id, title: UNTITLED, updatedAt: Date.now() }] });
        await Promise.all([writeProblem(id, saved), writeIndex(get().list), old ? forgetOldBoard() : Promise.resolve()]);
        return;
      }

      const newest = list[0];
      const saved = await readProblem(newest.id);
      show(newest.id, saved ?? { version: 1, board: emptyBoard(), chat: { sessionId: newest.id, messages: [] } });
      set({ ready: true, list });
    },

    open: async (id) => {
      if (id === get().current) return;
      clearTimeout(timer);
      await save();
      const saved = await readProblem(id);
      if (!saved) return;
      show(id, saved);
    },

    create: async () => {
      clearTimeout(timer);
      await save();
      const id = crypto.randomUUID();
      const saved: ProblemRecord = { version: 1, board: emptyBoard(), chat: { sessionId: id, messages: [] } };
      show(id, saved);
      const list = [{ id, title: UNTITLED, updatedAt: Date.now() }, ...get().list];
      set({ list });
      await Promise.all([writeProblem(id, saved), writeIndex(list)]);
    },

    remove: async (id) => {
      const list = get().list.filter((problem) => problem.id !== id);
      set({ list });
      await Promise.all([deleteProblem(id), writeIndex(list)]);
      // Deleting the one on screen leaves nothing to look at, so open another.
      if (id === get().current) {
        if (list.length > 0) await get().open(list[0].id);
        else await get().create();
      }
    },

    flush: async () => {
      clearTimeout(timer);
      await save();
    },
  };
});
