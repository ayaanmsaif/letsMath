import { memo } from "react";
import { HIGHLIGHTER_OPACITY, lineWidth } from "../model/style";
import { useBoard } from "../model/store";
import type { LineShape, Shape } from "../model/types";
import { inkPath } from "./ink";

export const TEXT_LINE_HEIGHT = 1.3;
export const TEXT_FONT = '"Geist Variable", ui-sans-serif, system-ui, sans-serif';

function arrowHead(shape: LineShape, width: number): string {
  const [ax, ay] = shape.a;
  const [bx, by] = shape.b;
  const angle = Math.atan2(by - ay, bx - ax);
  const len = Math.max(10, width * 4.5);
  const spread = Math.PI / 7;
  const p1 = [bx - len * Math.cos(angle - spread), by - len * Math.sin(angle - spread)];
  const p2 = [bx - len * Math.cos(angle + spread), by - len * Math.sin(angle + spread)];
  return `M${p1[0]},${p1[1]} L${bx},${by} L${p2[0]},${p2[1]}`;
}

export const ShapeView = memo(function ShapeView({ shape, dimmed = false }: { shape: Shape; dimmed?: boolean }) {
  // An image's bytes live in the board's image table, not in the shape.
  const src = useBoard((state) => (shape.type === "image" ? state.images[shape.imageId] : undefined));
  const opacity = dimmed ? 0.2 : shape.opacity;
  const stroke = {
    stroke: shape.color,
    strokeWidth: shape.strokeWidth ?? lineWidth(shape.size),
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none",
    opacity,
  };

  switch (shape.type) {
    case "ink":
      return (
        <path
          d={inkPath(shape)}
          fill={shape.color}
          opacity={shape.tool === "highlighter" ? (dimmed ? 0.1 : HIGHLIGHTER_OPACITY) : opacity}
        />
      );
    case "line":
      return (
        <g {...stroke}>
          <line x1={shape.a[0]} y1={shape.a[1]} x2={shape.b[0]} y2={shape.b[1]} />
          {shape.arrow && <path d={arrowHead(shape, lineWidth(shape.size))} />}
        </g>
      );
    case "rect":
      return <rect x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={2} {...stroke} />;
    case "ellipse":
      return (
        <ellipse cx={shape.x + shape.w / 2} cy={shape.y + shape.h / 2} rx={shape.w / 2} ry={shape.h / 2} {...stroke} />
      );
    case "polygon": {
      const points = shape.points.map((p) => p.join(",")).join(" ");
      // pathLength lets the draw-on animation treat any length as 0→1.
      return shape.closed ? (
        <polygon points={points} pathLength={1} {...stroke} />
      ) : (
        <polyline points={points} pathLength={1} {...stroke} />
      );
    }
    case "text":
      return (
        <text
          x={shape.x}
          y={shape.y}
          fontSize={shape.fontSize}
          fontFamily={TEXT_FONT}
          fill={shape.color}
          opacity={opacity}
          style={{ whiteSpace: "pre" }}
        >
          {shape.text.split("\n").map((line, i) => (
            // First baseline sits about one font size below the top edge.
            <tspan key={i} x={shape.x} y={shape.y + shape.fontSize * (0.95 + i * TEXT_LINE_HEIGHT)}>
              {line || " "}
            </tspan>
          ))}
        </text>
      );
    case "image":
      // A data URL, so a serialised snapshot carries the picture with it.
      return src ? <image href={src} x={shape.x} y={shape.y} width={shape.w} height={shape.h} opacity={opacity} /> : null;
    case "equation":
      return (
        <svg
          x={shape.x}
          y={shape.y}
          width={shape.w}
          height={shape.h}
          viewBox={shape.viewBox}
          color={shape.color}
          opacity={opacity}
          overflow="visible"
          dangerouslySetInnerHTML={{ __html: shape.svg }}
        />
      );
  }
});
