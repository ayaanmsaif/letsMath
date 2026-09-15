import { useEffect, useReducer } from "react";
import { useDraft } from "../model/draft";
import { shapeBounds, unionBoxes } from "../model/geometry";
import { useBoard } from "../model/store";
import { ERASER_RADIUS_PX } from "../tools/eraser";
import { HANDLES, handlePosition } from "../tools/selection";

const SELECT = "#3b82f6";
const LASER_FADE_MS = 700;

/** Selection box and handles, marquee, eraser cursor, and laser trail. Sized in screen pixels. */
export function Overlay() {
  const z = useBoard((s) => s.camera.z);
  const tool = useBoard((s) => s.tool);
  const shapes = useBoard((s) => s.shapes);
  const selection = useBoard((s) => s.selection);
  const marquee = useDraft((s) => s.marquee);
  const eraser = useDraft((s) => s.eraser);
  const px = 1 / z;

  const box =
    tool === "select" && selection.length > 0
      ? unionBoxes(
          selection
            .map((id) => shapes[id])
            .filter(Boolean)
            .map(shapeBounds),
        )
      : null;

  return (
    <g pointerEvents="none">
      {box && (
        <>
          <rect
            x={box.minX - 4 * px}
            y={box.minY - 4 * px}
            width={box.maxX - box.minX + 8 * px}
            height={box.maxY - box.minY + 8 * px}
            fill="none"
            stroke={SELECT}
            strokeWidth={1.25 * px}
          />
          {HANDLES.map((h) => {
            const [x, y] = handlePosition(box, h);
            const dx = h[1] === "w" ? -4 * px : 4 * px;
            const dy = h[0] === "n" ? -4 * px : 4 * px;
            return (
              <rect
                key={h}
                x={x + dx - 5 * px}
                y={y + dy - 5 * px}
                width={10 * px}
                height={10 * px}
                rx={2 * px}
                fill="white"
                stroke={SELECT}
                strokeWidth={1.25 * px}
              />
            );
          })}
        </>
      )}

      {marquee && (
        <rect
          x={marquee.minX}
          y={marquee.minY}
          width={marquee.maxX - marquee.minX}
          height={marquee.maxY - marquee.minY}
          fill={SELECT}
          fillOpacity={0.08}
          stroke={SELECT}
          strokeWidth={px}
        />
      )}

      {tool === "eraser" && eraser && (
        <circle
          cx={eraser[0]}
          cy={eraser[1]}
          r={ERASER_RADIUS_PX * px}
          fill="white"
          fillOpacity={0.5}
          stroke="#a8a29e"
          strokeWidth={1.25 * px}
        />
      )}

      <LaserTrail px={px} />
    </g>
  );
}

function LaserTrail({ px }: { px: number }) {
  const laser = useDraft((s) => s.laser);
  const [, tick] = useReducer((n: number) => n + 1, 0);

  // While a trail exists, re-render every frame so it fades, and drop expired points.
  useEffect(() => {
    if (laser.length === 0) return;
    const frame = requestAnimationFrame(() => {
      const now = performance.now();
      const alive = laser.filter((p) => now - p[2] < LASER_FADE_MS);
      if (alive.length !== laser.length) useDraft.getState().set({ laser: alive });
      else tick();
    });
    return () => cancelAnimationFrame(frame);
  });

  if (laser.length === 0) return null;
  const now = performance.now();
  return (
    <g stroke="#ef4444" strokeLinecap="round" strokeWidth={5 * px}>
      {laser.slice(1).map((p, i) => {
        const prev = laser[i];
        const opacity = Math.max(0, 1 - (now - p[2]) / LASER_FADE_MS);
        return <line key={i} x1={prev[0]} y1={prev[1]} x2={p[0]} y2={p[1]} opacity={opacity} />;
      })}
    </g>
  );
}
