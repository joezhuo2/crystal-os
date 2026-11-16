import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseUwOutline } from "./outline";

const html = readFileSync("src/modules/observatory/fixtures/math117-outline.html", "utf8");
const o = parseUwOutline(html, new Date(2026, 10, 15));
const byTitle = (t: string) => o.topics.find((x) => x.title === t)!;

describe("parseUwOutline", () => {
  it("reads the header", () =>
    expect({ code: o.code, name: o.name, term: o.term }).toEqual({ code: "MATH117", name: "Calculus 1 for Engineering", term: "2026F" }));
  it("reads 7 learning outcomes", () => {
    expect(o.outcomes).toHaveLength(7);
    expect(o.outcomes[2]).toBe("Demonstrate skill in evaluation of limits, derivatives and integrals");
  });
  it("splits exams and assessments", () => {
    expect(o.exams).toEqual([
      { name: "Midterm Exam", date: "2026-10-22", weight: 0.33, done: true },
      { name: "Final Exam", date: "2026-12-10", weight: 0.53, done: false },
    ]);
    expect(o.assessments).toEqual([{ name: "Tutorial Assignments (best 7 of 9)", weight: 0.14 }]);
  });
  it("makes one topic per plan item", () => {
    expect(o.topics).toHaveLength(32);
    expect(o.topics[0]).toEqual({ title: "Conic Sections", weeks: [1], pages: "2-9", sections: ["Guichard §1.2.3, 2.2, 2.4"], tutorial: 1, objective: false });
  });
  it("merges items listed in two weeks", () => {
    expect(byTitle("Sequences")).toMatchObject({ weeks: [3, 4], pages: "26-64", tutorial: 4 });
    expect(byTitle("Integration by Parts (IBP)").weeks).toEqual([10, 11]);
  });
  it("skips reading week and wrap up", () => expect(o.topics.some((t) => /reading week|wrap up/i.test(t.title))).toBe(false));
  it("flags topics that match an outcome", () => {
    expect(byTitle("Partial Fractions").objective).toBe(true);
    expect(byTitle("IVT/EVT").objective).toBe(false);
    expect(byTitle("Sequences").objective).toBe(false);
  });
  it("skips plan rows with fewer than 4 cells", () => {
    const row = "&nbsp;No tutorials this week</p></td></tr>";
    const p = parseUwOutline(html.replace(row, `${row}<tr><td><p>Week 15</p></td><td><p>Bonus</p></td></tr>`));
    expect(p.topics).toHaveLength(32);
  });
  it("rejects an outline without a term year", () =>
    expect(() => parseUwOutline(html.replace('<span class="outline-term">Fall 2026</span>', '<span class="outline-term">Fall</span>'))).toThrow("Not a UW course outline"));
  it("rejects other html", () => expect(() => parseUwOutline("<html><body><h1>Hi</h1></body></html>")).toThrow("Not a UW course outline"));
  it("treats a missing assessments section as empty", () => {
    const p = parseUwOutline(html.replace('id="assessments_amp_activities"', 'id="gone"'), new Date(2026, 10, 15));
    expect(p.exams).toEqual([]);
    expect(p.assessments).toEqual([]);
  });
  it("handles undated exams and decimal or blank weights", () => {
    const p = parseUwOutline(
      html.split("Thursday, October 22, 4:30 - 6:20 pm").join("TBA").replace("14%", "").replace("53%", "33.5%"),
      new Date(2026, 10, 15),
    );
    expect(p.exams[0]).toEqual({ name: "Midterm Exam", date: null, weight: 0.33 });
    expect(p.exams[1].weight).toBe(0.335);
    expect(p.assessments[0].weight).toBe(0);
  });
  it("treats a missing class plan as no topics", () =>
    expect(parseUwOutline(html.replace('id="tentative_class_plan"', 'id="gone"')).topics).toEqual([]));
});

describe("parseUwOutline with a paragraph class plan (ECE 150)", () => {
  const e = parseUwOutline(readFileSync("src/modules/observatory/fixtures/ece150-outline.html", "utf8"), new Date(2026, 10, 15));
  const topic = (t: string) => e.topics.find((x) => x.title === t);

  it("reads the header and outcomes", () => {
    expect({ code: e.code, name: e.name, term: e.term }).toEqual({ code: "ECE150", name: "Fundamentals of programming", term: "2026F" });
    expect(e.outcomes).toHaveLength(7);
  });
  it("splits each week on semicolons", () => {
    expect(e.topics).toHaveLength(63);
    expect(e.topics[0]).toMatchObject({ title: "Literal data", weeks: [1], sections: [] });
    expect(topic("conditional (if) statements")?.weeks).toEqual([1]);
    expect(topic("Reference variables, pass by reference and aliases")?.weeks).toEqual([5]);
    expect(topic("a widget class for graphical user interfaces")?.weeks).toEqual([11]);
  });
  it("merges a phrase repeated in two weeks", () => expect(topic("the call stack")?.weeks).toEqual([2, 5]));
  it("skips filler weeks", () => expect(e.topics.some((t) => /room for|review/i.test(t.title))).toBe(false));
  it("flags topics that match an outcome", () => expect(topic("Debugging")?.objective).toBe(true));
  it("reads exams with 'out of 100' weights", () => {
    expect(e.exams).toEqual([
      { name: "Final examination", date: null, weight: 0 },
      { name: "Mid-term examination", date: "2026-10-23", weight: 0, done: true },
    ]);
    expect(e.assessments).toEqual([{ name: "Projects", weight: 0 }]);
  });
});

describe("parseUwOutline with a section-list class plan (MATH 115)", () => {
  const m = parseUwOutline(readFileSync("src/modules/observatory/fixtures/math115-outline.html", "utf8"), new Date(2026, 10, 15));

  it("reads the header and outcomes", () => {
    expect({ code: m.code, name: m.name, term: m.term }).toEqual({ code: "MATH115", name: "Linear Algebra for Engineering", term: "2026F" });
    expect(m.outcomes).toHaveLength(10);
  });
  it("makes one topic per numbered section", () => {
    expect(m.topics).toHaveLength(40);
    expect(m.topics[0]).toEqual({ title: "Vectors in Rn", weeks: [], sections: ["§1.1"], objective: true });
    expect(m.topics.at(-1)).toMatchObject({ title: "Powers of Matrices", sections: ["§8.5"] });
    expect(m.topics.some((t) => /introduction and overview|chapter|additional topics/i.test(t.title))).toBe(false);
  });
  it("uses the first grading scheme and leaves absent exam dates null", () => {
    expect(m.exams).toEqual([
      { name: "Midterm", date: null, weight: 0.3 },
      { name: "Final Exam", date: null, weight: 0.55 },
    ]);
    expect(m.assessments).toEqual([
      { name: "Weekly Tutorial Assignments", weight: 0.1 },
      { name: "Python Assignments", weight: 0.05 },
    ]);
  });
});
