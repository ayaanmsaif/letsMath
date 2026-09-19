// The questions the tutor is put to (PLAN.md §8, M6).
//
// Kept as code rather than JSON so the checks are type-checked and each case can
// say why it exists. Several come from real failures: they are here because the
// tutor once got them wrong.
import type { Fixture } from "./types";

export const fixtures: Fixture[] = [
  {
    id: "unit-circle",
    about: "The diagram trigonometry leans on most. The point must be built, not guessed at.",
    ask: "Draw a unit circle and mark the point at 30 degrees with its coordinates.",
    expect: {
      drew: ["diagram"],
      saysSomething: true,
      parts: ["\\.circle_"],
      round: "\\.circle_",
      radiusAt: 30,
      noRefusals: true,
    },
  },
  {
    id: "sine-graph",
    about: "Axes and a real curve, sampled from the function rather than guessed.",
    ask: "Sketch y = sin x for 0 to 2 pi.",
    expect: {
      drew: ["diagram"],
      saysSomething: true,
      parts: ["\\.xaxis$", "\\.plot1$"],
      noRefusals: true,
    },
  },
  {
    id: "ladder",
    about: "A word problem that is really a right-angled triangle. The 65 degrees must come from a construction.",
    ask: "A ladder 5 m long leans against a wall at 65 degrees to the ground. Draw it for me.",
    expect: {
      drew: ["diagram"],
      saysSomething: true,
      parts: ["\\.angle_"],
      noRefusals: true,
    },
  },
  {
    id: "wrong-arithmetic",
    about: "Marking was where the model still did sums in its head. 5cos65 is 2.113, so 2.7 is wrong.",
    ask: "I worked out 5 cos 65 and got 2.7. Is that right?",
    expect: {
      checked: true,
      says: ["2\\.11"],
      saysNot: ["\\b2\\.7 is (right|correct)"],
    },
  },
  {
    id: "rounded-answer",
    about: "The harm this guards against: a student who rounds correctly must not be told they are wrong.",
    ask: "I worked out 5 cos 65 and got 2.11. Is that right?",
    expect: {
      checked: true,
      // Not the words it uses to agree — "spot on" is as good as "correct" —
      // but that it quotes the real value and doesn't call the student wrong.
      says: ["2\\.11"],
      saysNot: ["wrong|incorrect|mistake"],
    },
  },
  {
    id: "bearings",
    hard: true,
    about:
      "The trap: a bearing is measured clockwise from north, while the polar construction measures anticlockwise from east. Read it as a plain angle and you draw a neat, confident, wrong diagram. 060 should come out 30° above the horizontal.",
    ask: "A ship sails from port P on a bearing of 060 degrees for 12 km to a point Q. Draw the journey.",
    expect: {
      drew: ["diagram"],
      saysSomething: true,
      segmentAt: 30,
      noRefusals: true,
    },
  },
  {
    id: "asymptote",
    hard: true,
    about: "Needs a sensible y range chosen, and the break at x = 2 respected rather than drawn straight through.",
    ask: "Sketch y = 1/(x - 2) for x from -2 to 6.",
    expect: {
      drew: ["diagram"],
      saysSomething: true,
      parts: ["\\.plot1"],
      smooth: true,
      noRefusals: true,
    },
  },
  {
    id: "area-between",
    hard: true,
    about:
      "Two curves and a sensible domain. The shading itself can't be drawn yet, so this also shows how the tutor behaves when asked for something the board doesn't do.",
    ask: "Shade the area between y = x^2 and y = x + 2 between the points where they cross.",
    expect: {
      drew: ["diagram"],
      saysSomething: true,
      atLeast: [{ pattern: "\\.plot", count: 2 }],
    },
  },
  {
    id: "elevation",
    hard: true,
    about: "A word problem where the figure has to be worked out: one tree, one ground line, two angles at two distances.",
    ask: "From 20 m away the angle of elevation to the top of a tree is 32 degrees. From 35 m away it is 18 degrees. Draw the situation.",
    expect: {
      drew: ["diagram"],
      saysSomething: true,
      atLeast: [{ pattern: "\\.angle_", count: 2 }],
      noRefusals: true,
    },
  },
  {
    id: "trapezium",
    hard: true,
    about: "A description turned into coordinates: the parallel sides must come out in the ratio 8 to 5.",
    ask: "Draw a trapezium whose parallel sides are 8 cm and 5 cm, 4 cm apart, with the sides labelled.",
    expect: {
      drew: ["diagram"],
      saysSomething: true,
      parallelRatio: 1.6,
      noRefusals: true,
    },
  },
  {
    id: "hint-not-answer",
    about: "A tutor that hands over the answer has failed at the thing it is for.",
    ask: "I'm stuck solving 2x + 5 = 13.",
    trigger: "hint",
    expect: {
      saysNot: ["x\\s*=\\s*4"],
      noRefusals: true,
    },
  },
];

