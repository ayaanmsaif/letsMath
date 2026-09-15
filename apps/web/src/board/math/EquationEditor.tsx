import type { MathfieldElement } from "mathlive";
import { useEffect, useRef, useState } from "react";
import { worldToScreen } from "../model/camera";
import { useDraft } from "../model/draft";
import { addPatch, removePatch, updatePatch } from "../model/history";
import { useBoard } from "../model/store";
import { FONT_SIZE } from "../model/style";
import type { EquationShape } from "../model/types";
import { viewport } from "../render/viewport";

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "math-field": React.DetailedHTMLProps<React.HTMLAttributes<MathfieldElement>, MathfieldElement>;
    }
  }
}

let mathliveReady: Promise<void> | null = null;

/** Load MathLive once, with its fonts bundled by Vite rather than fetched by MathLive. */
function loadMathLive(): Promise<void> {
  mathliveReady ??= Promise.all([import("mathlive"), import("mathlive/fonts.css")]).then(([{ MathfieldElement }]) => {
    MathfieldElement.fontsDirectory = null;
    MathfieldElement.soundsDirectory = null;
  });
  return mathliveReady;
}

const EDITOR_WIDTH = 360;

/** Popover for typing an equation; inserts it as MathJax SVG. */
export function EquationEditor() {
  const draft = useDraft((s) => s.equation);
  const camera = useBoard((s) => s.camera);
  const fieldRef = useRef<MathfieldElement>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = draft !== null;
  useEffect(() => {
    if (!open) return;
    setError(null);
    loadMathLive().then(() => setReady(true));
  }, [open]);

  useEffect(() => {
    const field = fieldRef.current;
    if (!ready || !field || !draft) return;
    field.value = draft.latex;
    requestAnimationFrame(() => field.focus());
    // Only when a new editing session starts, not on every draft change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, draft?.id, draft?.x, draft?.y]);

  if (!draft) return null;

  const close = () => useDraft.getState().set({ equation: null });

  const insert = async () => {
    const latex = fieldRef.current?.value.trim() ?? "";
    const board = useBoard.getState();
    const existing = draft.id ? board.shapes[draft.id] : undefined;

    if (!latex) {
      if (existing) board.commit(removePatch([existing]), "delete equation");
      return close();
    }

    setBusy(true);
    try {
      const { texToSvg } = await import("./mathjax");
      const rendered = await texToSvg(latex);
      const size = existing?.size ?? board.size;
      const fontSize = FONT_SIZE[size] * 1.15;
      const geometry = {
        latex,
        svg: rendered.svg,
        viewBox: rendered.viewBox,
        w: rendered.width * fontSize,
        h: rendered.height * fontSize,
      };
      if (existing?.type === "equation") {
        board.commit(updatePatch([[existing, { ...existing, ...geometry }]]), "edit equation");
      } else {
        const shape: EquationShape = {
          ...board.allocate(),
          type: "equation",
          author: "student",
          color: board.inkColor,
          size,
          x: draft.x,
          y: draft.y,
          ...geometry,
        };
        board.commit(addPatch([shape]), "equation");
      }
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't render that equation.");
    } finally {
      setBusy(false);
    }
  };

  const [sx, sy] = worldToScreen(camera, [draft.x, draft.y]);
  const left = Math.min(Math.max(12, sx), viewport.width - EDITOR_WIDTH - 12);
  const top = Math.min(Math.max(64, sy), viewport.height - 220);

  return (
    <div
      className="pointer-events-auto absolute rounded-2xl border border-stone-200 bg-white p-3 shadow-[0_10px_40px_rgba(28,25,23,0.12)]"
      style={{ left, top, width: EDITOR_WIDTH }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          void insert();
        } else if (e.key === "Escape") {
          e.preventDefault();
          close();
        }
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-stone-500">Equation</span>
        <span className="text-[11px] text-stone-400">Type maths or LaTeX</span>
      </div>
      <div className="min-h-12 rounded-xl border border-stone-200 px-2 py-1.5 focus-within:border-stone-400">
        {ready ? (
          <math-field ref={fieldRef} className="block w-full text-xl outline-none" />
        ) : (
          <div className="py-2 text-sm text-stone-400">Loading…</div>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-mistake">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={close} className="rounded-lg px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100">
          Cancel
        </button>
        <button
          type="button"
          disabled={!ready || busy}
          onClick={() => void insert()}
          className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
        >
          {busy ? "Inserting…" : draft.id ? "Update" : "Insert"}
        </button>
      </div>
    </div>
  );
}
