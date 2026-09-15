import type { ReactNode } from "react";
import { Tooltip } from "./Toolbar";

export const MOD_KEY = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";

export function IconButton({
  label,
  shortcut,
  side = "top",
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  side?: "top" | "bottom";
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`group relative grid size-8 place-items-center rounded-lg transition-colors disabled:text-stone-300 disabled:hover:bg-transparent ${
        active ? "bg-stone-100 text-stone-900" : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
      }`}
    >
      {children}
      <Tooltip label={label} shortcut={shortcut} side={side} />
    </button>
  );
}

export const panelClass =
  "pointer-events-auto flex items-center gap-0.5 rounded-xl border border-stone-200 bg-white/95 p-1 shadow-[0_6px_24px_rgba(28,25,23,0.08)] backdrop-blur";
