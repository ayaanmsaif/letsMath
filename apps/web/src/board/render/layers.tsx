import { useDraft } from "../model/draft";
import { sortedShapes, useBoard } from "../model/store";
import { HIGHLIGHTER_OPACITY } from "../model/style";
import { inkPathFor } from "./ink";
import { ShapeView } from "./ShapeView";

/** Finished shapes. Highlighters draw underneath everything else with a multiply blend. */
export function ShapesLayer() {
  const shapes = useBoard((s) => s.shapes);
  const erasing = useBoard((s) => s.erasing);
  const editingTextId = useDraft((s) => s.text?.id ?? null);

  const sorted = sortedShapes(shapes);
  const highlights = sorted.filter((s) => s.type === "ink" && s.tool === "highlighter");
  const rest = sorted.filter((s) => !(s.type === "ink" && s.tool === "highlighter"));

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
