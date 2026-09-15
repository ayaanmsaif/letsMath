import { useEffect, useRef } from "react";
import { worldToScreen } from "../model/camera";
import { useDraft } from "../model/draft";
import { useBoard } from "../model/store";
import { commitTextDraft, measureText } from "../tools/text";
import { TEXT_FONT, TEXT_LINE_HEIGHT } from "./ShapeView";

/** Inline textarea positioned over the board while a text shape is being typed. */
export function TextEditor() {
  const text = useDraft((s) => s.text);
  const camera = useBoard((s) => s.camera);
  const ref = useRef<HTMLTextAreaElement>(null);
  const sessionKey = text ? `${text.id}:${text.x}:${text.y}` : null;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [sessionKey]);

  if (!text) return null;

  const [left, top] = worldToScreen(camera, [text.x, text.y]);
  const { w, h } = measureText(text.value || " ", text.fontSize);

  return (
    <textarea
      ref={ref}
      data-board-ui
      value={text.value}
      spellCheck={false}
      onChange={(e) => useDraft.getState().set({ text: { ...text, value: e.target.value } })}
      onBlur={commitTextDraft}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) {
          e.preventDefault();
          commitTextDraft();
        }
      }}
      className="absolute resize-none overflow-hidden border-0 bg-transparent p-0 outline-1 outline-offset-4 outline-blue-300 outline-dashed"
      style={{
        left,
        top,
        width: (w + text.fontSize) * camera.z,
        height: h * camera.z,
        fontFamily: TEXT_FONT,
        fontSize: text.fontSize * camera.z,
        lineHeight: TEXT_LINE_HEIGHT,
        color: text.color,
        whiteSpace: "pre",
      }}
    />
  );
}
