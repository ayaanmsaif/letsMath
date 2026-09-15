import { updatePatch } from "../model/history";
import { useBoard, type ToolId } from "../model/store";
import { FONT_SIZE, HIGHLIGHTER_COLORS, INK_COLORS } from "../model/style";
import type { Shape, StrokeSize } from "../model/types";
import { measureText } from "../tools/text";

const STYLED_TOOLS: ToolId[] = ["pen", "highlighter", "line", "arrow", "rect", "ellipse", "polygon", "text", "equation"];
const SIZES: StrokeSize[] = ["s", "m", "l"];

function restyle(shape: Shape, change: { color?: string; size?: StrokeSize }): Shape {
  const next = { ...shape, ...change } as Shape;
  if (next.type === "text" && change.size) {
    const fontSize = FONT_SIZE[change.size];
    return { ...next, fontSize, ...measureText(next.text, fontSize) };
  }
  return next;
}

/** Colour and size for the active tool, or for the selected shapes. */
export function StylePanel() {
  const tool = useBoard((s) => s.tool);
  const selection = useBoard((s) => s.selection);
  const shapes = useBoard((s) => s.shapes);
  const inkColor = useBoard((s) => s.inkColor);
  const highlighterColor = useBoard((s) => s.highlighterColor);
  const size = useBoard((s) => s.size);

  const selected = tool === "select" ? selection.map((id) => shapes[id]).filter(Boolean) : [];
  if (!STYLED_TOOLS.includes(tool) && selected.length === 0) return null;

  const highlighterMode =
    tool === "highlighter" || (selected.length > 0 && selected.every((s) => s.type === "ink" && s.tool === "highlighter"));
  const colors = highlighterMode ? HIGHLIGHTER_COLORS : INK_COLORS;
  const activeColor = selected.length > 0 ? selected[0].color : highlighterMode ? highlighterColor : inkColor;
  const activeSize = selected.length > 0 ? selected[0].size : size;

  const apply = (change: { color?: string; size?: StrokeSize }) => {
    const board = useBoard.getState();
    if (selected.length > 0) {
      board.commit(updatePatch(selected.map((s) => [s, restyle(s, change)])), "restyle");
    }
    if (change.color) board.setColor(change.color);
    if (change.size) board.setSize(change.size);
  };

  return (
    <div className="pointer-events-auto flex items-center gap-1 rounded-2xl border border-stone-200 bg-white/95 px-2 py-1.5 shadow-[0_6px_24px_rgba(28,25,23,0.08)] backdrop-blur">
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={`Colour ${color}`}
          aria-pressed={color === activeColor}
          onClick={() => apply({ color })}
          className="grid size-8 place-items-center rounded-lg hover:bg-stone-100"
        >
          <span
            className={`size-5 rounded-full transition-shadow ${color === activeColor ? "ring-2 ring-stone-900 ring-offset-2" : ""}`}
            style={{ backgroundColor: color }}
          />
        </button>
      ))}

      <span className="mx-1 h-5 w-px bg-stone-200" />

      {SIZES.map((s) => (
        <button
          key={s}
          type="button"
          aria-label={{ s: "Small", m: "Medium", l: "Large" }[s]}
          aria-pressed={s === activeSize}
          onClick={() => apply({ size: s })}
          className={`grid size-8 place-items-center rounded-lg ${s === activeSize ? "bg-stone-100" : "hover:bg-stone-100"}`}
        >
          <span className="rounded-full bg-stone-800" style={{ width: { s: 4, m: 8, l: 13 }[s], height: { s: 4, m: 8, l: 13 }[s] }} />
        </button>
      ))}
    </div>
  );
}
