import { bm, doc, filler } from "./build";

const H1 = 14;
const H2 = 12;

export const problemSheet = doc([
  [
    { t: "Practice Problem Set 1", h: H1, x: 200 },
    "Topics: Conics, Composition of Functions, Symmetry, Inverses",
    "1.|Identify and sketch the following conic sections:",
    { t: "(a) y = x2 + 2x + 2", x: 90 },
    { t: "(b) 9x2 + 4y2 - 18x + 8y = 23", x: 90 },
    { t: "(c) x2 - 2y2 = 4", x: 90 },
    { t: "Answer: (a) parabola, vertex (-1, 1)", x: 90 },
    { t: "(b) ellipse, centre (1, -1)", x: 90 },
    { t: "(c) hyperbola, centre (0, 0), asymptotes y = \uFFFDx/ 2", x: 90 },
    "2. The points A(d, -d) and B(12 - d, 2d - 6) both lie on a circle centered at the origin.",
    { t: "Determine the possible values of d. Answer: d = 6 or d = 10", x: 84 },
    "3. A function f satisfies f (x) + f (x + 3) = 2x + 5 for all x. If f (8) + f (2) = 12, find f (5).",
    { t: "1  -  e-  1", x: 160 },
    { t: "Answer: f (5) = 6", x: 84 },
    { t: "1", x: 300 },
  ],
  [
    "4. For the function f (x) = 1/(1 + e-x), find:",
    { t: "(a) the domain of f (x), D(f ),", x: 90 },
    { t: "(b) the range of f (x), R(f ), and", x: 90 },
    { t: "Answer: (a) D(f ) = (-, ) , (b) R(f ) = (0, 1)", x: 90 },
    "5. Let f (x) = \uFFFDx with domain x \uFFFD [-2, 2] and g(x) = \uFFFD\uFFFD ( ).",
    { t: "Answer: f (x) = x2 with domain x in [-2, 0]", x: 84 },
    "Other Suggested Problems",
    "Guichard, pages 31-32, Exercises 1.2.12 - 1.2.15",
    { t: "2", x: 300 },
  ],
]);

export const conicNotes = doc([
  [
    { t: "Equations and Graphs of Conic Sections", h: H1, x: 120 },
    ...filler(6, "As you progress through calculus and physics you will meet these curves."),
    { t: "1 Parabolas", h: H2 },
    ...filler(8, "The graph of a quadratic opens upward when the leading term is positive."),
  ],
  [
    ...filler(4, "A parabola is symmetric about its axis."),
    { t: "2 Circles and Ellipses", h: H2 },
    ...filler(8, "A circle is the set of points at a fixed distance from a centre."),
  ],
  [
    { t: "3 Hyperbolas", h: H2 },
    ...filler(4, "A hyperbola has two branches and two asymptotes."),
    { t: "4 Dashed lines: y=3x", x: 300 },
    "1. y = x2 + 2x + 2",
    { t: "4 Summary", h: H2 },
    ...filler(3, "Each conic has a standard form."),
  ],
  [
    { t: "5 Suggested Exercises", h: H2 },
    "Try sketching the graphs of the following equations by hand.",
    { t: "1. y = x2 + 2x + 2", x: 90 },
    { t: "2. 9x2 + 4y2 - 18x + 8y = 23", x: 90 },
    { t: "3. x2 - 2y2 = 4", x: 90 },
  ],
]);

export const courseNotes = doc([
  [{ t: "Math Course Notes", h: 20 }, { t: "Part I", h: 18 }, { t: "1 Review of the Basics", h: H1 }, ...filler(10)],
  [...filler(6), { t: "2 Composition", h: H1 }, ...filler(5)],
  [{ t: "3 Special Functions", h: H1 }, { t: "3.1 The Absolute Value Function", h: H2 }, ...filler(4), { t: "3.2 The Signum Function", h: H2 }],
  [...filler(4), "2 x = 5 is solved below", { t: "4 Limits", h: H1 }, ...filler(5)],
]);

export const bookmarkedBook = doc(
  Array.from({ length: 12 }, () => filler(20)),
  [bm("Calculus", 1, [bm("Preface", 1), bm("Chapter 1 Limits", 3), bm("2. Derivatives", 6), bm("Chapter 3: Integrals", 9), bm("Index", 12)])],
);

export const chapterBook = doc([
  ["Contents", "Chapter 1 Limits ....... 2", "Chapter 2 Derivatives ....... 3"],
  [{ t: "Chapter 1", h: 18 }, { t: "Limits", h: H1 }, ...filler(10)],
  [{ t: "Chapter 2", h: 18 }, { t: "Derivatives", h: H1 }, ...filler(10), "As shown in Chapter 1 the limit exists."],
]);

export const exerciseBook = doc([
  [{ t: "Chapter 1", h: 18 }, { t: "Limits", h: H1 }, ...filler(6)],
  [
    { t: "Exercises", h: H2 },
    "1. Find the limit of 3x + 1 as x approaches 2.",
    "2. Show that the limit of 1/x as x approaches 0 does not exist.",
    "3. Evaluate each limit.",
    { t: "(a) lim x2 as x approaches 1 (b) lim 2x as x approaches 4", x: 90 },
  ],
  [{ t: "Chapter 2", h: 18 }, { t: "Derivatives", h: H1 }, ...filler(6), { t: "Exercises", h: H2 }, "1. Differentiate sin of x squared.", "2. Differentiate the natural log of x."],
  [
    { t: "Answers to Odd-Numbered Exercises", h: H2 },
    "Chapter 1",
    "1. 7      3. (a) 1 (b) 8",
    "Chapter 2",
    "1. 2x cos of x squared",
  ],
]);

export const slideDeck = doc(
  Array.from({ length: 5 }, (_, i) => [{ t: `Slide title ${i + 1}`, h: 24 }, "A short bullet", "Another bullet", `Intro deck ${i + 1}`]),
  [],
  { width: 792, height: 612 },
);

export const outlinePdf = doc([
  [
    { t: "ECE 105", h: H1, x: 300 },
    "Classical Mechanics, Fall 2026",
    "LEARNING OBJECTIVES:",
    ...filler(6, "Apply the laws of motion to particles and rigid bodies."),
  ],
  ["ASSESSMENTS:", "Assignments (10%)", "Quizzes (15%)", "Midterm Exam (25%)", "Final Exam (50%):"],
]);
