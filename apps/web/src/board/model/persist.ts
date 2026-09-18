import { get, set } from "idb-keyval";
import { useBoard, type SavedBoard } from "./store";

const KEY = "letsmath:board:v1";
const SAVE_DELAY_MS = 400;

export async function loadSavedBoard(): Promise<void> {
  try {
    const saved = await get<SavedBoard>(KEY);
    if (saved?.version === 1) useBoard.getState().load(saved);
  } catch (err) {
    console.warn("Could not load the saved board", err);
  }
}

/** Save the board to IndexedDB shortly after it stops changing. Call after loading. */
export function installAutosave(): () => void {
  let timer = 0;
  const unsubscribe = useBoard.subscribe((state, prev) => {
    if (
      state.shapes === prev.shapes &&
      state.images === prev.images &&
      state.camera === prev.camera &&
      state.background === prev.background
    ) {
      return;
    }
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      const { shapes, images, nextNum, nextZ, camera, background } = useBoard.getState();
      const saved: SavedBoard = { version: 1, shapes, images, nextNum, nextZ, camera, background };
      set(KEY, saved).catch((err) => console.warn("Autosave failed", err));
    }, SAVE_DELAY_MS);
  });
  return () => {
    clearTimeout(timer);
    unsubscribe();
  };
}
