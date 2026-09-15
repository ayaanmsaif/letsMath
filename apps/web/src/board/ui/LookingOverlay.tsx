import { Eye } from "lucide-react";
import { useChat } from "../../chat/store";

/** Shows the student, the moment they ask, that the tutor is looking at the board. */
export function LookingOverlay() {
  const looking = useChat((s) => s.looking);
  if (!looking) return null;

  return (
    <div className="looking-sweep absolute inset-0" aria-hidden>
      <div className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-2 rounded-full border border-violet-200 bg-white/95 px-3 py-1.5 text-xs font-medium text-violet-700 shadow-sm">
        <Eye className="size-3.5 animate-pulse" />
        Tutor is looking at your board
      </div>
    </div>
  );
}
