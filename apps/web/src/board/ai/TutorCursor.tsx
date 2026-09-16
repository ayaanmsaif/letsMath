import { motion } from "motion/react";
import { worldToScreen } from "../model/camera";
import { useDraft } from "../model/draft";
import { useBoard } from "../model/store";

/**
 * A small pen that glides to each mark as the tutor draws it, so the student
 * can see where the attention is going rather than marks appearing from nowhere.
 */
export function TutorCursor() {
  const at = useDraft((s) => s.tutorCursor);
  const camera = useBoard((s) => s.camera);
  if (!at) return null;

  const [x, y] = worldToScreen(camera, at);

  return (
    <motion.div
      className="pointer-events-none absolute z-10 flex items-center gap-1.5"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1, left: x, top: y }}
      exit={{ opacity: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 26, opacity: { duration: 0.15 } }}
      aria-hidden
    >
      <span className="size-2.5 rounded-full bg-violet-600 shadow-[0_0_0_3px_rgb(124_58_237_/_0.2)]" />
      <span className="rounded-full bg-violet-600 px-1.5 py-0.5 text-[10px] font-medium text-white">Tutor</span>
    </motion.div>
  );
}
