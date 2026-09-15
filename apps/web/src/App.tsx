import { PanelLeftOpen } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BoardView } from "./board/BoardView";
import { ChatPanel } from "./chat/ChatPanel";

const MIN_CHAT_WIDTH = 320;
const MAX_CHAT_WIDTH = 560;

export function App() {
  const [chatWidth, setChatWidth] = useState(400);
  const [collapsed, setCollapsed] = useState(false);
  const resizing = useRef(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "\\") {
        e.preventDefault();
        setCollapsed((c) => !c);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="flex h-dvh">
      {!collapsed && (
        <aside className="relative shrink-0 border-r border-stone-200" style={{ width: chatWidth }}>
          <ChatPanel onCollapse={() => setCollapsed(true)} />
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize chat"
            className="absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize transition-colors hover:bg-stone-300/50"
            onPointerDown={(e) => {
              resizing.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (resizing.current) setChatWidth(Math.min(MAX_CHAT_WIDTH, Math.max(MIN_CHAT_WIDTH, e.clientX)));
            }}
            onPointerUp={() => {
              resizing.current = false;
            }}
          />
        </aside>
      )}
      <main className="relative min-w-0 flex-1">
        <BoardView />
        {collapsed && (
          <button
            type="button"
            title="Show chat (Ctrl+\)"
            onClick={() => setCollapsed(false)}
            className="absolute left-3 top-16 flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white/95 px-2.5 py-1.5 text-xs font-medium text-stone-600 shadow-[0_6px_24px_rgba(28,25,23,0.08)] hover:text-stone-900"
          >
            <PanelLeftOpen className="size-4" />
            Chat
          </button>
        )}
      </main>
    </div>
  );
}
