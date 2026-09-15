import type { InkPoint, Vec } from "../model/types";

export interface BoardPointer {
  pointerId: number;
  pointerType: "mouse" | "pen" | "touch";
  /** World position of the event. */
  world: Vec;
  /** Position relative to the board's top-left corner, in CSS pixels. */
  screen: Vec;
  /** Every coalesced sample since the last event (world x, y, pressure), oldest first. */
  samples: InkPoint[];
  /** Browser-predicted upcoming samples. Display only, never stored. */
  predicted: InkPoint[];
  shift: boolean;
  alt: boolean;
  /** Ctrl on Windows/Linux, Cmd on macOS. */
  mod: boolean;
  /** Click count, so tools can react to double-clicks. */
  detail: number;
}

export interface Tool {
  cursor: string;
  onDown(p: BoardPointer): void;
  onMove(p: BoardPointer): void;
  onUp(p: BoardPointer): void;
  /** Pointer moving with no button pressed. */
  onHover?(p: BoardPointer): void;
  /** Abandon the gesture in progress (Escape, a second finger, a tool switch). */
  onCancel(): void;
  /** Keyboard input while the tool is active; return true when handled. */
  onKey?(e: KeyboardEvent): boolean;
}
