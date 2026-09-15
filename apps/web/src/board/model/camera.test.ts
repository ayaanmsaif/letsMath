import { describe, expect, it } from "vitest";
import { fitBox, MAX_ZOOM, screenToWorld, viewportBox, worldToScreen, zoomAt } from "./camera";

describe("camera", () => {
  const cam = { x: 120, y: -40, z: 1.5 };

  it("round-trips screen and world coordinates", () => {
    const [x, y] = worldToScreen(cam, screenToWorld(cam, [300, 200]));
    expect(x).toBeCloseTo(300);
    expect(y).toBeCloseTo(200);
  });

  it("keeps the point under the cursor fixed while zooming", () => {
    const before = screenToWorld(cam, [400, 300]);
    const after = screenToWorld(zoomAt(cam, [400, 300], 3), [400, 300]);
    expect(after[0]).toBeCloseTo(before[0]);
    expect(after[1]).toBeCloseTo(before[1]);
  });

  it("clamps zoom", () => {
    expect(zoomAt(cam, [0, 0], 100).z).toBe(MAX_ZOOM);
  });

  it("fits and centres a box without zooming past 100%", () => {
    const box = { minX: 0, minY: 0, maxX: 100, maxY: 50 };
    const fitted = fitBox(box, 1000, 800);
    expect(fitted.z).toBe(1);
    const visible = viewportBox(fitted, 1000, 800);
    expect((visible.minX + visible.maxX) / 2).toBeCloseTo(50);
    expect((visible.minY + visible.maxY) / 2).toBeCloseTo(25);
  });
});
