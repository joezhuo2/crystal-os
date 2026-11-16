import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GradesTab } from "./GradesTab";
import type { Course } from "./model";

vi.mock("./store", () => ({ saveCourse: vi.fn(async () => {}) }));

const course: Course = {
  code: "MATH117",
  name: "Calculus",
  term: "2026F",
  color: "#fff",
  keywords: [],
  outcomes: [],
  archived: false,
  exams: [{ name: "Midterm Exam", date: null, weight: 0.4, scores: [{ label: "#1", score: 80 }] }],
  assessments: [{ name: "Labs", weight: 0.6, scores: [{ label: "#1", score: 90 }] }],
};

test("exams take a single score while assessments can add more", () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <GradesTab course={course} onEdit={() => {}} />
    </QueryClientProvider>,
  );
  expect(screen.getAllByRole("button", { name: /Add score/ })).toHaveLength(1);
  expect(screen.queryByLabelText("Midterm Exam score 2")).toBeNull();
});
