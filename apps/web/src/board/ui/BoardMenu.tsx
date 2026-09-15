import { Eye, EyeOff, Grid3x3, Grip, Redo2, Rows3, Square, Trash2, Undo2 } from "lucide-react";
import { useState } from "react";
import { useBoard, type Background } from "../model/store";
import { IconButton, MOD_KEY, panelClass } from "./IconButton";

export function UndoRedo() {
  const canUndo = useBoard((s) => s.history.undo.length > 0);
  const canRedo = useBoard((s) => s.history.redo.length > 0);

  return (
    <div className={panelClass}>
      <IconButton label="Undo" shortcut={`${MOD_KEY}Z`} side="bottom" disabled={!canUndo} onClick={() => useBoard.getState().undo()}>
        <Undo2 className="size-4" />
      </IconButton>
      <IconButton label="Redo" shortcut={`${MOD_KEY}⇧Z`} side="bottom" disabled={!canRedo} onClick={() => useBoard.getState().redo()}>
        <Redo2 className="size-4" />
      </IconButton>
    </div>
  );
}

const BACKGROUNDS: { id: Background; label: string; icon: typeof Square }[] = [
  { id: "blank", label: "Blank", icon: Square },
  { id: "dots", label: "Dots", icon: Grip },
  { id: "grid", label: "Grid", icon: Grid3x3 },
  { id: "lined", label: "Lined", icon: Rows3 },
];

/** Background picker, tutor-drawing visibility, and clear board. */
export function BoardMenu() {
  const background = useBoard((s) => s.background);
  const tutorVisible = useBoard((s) => s.tutorVisible);
  const isEmpty = useBoard((s) => Object.keys(s.shapes).length === 0);
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <div className="relative">
      <div className={panelClass}>
        {BACKGROUNDS.map(({ id, label, icon: Icon }) => (
          <IconButton
            key={id}
            label={`${label} background`}
            side="bottom"
            active={background === id}
            onClick={() => useBoard.getState().setBackground(id)}
          >
            <Icon className="size-4" />
          </IconButton>
        ))}
        <span className="mx-1 h-5 w-px bg-stone-200" />
        <IconButton
          label={tutorVisible ? "Hide tutor drawings" : "Show tutor drawings"}
          side="bottom"
          onClick={() => useBoard.getState().toggleTutorVisible()}
        >
          {tutorVisible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
        </IconButton>
        <IconButton label="Clear board" side="bottom" disabled={isEmpty} onClick={() => setConfirmClear(true)}>
          <Trash2 className="size-4" />
        </IconButton>
      </div>

      {confirmClear && (
        <div className="pointer-events-auto absolute right-0 top-full mt-2 w-64 rounded-xl border border-stone-200 bg-white p-3 shadow-[0_6px_24px_rgba(28,25,23,0.1)]">
          <p className="text-sm font-medium text-stone-900">Clear the whole board?</p>
          <p className="mt-0.5 text-xs text-stone-500">You can undo this.</p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmClear(false)}
              className="rounded-lg px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                useBoard.getState().clearBoard();
                setConfirmClear(false);
              }}
              className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-800"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
