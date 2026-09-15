import { useEffect } from "react";
import { PerfMeter } from "../dev/PerfMeter";
import { installShortcuts } from "./input/shortcuts";
import { EquationEditor } from "./math/EquationEditor";
import { installAutosave, loadSavedBoard } from "./model/persist";
import { Board } from "./render/Board";
import { BoardMenu, UndoRedo } from "./ui/BoardMenu";
import { LookingOverlay } from "./ui/LookingOverlay";
import { StylePanel } from "./ui/StylePanel";
import { Toolbar } from "./ui/Toolbar";
import { ZoomControls } from "./ui/ZoomControls";

const debug = new URLSearchParams(window.location.search).has("debug");

/** The whiteboard with its floating chrome. */
export function BoardView() {
  useEffect(() => {
    let cancelled = false;
    let disposeAutosave = () => {};
    // Autosave starts only after loading, so an empty board never overwrites the saved one.
    loadSavedBoard().then(() => {
      if (!cancelled) disposeAutosave = installAutosave();
    });
    const disposeShortcuts = installShortcuts();
    return () => {
      cancelled = true;
      disposeAutosave();
      disposeShortcuts();
    };
  }, []);

  return (
    <Board>
      <div className="absolute left-3 top-3">
        <UndoRedo />
      </div>
      <div className="absolute right-3 top-3">
        <BoardMenu />
      </div>
      <div className="absolute inset-x-0 bottom-4 flex flex-col items-center gap-2">
        <StylePanel />
        <Toolbar />
      </div>
      <div className="absolute bottom-4 right-3">
        <ZoomControls />
      </div>
      <EquationEditor />
      <LookingOverlay />
      {debug && <PerfMeter />}
    </Board>
  );
}
