import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { askAi } from "@/lib/ai";
import { OutlineButton } from "./OutlineButton";
import { setObservatoryAiProvider } from "./settings";

const outline = { code: "ECE105", name: "Classical Mechanics", term: "2026F", outcomes: ["x"], topics: [], exams: [], assessments: [] };

vi.mock("./resources/pdf", () => ({ readPdf: vi.fn(async () => ({ pages: [], outline: [] })) }));
vi.mock("./resources/pdfOutline", () => ({
  parsePdfOutline: vi.fn(() => ({ outline, confidence: { code: 0.9, name: 0.9, term: 0.7, outcomes: 0.4, topics: 0.5, exams: 0.5, assessments: 0.9 } })),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), warning: vi.fn() } }));
vi.mock("@/lib/ai", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/ai")>()), askAi: vi.fn() }));

const pick = (file: File) => fireEvent.change(screen.getByTestId("outline-input"), { target: { files: [file] } });
const NOT_UW = "<html><body><h1>PHYS 101 Syllabus</h1><p>Term: Winter 2027</p><p>Week 1: Kinematics</p></body></html>";
const notUw = () => Object.defineProperty(new File([NOT_UW], "phys101.html", { type: "text/html" }), "text", { value: async () => NOT_UW });

beforeEach(() => vi.clearAllMocks());
afterEach(() => setObservatoryAiProvider("none"));

test("imports a PDF outline and flags unclear fields", async () => {
  const onOutline = vi.fn();
  render(<OutlineButton onOutline={onOutline}>Import</OutlineButton>);
  const file = new File(["%PDF-1.4"], "ECE 105_Fall 2026_Course Outline.pdf", { type: "application/pdf" });
  Object.defineProperty(file, "arrayBuffer", { value: async () => new ArrayBuffer(8) });
  pick(file);
  await waitFor(() => expect(onOutline).toHaveBeenCalledWith(outline));
  expect(toast.warning).toHaveBeenCalledWith(expect.any(String), { description: "outcomes, exams" });
  expect(await screen.findByRole("button", { name: /Imported/ })).toBeInTheDocument();
});

test("without a provider a non-UW outline keeps the error and mentions AI", async () => {
  render(<OutlineButton onOutline={vi.fn()}>Import</OutlineButton>);
  pick(notUw());
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Not a UW course outline", { description: expect.stringMatching(/AI can read other outlines/) }));
  expect(askAi).not.toHaveBeenCalled();
});

test("with a provider a non-UW outline offers Read with AI and continues with its result", async () => {
  setObservatoryAiProvider("claude");
  vi.mocked(askAi).mockResolvedValue(JSON.stringify({
    code: "PHYS101", name: "Mechanics", term: "2027W", outcomes: ["Solve kinematics problems"],
    topics: [{ title: "Kinematics", weeks: [1] }], assessments: [{ name: "Final Exam", weight: 1, date: "2027-04-20" }],
    confidence: { code: 0.9, name: 0.4, term: 0.9, outcomes: 0.9, topics: 0.9, exams: 0.9, assessments: 0.9 },
  }));
  const onOutline = vi.fn();
  render(<OutlineButton onOutline={onOutline}>Import</OutlineButton>);
  pick(notUw());
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Not a UW course outline", expect.objectContaining({ action: expect.objectContaining({ label: "Read with AI" }) })));
  expect(askAi).not.toHaveBeenCalled();

  const { action } = vi.mocked(toast.error).mock.calls[0]![1] as unknown as { action: { onClick: () => void } };
  action.onClick();
  await waitFor(() => expect(onOutline).toHaveBeenCalled());
  expect(onOutline.mock.calls[0]![0]).toEqual({
    code: "PHYS101", name: "Mechanics", term: "2027W", outcomes: ["Solve kinematics problems"],
    topics: [{ title: "Kinematics", weeks: [1], sections: [], objective: false }],
    exams: [{ name: "Final Exam", date: "2027-04-20", weight: 1, done: false }], assessments: [],
  });
  expect(vi.mocked(askAi).mock.calls[0]![0].messages[0]!.content).toContain("PHYS 101 Syllabus\nTerm: Winter 2027\nWeek 1: Kinematics");
  expect(toast.warning).toHaveBeenCalledWith("Unclear in this outline, please check", { description: "name" });
});

test("with a provider an outline with no topics or outcomes offers Read with AI or Use as is", async () => {
  setObservatoryAiProvider("claude");
  const { parsePdfOutline } = await import("./resources/pdfOutline");
  const empty = { ...outline, outcomes: [] };
  vi.mocked(parsePdfOutline).mockReturnValueOnce({ outline: empty, confidence: { code: 0.9, name: 0.9, term: 0.9, outcomes: 0, topics: 0.5, exams: 0.9, assessments: 0.9 } });
  const onOutline = vi.fn();
  render(<OutlineButton onOutline={onOutline}>Import</OutlineButton>);
  const file = new File(["%PDF-1.4"], "outline.pdf", { type: "application/pdf" });
  Object.defineProperty(file, "arrayBuffer", { value: async () => new ArrayBuffer(8) });
  pick(file);
  await waitFor(() => expect(toast.warning).toHaveBeenCalledWith("No topics or outcomes found in this outline", expect.objectContaining({ action: expect.objectContaining({ label: "Read with AI" }) })));
  expect(onOutline).not.toHaveBeenCalled();
  const { cancel } = vi.mocked(toast.warning).mock.calls[0]![1] as unknown as { cancel: { onClick: () => void } };
  cancel.onClick();
  expect(onOutline).toHaveBeenCalledWith(empty);
  expect(askAi).not.toHaveBeenCalled();
});
