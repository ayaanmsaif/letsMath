import { describe, expect, it } from "vitest";
import { routeEffort } from "./routing";

const turn = (text: string, trigger = "message") => routeEffort({ trigger, text } as never);

describe("choosing how hard to think", () => {
  it("keeps plain drawing requests cheap", () => {
    expect(turn("Draw a unit circle and mark the point at 30 degrees.")).toBe("low");
    expect(turn("Sketch y = sin x for 0 to 2 pi.")).toBe("low");
    expect(turn("Draw a trapezium with parallel sides 8 cm and 5 cm, 4 cm apart.")).toBe("low");
  });

  it("thinks harder when asked for help", () => {
    expect(turn("", "hint")).toBe("medium");
    expect(turn("", "stuck")).toBe("medium");
    expect(turn("", "check")).toBe("medium");
  });

  it("thinks harder when the figure has to be worked out", () => {
    // Measured: read as a plain angle, this is drawn 30 degrees out.
    expect(turn("A ship sails on a bearing of 060 degrees for 12 km. Draw it.")).toBe("medium");
    expect(turn("The angle of elevation to the top of a tree is 32 degrees.")).toBe("medium");
  });

  it("thinks harder when the student wants to understand, not to see", () => {
    expect(turn("Why does sin 30 equal a half?")).toBe("medium");
    expect(turn("Explain how to rearrange this.")).toBe("medium");
    expect(turn("I don't understand what I did wrong here.")).toBe("medium");
  });

  it("thinks harder when marking a student's work", () => {
    // Telling a student their work is wrong is where care matters most.
    expect(turn("I worked out 5 cos 65 and got 2.7. Is that right?")).toBe("medium");
    expect(turn("Did I get this one correct?")).toBe("medium");
  });

  it("treats a long question as a word problem", () => {
    const wordy =
      "A cyclist rides north for 4 km, then turns and rides east for another 7 km before stopping " +
      "for lunch, and I need to know how far they are from where they started.";
    expect(wordy.length).toBeGreaterThan(160);
    expect(turn(wordy)).toBe("medium");
  });
});
