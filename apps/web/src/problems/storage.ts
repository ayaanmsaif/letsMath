// Where a problem is kept between visits (PLAN.md §6).
//
// One problem is one board and the conversation about it, saved together under
// the problem's id. A short index is kept apart from the records so the picker
// can list everything without loading every board.
import { del, get, set } from "idb-keyval";
import type { SavedBoard } from "../board/model/store";
import type { ChatMessage } from "../chat/store";

const INDEX = "letsmath:problems";
const record = (id: string) => `letsmath:problem:${id}`;
/** The single board saved before there were problems to put boards in. */
const OLD_BOARD = "letsmath:board:v1";

export interface ProblemSummary {
  id: string;
  title: string;
  updatedAt: number;
}

export interface SavedChat {
  /** Also the tutor's session id on the server, so reopening can pick up where it left off. */
  sessionId: string;
  messages: ChatMessage[];
}

export interface ProblemRecord {
  version: 1;
  board: SavedBoard;
  chat: SavedChat;
}

export const readIndex = async (): Promise<ProblemSummary[]> => (await get<ProblemSummary[]>(INDEX)) ?? [];
export const writeIndex = (list: ProblemSummary[]): Promise<void> => set(INDEX, list);

export const readProblem = (id: string): Promise<ProblemRecord | undefined> => get<ProblemRecord>(record(id));
export const writeProblem = (id: string, saved: ProblemRecord): Promise<void> => set(record(id), saved);
export const deleteProblem = (id: string): Promise<void> => del(record(id));

export const readOldBoard = (): Promise<SavedBoard | undefined> => get<SavedBoard>(OLD_BOARD);
export const forgetOldBoard = (): Promise<void> => del(OLD_BOARD);
