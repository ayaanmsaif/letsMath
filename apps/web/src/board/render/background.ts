import type { Background } from "../model/store";
import type { Camera } from "../model/types";

const LINE = "#e7e5e4";
const DOT = "#d6d3d1";

/** Paint the board background so it pans and zooms with the camera (no React render). */
export function applyBackground(el: HTMLElement, cam: Camera, background: Background) {
  const style = el.style;
  if (background === "blank") {
    style.backgroundImage = "none";
    return;
  }

  const base = background === "dots" ? 24 : background === "grid" ? 32 : 36;
  // Space the pattern out when zoomed far out so it never turns into noise.
  let size = base * cam.z;
  while (size < 12) size *= 2;

  style.backgroundSize = `${size}px ${size}px`;
  style.backgroundPosition = `${cam.x % size}px ${cam.y % size}px`;

  if (background === "dots") {
    style.backgroundImage = `radial-gradient(circle at 1px 1px, ${DOT} 1px, transparent 1.3px)`;
  } else if (background === "grid") {
    style.backgroundImage = `linear-gradient(${LINE} 1px, transparent 1px), linear-gradient(90deg, ${LINE} 1px, transparent 1px)`;
  } else {
    style.backgroundImage = `linear-gradient(${LINE} 1px, transparent 1px)`;
  }
}
