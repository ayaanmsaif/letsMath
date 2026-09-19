import type { TurnTrigger } from "@letsmath/shared";
import {
  ArrowUp,
  ChevronDown,
  CircleCheck,
  LifeBuoy,
  Lightbulb,
  ListTree,
  PanelLeftClose,
  Pencil,
  SquarePen,
  Trash2,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { focusAnnotation } from "../board/ai/applyOps";
import { useProblems } from "../problems/store";
import { useChat, type ChatMessage } from "./store";
import { TutorMarkdown } from "./TutorMarkdown";

const debug = new URLSearchParams(window.location.search).has("debug");

const QUICK_ACTIONS: { trigger: TurnTrigger; label: string; icon: typeof CircleCheck }[] = [
  { trigger: "check", label: "Check my work", icon: CircleCheck },
  { trigger: "hint", label: "Give me a hint", icon: Lightbulb },
  { trigger: "stuck", label: "I'm stuck", icon: LifeBuoy },
];

export function ChatPanel({ onCollapse }: { onCollapse: () => void }) {
  const refreshUsage = useChat((s) => s.refreshUsage);
  useEffect(() => {
    void refreshUsage();
  }, [refreshUsage]);

  return (
    <div className="flex h-full flex-col bg-white">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-stone-200 pl-4 pr-2">
        <span className="text-[15px] font-semibold tracking-tight">letsMath</span>
        <div className="flex items-center gap-1">
          <SpendBadge />
          <Problems />
          <HeaderButton label="New problem" onClick={() => void useProblems.getState().create()}>
            <SquarePen className="size-4" />
          </HeaderButton>
          <HeaderButton label="Hide chat (Ctrl+\)" onClick={onCollapse}>
            <PanelLeftClose className="size-4" />
          </HeaderButton>
        </div>
      </header>
      {debug && <Inspector />}
      <MessageList />
      <Composer />
    </div>
  );
}

/** Every problem the student has worked on, newest first. */
function Problems() {
  const list = useProblems((s) => s.list);
  const current = useProblems((s) => s.current);
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <HeaderButton label="Problems" onClick={() => setOpen((was) => !was)}>
        <ListTree className="size-4" />
      </HeaderButton>
      {open && (
        <>
          {/* A click anywhere else puts the list away. */}
          <button type="button" aria-label="Close" className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 z-20 max-h-80 w-72 overflow-y-auto rounded-xl border border-stone-200 bg-white p-1 shadow-lg">
            {list.map((problem) => (
              <div
                key={problem.id}
                className={`group flex items-center gap-1 rounded-lg px-1 ${problem.id === current ? "bg-stone-100" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => {
                    void useProblems.getState().open(problem.id);
                    setOpen(false);
                  }}
                  className="min-w-0 flex-1 py-2 text-left"
                >
                  <span className="block truncate text-[13px] text-stone-800">{problem.title}</span>
                  <span className="block text-[11px] text-stone-400">{whenever(problem.updatedAt)}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${problem.title}`}
                  onClick={() => void useProblems.getState().remove(problem.id)}
                  className="invisible grid size-7 shrink-0 place-items-center rounded-md text-stone-400 hover:bg-stone-200 hover:text-stone-700 group-hover:visible"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** "just now", "14:32", or a date once it isn't today. */
function whenever(at: number): string {
  const when = new Date(at);
  const minutes = (Date.now() - at) / 60000;
  if (minutes < 2) return "just now";
  const today = new Date().toDateString() === when.toDateString();
  return today
    ? when.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : when.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function HeaderButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-900"
    >
      {children}
    </button>
  );
}

function SpendBadge() {
  const spend = useChat((s) => s.spend);
  const online = useChat((s) => s.serverOnline);
  if (online === false) return <span className="mr-1 text-xs text-red-600">Server offline</span>;
  if (!spend) return null;
  const ratio = spend.spentUsd / spend.budgetUsd;
  const tone = ratio >= 1 ? "bg-red-50 text-red-700" : ratio >= 0.8 ? "bg-amber-50 text-amber-700" : "bg-stone-100 text-stone-500";
  return (
    <span title="API spend so far against the testing budget" className={`mr-1 rounded-full px-2 py-0.5 font-mono text-[11px] tabular-nums ${tone}`}>
      ${spend.spentUsd.toFixed(2)} / ${spend.budgetUsd.toFixed(2)}
    </span>
  );
}

/** Dev inspector (?debug=1): exactly what the tutor was shown. */
function Inspector() {
  const look = useChat((s) => s.lastLook);
  const [open, setOpen] = useState(false);
  return (
    <div className="shrink-0 border-b border-stone-200 bg-stone-50 px-4 py-2 text-xs">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between font-medium text-stone-600">
        What the tutor saw
        <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open &&
        (look ? (
          <div className="mt-2 space-y-2 pb-1">
            <img src={look.imageUrl} alt="Board snapshot sent to the tutor" className="w-full rounded border border-stone-200 bg-white" />
            <p className="text-stone-400">
              {look.width}×{look.height} px
            </p>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded border border-stone-200 bg-white p-2 font-mono text-[11px] text-stone-700">
              {look.digest}
            </pre>
          </div>
        ) : (
          <p className="mt-2 text-stone-400">Nothing sent yet.</p>
        ))}
    </div>
  );
}

function MessageList() {
  const messages = useChat((s) => s.messages);
  const ref = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    const el = ref.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <div
      ref={ref}
      onScroll={(e) => {
        const el = e.currentTarget;
        stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
      }}
      className="min-h-0 flex-1 overflow-y-auto px-4 py-5"
    >
      {messages.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center px-4 text-center">
          <p className="text-[15px] font-medium text-stone-900">Work through a problem together</p>
          <p className="mt-1.5 text-sm leading-relaxed text-stone-500">
            Write your working on the board, then ask a question or tap a quick action. The tutor sees your board each time you send.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {messages.map((m) => (
            <MessageView key={m.id} message={m} />
          ))}
        </div>
      )}
    </div>
  );
}

function MessageView({ message }: { message: ChatMessage }) {
  if (message.role === "student") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-stone-100 px-3.5 py-2 text-[14px] text-stone-900">
          {message.text}
        </div>
      </div>
    );
  }

  return (
    <div className="text-[14px] leading-relaxed text-stone-800">
      {message.text ? <TutorMarkdown text={message.text} /> : message.status === "streaming" ? <Pending /> : null}
      {message.drawings && message.drawings.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {message.drawings.map((drawing) => (
            <button
              key={drawing.id}
              type="button"
              title="Show me on the board"
              onClick={() => focusAnnotation(drawing.id)}
              className="flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs text-violet-700 transition-colors hover:bg-violet-100"
            >
              <Pencil className="size-3" />
              {drawing.label}
            </button>
          ))}
        </div>
      )}
      {message.status === "error" && <p className="mt-1 text-[13px] text-red-600">{message.error}</p>}
      {(debug || message.mock) && <MessageMeta message={message} />}
    </div>
  );
}

