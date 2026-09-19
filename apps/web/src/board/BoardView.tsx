import { useEffect } from "react";
import { PerfMeter } from "../dev/PerfMeter";
import { TutorCursor } from "./ai/TutorCursor";
import { useProblems } from "../problems/store";
import { installShortcuts } from "./input/shortcuts";
import { EquationEditor } from "./math/EquationEditor";
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
    // Opens the problem last worked on, and starts saving it. Saving waits for
    // that load, or an empty board would be written over the saved one.
    void useProblems.getState().start();
    const disposeShortcuts = installShortcuts();
    // Whatever is on screen when the tab closes is kept.
    const saveNow = () => void useProblems.getState().flush();
    window.addEventListener("pagehide", saveNow);
    return () => {
      window.removeEventListener("pagehide", saveNow);
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
      <TutorCursor />
      {debug && <PerfMeter />}
    </Board>
  );
}
