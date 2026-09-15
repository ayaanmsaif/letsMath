import { useEffect, useState } from "react";
import { viewportBox } from "../board/model/camera";
import { addPatch } from "../board/model/history";
import { useBoard } from "../board/model/store";
import type { InkPoint, InkShape } from "../board/model/types";
import { viewport } from "../board/render/viewport";

/** Frame-time meter and stress test, shown with ?debug=1 (plan §6b). */
export function PerfMeter() {
  const [stats, setStats] = useState({ fps: 0, worst: 0 });
  const shapeCount = useBoard((s) => Object.keys(s.shapes).length);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let windowStart = last;
    let frames = 0;
    let worst = 0;
    const loop = (t: number) => {
      worst = Math.max(worst, t - last);
      last = t;
      frames++;
      if (t - windowStart >= 1000) {
        setStats({ fps: Math.round((frames * 1000) / (t - windowStart)), worst: Math.round(worst) });
        frames = 0;
        worst = 0;
        windowStart = t;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="pointer-events-auto absolute bottom-20 left-3 space-y-1.5 rounded-xl bg-stone-900/90 px-3 py-2 font-mono text-[11px] text-stone-100 shadow-lg">
      <div>
        <span className={stats.worst > 20 ? "text-amber-300" : "text-emerald-300"}>{stats.fps} fps</span> · worst{" "}
        {stats.worst}ms
      </div>
      <div className="text-stone-400">{shapeCount.toLocaleString()} shapes</div>
      <button
        type="button"
        onClick={() => addStressStrokes(2000)}
        className="rounded-md bg-white/10 px-2 py-1 hover:bg-white/20"
      >
        + 2,000 strokes
      </button>
    </div>
  );
}

/** Fill the visible board with handwriting-like squiggles, as one undoable step. */
function addStressStrokes(count: number) {
  const board = useBoard.getState();
  const view = viewportBox(board.camera, viewport.width, viewport.height);
  const cell = 28;
  const cols = Math.max(1, Math.floor((view.maxX - view.minX - 80) / cell));

  const strokes: InkShape[] = Array.from({ length: count }, (_, i) => {
    const ox = view.minX + 40 + (i % cols) * cell;
    const oy = view.minY + 60 + Math.floor(i / cols) * cell;
    const n = 20 + Math.floor(Math.random() * 30);
    let angle = Math.random() * Math.PI * 2;
    let [x, y] = [ox + Math.random() * 10, oy + Math.random() * 10];
    const points: InkPoint[] = Array.from({ length: n }, () => {
      angle += (Math.random() - 0.5) * 1.2;
      x += Math.cos(angle) * 1.5;
      y += Math.sin(angle) * 1.5;
      return [x, y, 0.5];
    });
    return {
      id: `s${board.nextNum + i}`,
      num: board.nextNum + i,
      z: board.nextZ + i,
      createdAt: Date.now(),
      type: "ink",
      tool: "pen",
      author: "student",
      color: board.inkColor,
      size: "s",
      simulatePressure: true,
      points,
    };
  });

  useBoard.setState({ nextNum: board.nextNum + count, nextZ: board.nextZ + count });
  board.commit(addPatch(strokes), "stress test");
}
