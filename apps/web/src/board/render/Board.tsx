import { useEffect, useRef, useState, type ReactNode } from "react";
import { isTypingTarget } from "../input/shortcuts";
import { panBy, screenToWorld, zoomAt } from "../model/camera";
import { useDraft } from "../model/draft";
import { useBoard } from "../model/store";
import type { Camera, InkPoint, Vec } from "../model/types";
import { getTool } from "../tools/registry";
import { commitTextDraft } from "../tools/text";
import type { BoardPointer } from "../tools/types";
import { applyBackground } from "./background";
import { DraftLayer, ShapesLayer } from "./layers";
import { Overlay } from "./Overlay";
import { TextEditor } from "./TextEditor";
import { viewport } from "./viewport";

type Gesture =
  | { kind: "tool"; pointerId: number }
  | { kind: "pan"; pointerId: number; start: Vec; camera: Camera }
  | { kind: "pinch"; ids: [number, number]; startDist: number; startMid: Vec; camera: Camera };

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function Board({ children }: { children?: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<SVGGElement>(null);
  const tool = useBoard((s) => s.tool);
  const toolCursor = useDraft((s) => s.cursor);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const spaceRef = useRef(false);

  // Camera and background are applied straight to the DOM so panning never re-renders React.
  useEffect(() => {
    const apply = (camera: Camera) => {
      worldRef.current?.setAttribute("transform", `translate(${camera.x} ${camera.y}) scale(${camera.z})`);
      applyBackground(containerRef.current!, camera, useBoard.getState().background);
    };
    apply(useBoard.getState().camera);
    return useBoard.subscribe((state, prev) => {
      if (state.camera !== prev.camera || state.background !== prev.background) apply(state.camera);
    });
  }, []);

  useEffect(() => {
    const el = containerRef.current!;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      Object.assign(viewport, { left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("scroll", measure, true);

    const pointers = new Map<number, { type: string; screen: Vec }>();
    let penSeen = false;
    let gesture: Gesture | null = null;

    const screenOf = (e: { clientX: number; clientY: number }): Vec => [
      e.clientX - viewport.left,
      e.clientY - viewport.top,
    ];

    /**
     * How many times this spot has just been clicked.
     *
     * A pointer event's own `detail` is always 0, unlike a mouse event's, and the
     * mouse events that would carry a click count never arrive, because
     * pointerdown's default action is prevented. So repeats are counted here:
     * same place, quick succession.
     */
    let lastClick = { at: 0, x: 0, y: 0, count: 0 };
    const countClick = (e: PointerEvent) => {
      const repeat =
        e.timeStamp - lastClick.at < 400 &&
        Math.abs(e.clientX - lastClick.x) <= 6 &&
        Math.abs(e.clientY - lastClick.y) <= 6;
      lastClick = { at: e.timeStamp, x: e.clientX, y: e.clientY, count: repeat ? lastClick.count + 1 : 1 };
      return lastClick.count;
    };

    const toBoardPointer = (e: PointerEvent, detail = 0): BoardPointer => {
      const camera = useBoard.getState().camera;
      const sample = (ev: PointerEvent): InkPoint => {
        const [x, y] = screenToWorld(camera, screenOf(ev));
        return [x, y, ev.pointerType === "pen" ? ev.pressure : 0.5];
      };
      const coalesced = e.getCoalescedEvents?.() ?? [];
      const screen = screenOf(e);
      return {
        pointerId: e.pointerId,
        pointerType: e.pointerType as BoardPointer["pointerType"],
        world: screenToWorld(camera, screen),
        screen,
        samples: (coalesced.length > 0 ? coalesced : [e]).map(sample),
        predicted: (e.getPredictedEvents?.() ?? []).map(sample),
        shift: e.shiftKey,
        alt: e.altKey,
        mod: isMac ? e.metaKey : e.ctrlKey,
        detail,
      };
    };

    const cancelTool = () => {
      if (gesture?.kind === "tool") getTool(useBoard.getState().tool).onCancel();
    };

    const startPinch = () => {
      const touches = [...pointers.entries()].filter(([, p]) => p.type === "touch").slice(0, 2);
      const [[idA, a], [idB, b]] = touches;
      gesture = {
        kind: "pinch",
        ids: [idA, idB],
        startDist: Math.hypot(a.screen[0] - b.screen[0], a.screen[1] - b.screen[1]),
        startMid: [(a.screen[0] + b.screen[0]) / 2, (a.screen[1] + b.screen[1]) / 2],
        camera: useBoard.getState().camera,
      };
    };

    // Board UI such as the text editor sits inside the board but must not start tool gestures.
    const onBoardUi = (e: Event) => e.target instanceof Element && e.target.closest("[data-board-ui]") !== null;

    const onDown = (e: PointerEvent) => {
      if (onBoardUi(e)) return;
      if (e.pointerType === "mouse" && e.button !== 0 && e.button !== 1) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { type: e.pointerType, screen: screenOf(e) });
      if (e.pointerType === "pen") penSeen = true;

      if (e.pointerType === "touch") {
        const touchCount = [...pointers.values()].filter((p) => p.type === "touch").length;
        if (touchCount >= 2) {
          cancelTool();
          return startPinch();
        }
        // Palm rejection: once a pen has been used, fingers only pan and zoom.
        if (penSeen || gesture) {
          gesture = { kind: "pan", pointerId: e.pointerId, start: screenOf(e), camera: useBoard.getState().camera };
          return;
        }
      }

      if (gesture) return;

      if (e.button === 1 || spaceRef.current) {
        gesture = { kind: "pan", pointerId: e.pointerId, start: screenOf(e), camera: useBoard.getState().camera };
        return;
      }

      const toolId = useBoard.getState().tool;
      if (toolId !== "text") commitTextDraft();
      gesture = { kind: "tool", pointerId: e.pointerId };
      getTool(toolId).onDown(toBoardPointer(e, countClick(e)));
    };

    const onMove = (e: PointerEvent) => {
      const tracked = pointers.get(e.pointerId);
      if (tracked) tracked.screen = screenOf(e);

      if (!gesture) {
        if (e.pointerType !== "touch") getTool(useBoard.getState().tool).onHover?.(toBoardPointer(e));
        return;
      }

      const board = useBoard.getState();
      if (gesture.kind === "tool" && gesture.pointerId === e.pointerId) {
        getTool(board.tool).onMove(toBoardPointer(e));
      } else if (gesture.kind === "pan" && gesture.pointerId === e.pointerId) {
        const [x, y] = screenOf(e);
        board.setCamera(panBy(gesture.camera, x - gesture.start[0], y - gesture.start[1]));
      } else if (gesture.kind === "pinch") {
        const a = pointers.get(gesture.ids[0]);
        const b = pointers.get(gesture.ids[1]);
        if (!a || !b) return;
        const distNow = Math.hypot(a.screen[0] - b.screen[0], a.screen[1] - b.screen[1]);
        const mid: Vec = [(a.screen[0] + b.screen[0]) / 2, (a.screen[1] + b.screen[1]) / 2];
        const zoomed = zoomAt(gesture.camera, gesture.startMid, (gesture.camera.z * distNow) / gesture.startDist);
        board.setCamera(panBy(zoomed, mid[0] - gesture.startMid[0], mid[1] - gesture.startMid[1]));
      }
    };

    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (!gesture) return;
      if (gesture.kind === "tool" && gesture.pointerId === e.pointerId) {
        getTool(useBoard.getState().tool).onUp(toBoardPointer(e));
        gesture = null;
      } else if (gesture.kind === "pan" && gesture.pointerId === e.pointerId) {
        gesture = null;
      } else if (gesture.kind === "pinch" && gesture.ids.includes(e.pointerId)) {
        gesture = null;
      }
    };

    const onCancel = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      cancelTool();
      gesture = null;
    };

    const onWheel = (e: WheelEvent) => {
      if (onBoardUi(e)) return;
      e.preventDefault();
      const board = useBoard.getState();
      const unit = e.deltaMode === 1 ? 16 : 1;
      if (e.ctrlKey || e.metaKey) {
        // Trackpad pinch arrives as ctrl+wheel with small deltas. Clamp so one mouse-wheel notch zooms gently.
        const delta = Math.max(-30, Math.min(30, e.deltaY * unit));
        board.setCamera(zoomAt(board.camera, screenOf(e), board.camera.z * Math.exp(-delta * 0.01)));
      } else {
        board.setCamera(panBy(board.camera, -e.deltaX * unit, -e.deltaY * unit));
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isTypingTarget(e.target) && !e.repeat) {
        spaceRef.current = true;
        setSpaceHeld(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceRef.current = false;
        setSpaceHeld(false);
      }
    };
    const onToolChange = useBoard.subscribe((state, prev) => {
      if (state.tool !== prev.tool) {
        getTool(prev.tool).onCancel();
        useDraft.getState().set({ cursor: null, eraser: null });
      }
    });

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onCancel);
    el.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", measure, true);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onCancel);
      el.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      onToolChange();
    };
  }, []);

  const cursor = spaceHeld ? "grab" : (toolCursor ?? getTool(tool).cursor);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div
        ref={containerRef}
        className="absolute inset-0 touch-none bg-board select-none"
        style={{ cursor }}
      >
        <svg className="absolute inset-0 h-full w-full">
          <g ref={worldRef}>
            {/* The snapshot for the tutor is rendered from this layer only. */}
            <g data-layer="shapes">
              <ShapesLayer />
            </g>
            <DraftLayer />
            <Overlay />
          </g>
        </svg>
        <TextEditor />
      </div>
      {/* Chrome sits outside the input surface, so clicks on it never reach the tools. */}
      <div className="pointer-events-none absolute inset-0">{children}</div>
    </div>
  );
}
