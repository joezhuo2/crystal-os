import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Course, Topic } from "./model";
import type { Resource } from "./resources/ingest";
import type { ProcessProgress } from "./resources/process";

const R = "Observatory/MATH117/resources";
const resources: Resource[] = [
  { sidecar: `${R}/textbooks/calc/_book.md`, pdf: `${R}/textbooks/calc/book.pdf`, name: "calc.pdf", title: "Calculus", type: "textbook", added: null, processed: true },
  { sidecar: `${R}/question-sheets/ps1.md`, pdf: `${R}/question-sheets/ps1.pdf`, name: "ps1.pdf", title: "Problem Set 1", type: "question-sheet", added: null, processed: false },
];
const fileDrop = vi.fn(async (..._a: unknown[]) => ({ analysis: {}, filed: { code: "MATH117", type: "question-sheet", pdf: "x.pdf", sidecar: "x.md" } }));
const moveResource = vi.fn(async (..._a: unknown[]) => ({ code: "MATH115", type: "other", pdf: "y.pdf", sidecar: "y.md" }));
const deleteResource = vi.fn(async (..._a: unknown[]) => [{ from: "a", path: "b" }]);
const restoreResource = vi.fn(async (..._a: unknown[]) => {});
const undoToast = vi.fn((_title: string, _onUndo: () => void) => {});
let finish: () => void = () => {};
const processResource = vi.fn((_s: string, _t: unknown, onProgress: (p: ProcessProgress) => void) => {
  onProgress({ done: 1, total: 2, label: "Chapter 1" });
  return new Promise((resolve) => (finish = () => resolve({ type: "textbook", confidence: 1, needsOcr: [], pools: [] })));
});

vi.mock("./resources/ingest", () => ({
  useResources: () => ({ resources, loading: false }),
  fileDrop: (...a: unknown[]) => fileDrop(...a),
  moveResource: (...a: unknown[]) => moveResource(...a),
  filedTitle: (name: string) => `Filed ${name}`,
  deleteResource: (...a: unknown[]) => deleteResource(...a),
  restoreResource: (...a: unknown[]) => restoreResource(...a),
}));
vi.mock("@/lib/undo", () => ({ undoToast: (title: string, onUndo: () => void) => undoToast(title, onUndo) }));
vi.mock("./resources/process", () => ({ processResource: (...a: Parameters<typeof processResource>) => processResource(...a) }));
vi.mock("./useObservatory", () => ({ useCourses: () => ({ courses: [{ course: { code: "MATH117" } }, { course: { code: "MATH115" } }], loading: false }) }));
vi.mock("@/lib/platform", async (orig) => ({ ...(await orig<object>()), isDesktop: () => true }));
vi.mock("./ProcessAllButton", () => ({ ProcessAllButton: () => null }));
vi.mock("./FindQuestions", () => ({ FindQuestionsButton: () => null, FindAllQuestionsButton: () => null }));
vi.mock("./ReaderView", () => ({ ReaderView: ({ resource }: { resource: Resource }) => <p>Reading {resource.name}</p> }));
vi.mock("./SortPopup", () => ({
  SortPopup: ({ onChoose }: { onChoose: (code: string, type: string) => void }) => <button onClick={() => onChoose("MATH115", "other")}>Choose MATH115</button>,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

const { ResourcesTab, ResourceToolbar } = await import("./ResourcesTab");

const course = { code: "MATH117" } as Course;
const topics = [{ slug: "limits", title: "Limits" }] as Topic[];
const show = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ResourcesTab course={course} topics={topics} />
    </QueryClientProvider>,
  );

beforeEach(() => vi.clearAllMocks());

describe("ResourcesTab", () => {
  it("lists resources grouped by type with Process or Reprocess", () => {
    show();
    const books = screen.getByRole("region", { name: "Textbooks" });
    expect(within(books).getByText("Calculus")).toBeInTheDocument();
    expect(within(books).getByRole("button", { name: /reprocess/i })).toBeInTheDocument();
    const sheets = screen.getByRole("region", { name: "Question sheets" });
    expect(within(sheets).getByRole("button", { name: /^process /i })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Lecture slides" })).toBeNull();
  });

  it("processes with a progress bar", async () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: /reprocess/i }));
    expect(processResource).toHaveBeenCalledWith(resources[0]!.sidecar, topics, expect.any(Function));
    expect(await screen.findByText("Chapter 1")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: /processing calc.pdf/i })).toBeInTheDocument();
    await act(async () => finish());
    await waitFor(() => expect(screen.queryByRole("progressbar")).toBeNull());
  });

  it("uploads with a forced type and the course", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ResourceToolbar course={course} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /upload question sheet/i }));
    const file = Object.assign(new File(["%PDF"], "ps2.pdf", { type: "application/pdf" }), { arrayBuffer: async () => new ArrayBuffer(4) });
    fireEvent.change(screen.getByTestId("resource-upload"), { target: { files: [file] } });
    await waitFor(() => expect(fileDrop).toHaveBeenCalled());
    expect(fileDrop.mock.calls[0]![2]).toEqual({ courseHint: "MATH117", typeHint: "question-sheet" });
  });

  it("deletes a resource and restores it on undo", async () => {
    show();
    fireEvent.click(within(screen.getByRole("region", { name: "Question sheets" })).getByRole("button", { name: /^delete /i }));
    expect(deleteResource).not.toHaveBeenCalled();
    fireEvent.click(within(await screen.findByRole("alertdialog", { name: "Delete ps1.pdf?" })).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteResource).toHaveBeenCalledWith(resources[1]));
    await waitFor(() => expect(undoToast).toHaveBeenCalled());
    act(() => undoToast.mock.calls[0]![1]());
    await waitFor(() => expect(restoreResource).toHaveBeenCalledWith([{ from: "a", path: "b" }]));
  });

  it("deletes nothing when the confirmation is cancelled", async () => {
    show();
    fireEvent.click(within(screen.getByRole("region", { name: "Question sheets" })).getByRole("button", { name: /^delete /i }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(deleteResource).not.toHaveBeenCalled();
  });

  it("opens the reader and moves a resource", async () => {
    show();
    fireEvent.click(within(screen.getByRole("region", { name: "Question sheets" })).getByRole("button", { name: /^move /i }));
    fireEvent.click(screen.getByRole("button", { name: "Choose MATH115" }));
    await waitFor(() => expect(moveResource).toHaveBeenCalledWith(resources[1]!.sidecar, "MATH115", "other"));
    fireEvent.click(within(screen.getByRole("region", { name: "Textbooks" })).getByRole("button", { name: /^open /i }));
    expect(screen.getByText("Reading calc.pdf")).toBeInTheDocument();
  });
});
