import { useDraft } from "../model/draft";
import { sortedShapes, useBoard } from "../model/store";
import { HIGHLIGHTER_OPACITY } from "../model/style";
import type { Shape } from "../model/types";
import { inkPathFor } from "./ink";
import { ShapeView } from "./ShapeView";

/** Marks within one annotation draw in sequence rather than all at once. */
function drawDelay(shape: Shape): string | undefined {
  const part = /#(\d+)$/.exec(shape.id);
  const index = part ? Number(part[1]) - 1 : 0;
  return index > 0 ? `${index * 120}ms` : undefined;
}

/** Finished shapes. Highlighters draw underneath everything else with a multiply blend. */
export function ShapesLayer() {
  const shapes = useBoard((s) => s.shapes);
  const erasing = useBoard((s) => s.erasing);
  const tutorVisible = useBoard((s) => s.tutorVisible);
  const editingTextId = useDraft((s) => s.text?.id ?? null);
  const pulsing = useDraft((s) => s.pulsing);

  const sorted = sortedShapes(shapes);
  const student = sorted.filter((s) => s.author === "student");
  const tutor = tutorVisible ? sorted.filter((s) => s.author === "tutor") : [];
  const highlights = student.filter((s) => s.type === "ink" && s.tool === "highlighter");
  const rest = student.filter((s) => !(s.type === "ink" && s.tool === "highlighter"));

  return (
    <>
      <g style={{ mixBlendMode: "multiply" }}>
        {highlights.map((s) => (
          <ShapeView key={s.id} shape={s} dimmed={Boolean(erasing[s.id])} />
        ))}
      </g>
      <g>
        {rest.map((s) =>
          s.id === editingTextId ? null : <ShapeView key={s.id} shape={s} dimmed={Boolean(erasing[s.id])} />,
        )}
      </g>
      {/* The tutor's annotations, each drawing itself on as it arrives. */}
      <g>
        {tutor.map((s) => (
          <g
            key={s.id}
            className={`tutor-draw-on${pulsing.includes(s.id) ? " tutor-pulse" : ""}`}
            style={{ animationDelay: drawDelay(s) }}
          >
            <ShapeView shape={s} dimmed={Boolean(erasing[s.id])} />
          </g>
        ))}
      </g>
    </>
  );
}

/** The stroke or shape being drawn right now. */
export function DraftLayer() {
  const ink = useDraft((s) => s.ink);
  const shape = useDraft((s) => s.shape);

  return (
    <>
      {ink &&
        (ink.tool === "highlighter" ? (
          <g style={{ mixBlendMode: "multiply" }}>
            <path
              d={inkPathFor(ink.points, ink.tool, ink.size, ink.simulatePressure, false)}
              fill={ink.color}
              opacity={HIGHLIGHTER_OPACITY}
            />
          </g>
        ) : (
          <path
            // Predicted samples extend the live stroke toward the pen tip; they're never stored.
            d={inkPathFor([...ink.points, ...ink.predicted], ink.tool, ink.size, ink.simulatePressure, false)}
            fill={ink.color}
          />
        ))}
      {shape && <ShapeView shape={shape} />}
    </>
  );
}
