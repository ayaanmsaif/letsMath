import { Maximize, Minus, Plus } from "lucide-react";
import { resetZoom, zoomBy, zoomToFit } from "../input/shortcuts";
import { useBoard } from "../model/store";
import { IconButton, panelClass } from "./IconButton";

export function ZoomControls() {
  const z = useBoard((s) => s.camera.z);

  return (
    <div className={panelClass}>
      <IconButton label="Zoom out" shortcut="−" onClick={() => zoomBy(0.8)}>
        <Minus className="size-4" />
      </IconButton>
      <button
        type="button"
        onClick={resetZoom}
        className="group relative h-8 min-w-12 rounded-lg px-1 text-xs font-medium tabular-nums text-stone-600 hover:bg-stone-100"
      >
        {Math.round(z * 100)}%
      </button>
      <IconButton label="Zoom in" shortcut="+" onClick={() => zoomBy(1.25)}>
        <Plus className="size-4" />
      </IconButton>
      <IconButton label="Zoom to fit" shortcut="⇧1" onClick={zoomToFit}>
        <Maximize className="size-4" />
      </IconButton>
    </div>
  );
}
