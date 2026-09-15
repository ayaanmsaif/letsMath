import {
  ChevronUp,
  Circle,
  Eraser,
  Hand,
  Highlighter,
  Minus,
  MousePointer2,
  MoveUpRight,
  PenLine,
  Sigma,
  Sparkles,
  Square,
  Triangle,
  Type,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { TOOL_SHORTCUTS } from "../input/shortcuts";
import { useBoard, type ToolId } from "../model/store";

interface ToolInfo {
  id: ToolId;
  label: string;
  icon: LucideIcon;
}

const MAIN_TOOLS: ToolInfo[] = [
  { id: "select", label: "Select", icon: MousePointer2 },
  { id: "hand", label: "Hand", icon: Hand },
  { id: "pen", label: "Pen", icon: PenLine },
  { id: "highlighter", label: "Highlighter", icon: Highlighter },
  { id: "eraser", label: "Eraser", icon: Eraser },
];

const SHAPE_TOOLS: ToolInfo[] = [
  { id: "line", label: "Line", icon: Minus },
  { id: "arrow", label: "Arrow", icon: MoveUpRight },
  { id: "rect", label: "Rectangle", icon: Square },
  { id: "ellipse", label: "Ellipse", icon: Circle },
  { id: "polygon", label: "Polygon", icon: Triangle },
];

const EXTRA_TOOLS: ToolInfo[] = [
  { id: "text", label: "Text", icon: Type },
  { id: "equation", label: "Equation", icon: Sigma },
  { id: "laser", label: "Laser pointer", icon: Sparkles },
];

export function Toolbar() {
  const tool = useBoard((s) => s.tool);
  const setTool = useBoard((s) => s.setTool);
  const [lastShape, setLastShape] = useState<ToolInfo>(SHAPE_TOOLS[0]);
  const [shapesOpen, setShapesOpen] = useState(false);
  const shapeActive = SHAPE_TOOLS.find((t) => t.id === tool);
  const shownShape = shapeActive ?? lastShape;

  return (
    <div className="pointer-events-auto flex items-center gap-0.5 rounded-2xl border border-stone-200 bg-white/95 p-1.5 shadow-[0_6px_24px_rgba(28,25,23,0.08)] backdrop-blur">
      {MAIN_TOOLS.map((t) => (
        <ToolButton key={t.id} info={t} active={tool === t.id} onClick={() => setTool(t.id)} />
      ))}

      <Divider />

      <div className="relative flex items-center">
        <ToolButton
          info={shownShape}
          active={Boolean(shapeActive)}
          onClick={() => {
            setTool(shownShape.id);
            setShapesOpen(false);
          }}
        />
        <button
          type="button"
          aria-label="More shapes"
          onClick={() => setShapesOpen((open) => !open)}
          className="grid h-9 w-4 place-items-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-700"
        >
          <ChevronUp className={`size-3.5 transition-transform ${shapesOpen ? "" : "rotate-180"}`} />
        </button>
        {shapesOpen && (
          <div className="absolute bottom-full left-0 mb-3 flex gap-0.5 rounded-2xl border border-stone-200 bg-white p-1.5 shadow-[0_6px_24px_rgba(28,25,23,0.08)]">
            {SHAPE_TOOLS.map((t) => (
              <ToolButton
                key={t.id}
                info={t}
                active={tool === t.id}
                onClick={() => {
                  setLastShape(t);
                  setTool(t.id);
                  setShapesOpen(false);
                }}
              />
            ))}
          </div>
        )}
      </div>

      <Divider />

      {EXTRA_TOOLS.map((t) => (
        <ToolButton key={t.id} info={t} active={tool === t.id} onClick={() => setTool(t.id)} />
      ))}
    </div>
  );
}

function ToolButton({ info, active, onClick }: { info: ToolInfo; active: boolean; onClick: () => void }) {
  const Icon = info.icon;
  return (
    <button
      type="button"
      aria-label={info.label}
      aria-pressed={active}
      onClick={onClick}
      className={`group relative grid size-9 place-items-center rounded-xl transition-colors ${
        active ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
      }`}
    >
      <Icon className="size-[18px]" strokeWidth={1.75} />
      <Tooltip label={info.label} shortcut={TOOL_SHORTCUTS[info.id]} />
    </button>
  );
}

export function Tooltip({ label, shortcut, side = "top" }: { label: string; shortcut?: string; side?: "top" | "bottom" }) {
  return (
    <span
      className={`pointer-events-none absolute left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-lg bg-stone-900 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-sm transition-opacity delay-300 group-hover:opacity-100 ${
        side === "top" ? "bottom-full mb-2.5" : "top-full mt-2.5"
      }`}
    >
      {label}
      {shortcut && <kbd className="rounded bg-white/15 px-1 font-mono text-[10px] text-stone-300">{shortcut}</kbd>}
    </span>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-stone-200" />;
}
