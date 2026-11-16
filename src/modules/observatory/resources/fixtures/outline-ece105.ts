import type { PdfDoc, PdfPage, TextItem } from "../types";

export function textPage(index: number, rows: (string | null)[]): PdfPage {
  const items: TextItem[] = [];
  let y = 60;
  for (const row of rows) {
    if (row !== null) items.push({ str: row, x: row.length < 25 && y < 100 ? 260 : 40, y, w: row.length * 5, h: 10 });
    y += row === null ? 10 : 14;
  }
  items.push({ str: String(index), x: 560, y: 760, w: 5, h: 10 });
  return { index, width: 612, height: 792, items, text: items.map((i) => i.str).join("\n") };
}

export const ece105Outline: PdfDoc = {
  outline: [],
  pages: [
    textPage(1, [
      "ECE 105",
      "(Classical Mechanics)",
      null,
      "INSTRUCTORS CONTACT INFORMATION:",
      "Section Instructor Office hours",
      "001 Instructor A By arrangement",
      null,
      "COURSE DESCRIPTION:",
      "Forces and Newton's laws, energy and momentum, rotation, oscillations and waves.",
      null,
      "LEARNING OBJECTIVES:",
      "One goal of this course is to teach fundamental physics principles. Another goal is to teach",
      "general problem-solving strategies.",
      null,
      "The weekly assignments and quizzes help you master each topic.",
      null,
      "ASSESSMENTS:",
      "Assignments (10%)",
      "There will be 10 weekly assignments completed online.",
    ]),
    textPage(2, [
      "Quizzes (15%)",
      "There will be 10 quizzes in the tutorial sessions.",
      null,
      "Midterm Exam (25%)",
      null,
      "The midterm exam will be held on Thursday, October 27th, 4:30pm - 6:20 pm, in person.",
      null,
      "Final Exam (50%):",
      null,
      "The final exam will be held in the December exam session. The next sitting is Dec 2027.",
      null,
      "Alternate marking schemes:",
      "Final course grade = Assignments (0%) + Quizzes (0%) + ME (35%) + FE (65%)",
      "Midterm (35%)",
      null,
      "COURSE RULES/CONSIDERATIONS:",
      "Final Exam Period Travel:",
      "• The final exam period is December 10th to December 23rd, 2025.",
    ]),
  ],
};
