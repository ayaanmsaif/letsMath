import { describe, expect, it } from "vitest";
import { describeDrawings } from "./summary";

describe("describeDrawings", () => {
  it("describes a single drawing", () => {
    expect(describeDrawings(["circle"])).toBe("Done — circled it.");
  });

  it("joins several kinds readably and doesn't repeat itself", () => {
    expect(describeDrawings(["circle", "mark"])).toBe("Done — circled it and marked it.");
    expect(describeDrawings(["circle", "circle"])).toBe("Done — circled it.");
    expect(describeDrawings(["circle", "mark", "write"])).toBe("Done — circled it, marked it and written it on the board.");
  });

  it("says nothing when nothing was drawn", () => {
    expect(describeDrawings([])).toBe("");
  });
});