function Pending() {
  const looking = useChat((s) => s.looking);
  return (
    <p className="flex items-center gap-2 text-stone-400">
      <span className="flex gap-1">
        <span className="size-1.5 animate-pulse rounded-full bg-violet-400" />
        <span className="size-1.5 animate-pulse rounded-full bg-violet-400 [animation-delay:150ms]" />
        <span className="size-1.5 animate-pulse rounded-full bg-violet-400 [animation-delay:300ms]" />
      </span>
      {looking ? "Looking at your board…" : "Thinking…"}
    </p>
  );
}

function MessageMeta({ message }: { message: ChatMessage }) {
  const u = message.usage;
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 font-mono text-[10.5px] text-stone-400">
      {message.mock && <span className="rounded bg-violet-50 px-1.5 py-px text-violet-600">mock</span>}
      {u && (
        <span>
          {u.model} · {u.inputTokens.toLocaleString()} in · {u.cacheReadTokens.toLocaleString()} cache read ·{" "}
          {u.cacheWriteTokens.toLocaleString()} cache write · {u.outputTokens.toLocaleString()} out · ${u.costUsd.toFixed(4)}
          {u.firstWordMs !== undefined && ` · ${(u.firstWordMs / 1000).toFixed(1)}s to first word`}
          {u.totalMs !== undefined && ` · ${(u.totalMs / 1000).toFixed(1)}s total`}
        </span>
      )}
    </p>
  );
}

function Composer() {
  const busy = useChat((s) => s.busy);
  const send = useChat((s) => s.send);
  const [text, setText] = useState("");
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const submit = (trigger: TurnTrigger, value: string) => {
    const trimmed = value.trim();
    if (!trimmed || busy) return;
    void send(trigger, trimmed);
    if (trigger === "message") setText("");
  };

  return (
    <div className="shrink-0 border-t border-stone-200 p-3">
      <div className="mb-2 flex flex-wrap gap-1.5">
        {QUICK_ACTIONS.map(({ trigger, label, icon: Icon }) => (
          <button
            key={trigger}
            type="button"
            disabled={busy}
            onClick={() => submit(trigger, label)}
            className="flex items-center gap-1.5 rounded-full border border-stone-200 px-2.5 py-1 text-xs text-stone-600 transition-colors hover:border-stone-300 hover:bg-stone-50 disabled:opacity-50"
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </div>
      <div className="flex items-end gap-2 rounded-2xl border border-stone-200 bg-white py-1.5 pl-3.5 pr-1.5 focus-within:border-stone-400">
        <textarea
          ref={areaRef}
          rows={1}
          value={text}
          placeholder="Ask about your work…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit("message", text);
            }
          }}
          className="max-h-40 flex-1 resize-none bg-transparent py-1.5 text-[14px] outline-none placeholder:text-stone-400"
        />
        <button
          type="button"
          aria-label="Send"
          disabled={busy || !text.trim()}
          onClick={() => submit("message", text)}
          className="grid size-8 shrink-0 place-items-center rounded-full bg-stone-900 text-white transition-colors disabled:bg-stone-200"
        >
          <ArrowUp className="size-4" />
        </button>
      </div>
    </div>
  );
}
