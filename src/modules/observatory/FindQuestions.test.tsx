import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Topic } from "./model";
import type { FindJob } from "./resources/find";

const findQuestions = vi.fn(async (..._a: unknown[]) => ({ found: 2, added: 1, log: "x.md" }));
const countPages = vi.fn(async (pdf: string) => (pdf.includes("ps1") ? 3 : 4));
vi.mock("./resources/find", () => ({ findQuestions: (...a: unknown[]) => findQuestions(...a), countPages: (p: string) => countPages(p) }));
const R = "Observatory/MATH117/resources";
const resources = [
  { sidecar: `${R}/question-sheets/ps1.md`, pdf: `${R}/question-sheets/ps1.pdf`, name: "ps1.pdf", title: "PS 1", type: "question-sheet", added: null, processed: true, code: "MATH117" },
  { sidecar: "Observatory/ECE105/resources/lectures/l1.md", pdf: "Observatory/ECE105/resources/lectures/l1.pdf", name: "l1.pdf", title: "L1", type: "slides", added: null, processed: true, code: "ECE105" },
];
const useCourseResources = vi.fn((codes: string[]) => resources.filter((r) => codes.includes(r.code)));
vi.mock("./resources/ingest", () => ({ useCourseResources: (c: string[]) => useCourseResources(c) }));
const topics = [{ slug: "limits", title: "Limits", course: "MATH117" }, { slug: "motion", title: "Motion", course: "ECE105" }] as Topic[];
vi.mock("./useObservatory", () => ({ useCoursesTopics: () => ({ topics, loading: false }) }));
vi.mock("@/lib/platform", async (orig) => ({ ...(await orig<object>()), isDesktop: () => true }));
type Action = { label: string; onClick: () => void };
const toast = { loading: vi.fn((..._a: unknown[]) => "t1"), success: vi.fn(), warning: vi.fn(), error: vi.fn() };
vi.mock("sonner", () => ({ toast }));

const { FindAllQuestionsButton, FindQuestionsButton } = await import("./FindQuestions");
const { setObservatoryAiProvider } = await import("./settings");

const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
const job: FindJob = { resource: resources[0]! as FindJob["resource"], code: "MATH117", topics: [topics[0]!] };

beforeEach(() => {
  vi.clearAllMocks();
  setObservatoryAiProvider("claude");
});

describe("Find questions with AI", () => {
  it("is not shown when the provider is None, so no call can be made", () => {
    setObservatoryAiProvider("none");
    wrap(<><FindQuestionsButton jobs={[job]} label="Find questions in ps1.pdf with AI" /><FindAllQuestionsButton codes={["MATH117"]} label="Find all" /></>);
    expect(screen.queryByRole("button")).toBeNull();
    expect(findQuestions).not.toHaveBeenCalled();
  });

  it("runs a single resource straight away and reports what it added", async () => {
    wrap(<FindQuestionsButton jobs={[job]} label="Find questions in ps1.pdf with AI" />);
    fireEvent.click(screen.getByRole("button", { name: "Find questions in ps1.pdf with AI" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(findQuestions).toHaveBeenCalledWith(job, "Observatory", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(toast.success.mock.calls[0]![0]).toBe("Searched 1 PDF, added 1 question to the review pool");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("asks first for every course, with the file and page count, and skips Deep Sky", async () => {
    wrap(<FindAllQuestionsButton codes={["MATH117", "DeepSky", "ECE105"]} label="Find questions in every course with AI" />);
    expect(useCourseResources).toHaveBeenCalledWith(["MATH117", "ECE105"]);
    fireEvent.click(screen.getByRole("button", { name: "Find questions in every course with AI (2)" }));
    const dialog = await screen.findByRole("alertdialog");
    await waitFor(() => expect(dialog).toHaveTextContent("2 files (7 pages)"));
    expect(dialog).toHaveTextContent("Claude");
    expect(findQuestions).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Find questions" }));
    await waitFor(() => expect(findQuestions).toHaveBeenCalledTimes(2));
    expect(findQuestions.mock.calls[1]![0]).toMatchObject({ code: "ECE105", topics: [topics[1]] });
  });

  it("does nothing when the confirmation is cancelled", async () => {
    wrap(<FindAllQuestionsButton codes={["MATH117"]} label="Find all" />);
    fireEvent.click(screen.getByRole("button", { name: "Find all (1)" }));
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(findQuestions).not.toHaveBeenCalled();
  });

  it("reports a failed file and carries on with the rest", async () => {
    findQuestions.mockRejectedValueOnce(new Error("bad PDF"));
    const other = { ...job, resource: resources[1]! as FindJob["resource"], code: "ECE105" };
    wrap(<FindQuestionsButton jobs={[job, other]} label="Find" />);
    fireEvent.click(screen.getByRole("button", { name: "Find" }));
    await waitFor(() => expect(toast.warning).toHaveBeenCalled());
    expect(findQuestions).toHaveBeenCalledTimes(2);
    expect(toast.warning.mock.calls[0]![0]).toBe("Searched 1 PDF, added 1 question to the review pool; 1 failed");
    expect((toast.warning.mock.calls[0]![1] as { description: string }).description).toBe("ps1.pdf: bad PDF");
  });

  it("shows file n of m and stops at the next file when cancelled", async () => {
    let release: () => void = () => {};
    findQuestions.mockImplementationOnce(() => new Promise((r) => (release = () => r({ found: 0, added: 0, log: "x.md" }))));
    const other = { ...job, resource: resources[1]! as FindJob["resource"], code: "ECE105" };
    wrap(<FindQuestionsButton jobs={[job, other]} label="Find" />);
    fireEvent.click(screen.getByRole("button", { name: "Find" }));
    await waitFor(() => expect(toast.loading).toHaveBeenCalledWith("Finding questions: file 1 of 2", expect.anything()));
    const { action } = toast.loading.mock.calls.at(-1)![1] as { action: Action };
    action.onClick();
    release();
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(findQuestions).toHaveBeenCalledTimes(1);
    expect(toast.success.mock.calls[0]![0]).toMatch(/^Stopped after 1 PDF/);
  });
});
