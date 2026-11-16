import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CourseEntry } from "./useObservatory";
import type { Course } from "./model";

const outlineHtml = readFileSync("src/modules/observatory/fixtures/math117-outline.html", "utf8");

let courses: CourseEntry[] = [];
let state: { loading: boolean; error: Error | null } = { loading: false, error: null };
const createCourse = vi.fn(async () => {});
const applyOutlineMerge = vi.fn(async () => []);
const deleteCourse = vi.fn(async () => ".trash/MATH117");
const restoreCourse = vi.fn(async () => {});
const toastError = vi.fn();
const undoToast = vi.fn();
let vaultNotes: { path: string; title: string; frontmatter: Record<string, unknown> }[] = [];

vi.mock("./useObservatory", () => ({
  useCourses: () => ({ courses, ...state }),
  useTopics: () => ({ topics: [], loading: false }),
  useCoursesTopics: () => ({ topics: [], loading: false }),
  useTopicBodies: (topics: unknown[]) => ({ topics, loading: false }),
  useProgress: () => ({ progress: {}, loading: false }),
}));
vi.mock("./store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./store")>()),
  createCourse: (...args: unknown[]) => createCourse(...(args as [])),
  applyOutlineMerge: (...args: unknown[]) => applyOutlineMerge(...(args as [])),
  deleteCourse: (...args: unknown[]) => deleteCourse(...(args as [])),
  restoreCourse: (...args: unknown[]) => restoreCourse(...(args as [])),
}));
vi.mock("@/lib/platform", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/platform")>()),
  isDesktop: () => true,
}));
vi.mock("@/lib/undo", () => ({ undoToast: (...a: unknown[]) => undoToast(...a) }));
vi.mock("@/lib/appActivity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/appActivity")>()),
  useAppActivity: () => ({ visible: true, still: true }),
}));
vi.mock("@/hooks/useShortcut", () => ({ useShortcut: () => {} }));
vi.mock("@/hooks/useVault", () => ({ fetchRawNote: vi.fn(), vaultErrorCode: () => null, useVaultNotes: () => ({ data: { notes: vaultNotes }, isLoading: false }) }));
vi.mock("sonner", () => ({ toast: { error: (...a: unknown[]) => toastError(...a), success: vi.fn() } }));

const { default: ObservatoryPage } = await import("./ObservatoryPage");

const course = (code: string, archived = false): CourseEntry => ({
  path: `Observatory/${code}/_course.md`,
  course: { code, name: `${code} name`, term: "2026F", color: "red", keywords: [], outcomes: [], exams: [], assessments: [], archived } as Course,
});

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ObservatoryPage />
    </QueryClientProvider>,
  );

const importFile = (html: string | Promise<string>) => {
  const input = screen.getAllByTestId("outline-input")[0]!;
  fireEvent.change(input, { target: { files: [{ text: () => Promise.resolve(html) }] } });
};

beforeEach(() => {
  courses = [];
  state = { loading: false, error: null };
  vaultNotes = [];
  vi.clearAllMocks();
});

describe("ObservatoryPage", () => {
  it("offers starter courses on an empty page", async () => {
    renderPage();
    expect(screen.getAllByRole("button", { name: /new course/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /import outline/i }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Add starter courses" }));
    await waitFor(() => expect(createCourse).toHaveBeenCalledTimes(4));
    const codes = createCourse.mock.calls.map((c) => (c as unknown as [string, Course])[1].code);
    expect(codes).toEqual(["MATH117", "MATH115", "ECE105", "ECE150"]);
  });

  it("hides archived courses until asked", () => {
    courses = [course("MATH117"), course("ECE105", true)];
    renderPage();
    expect(screen.getByText("MATH117")).toBeTruthy();
    expect(screen.queryByText("ECE105")).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: "Show archived" }));
    expect(screen.getByText("ECE105")).toBeTruthy();
  });

  it("imports an outline into a prefilled dialog and saves its topics", async () => {
    renderPage();
    importFile(outlineHtml);
    expect(await screen.findByText(/^32 topics, \d+ outcomes? and \d+ assessments? will be created$/)).toBeTruthy();
    expect((screen.getByLabelText("Code") as HTMLInputElement).value).toBe("MATH117");
    expect((screen.getByLabelText("Exam 2 weight percent") as HTMLInputElement).value).toBe("53");
    fireEvent.change(screen.getByLabelText("Exam 2 weight percent"), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(createCourse).toHaveBeenCalledTimes(1));
    const [, saved, topics] = createCourse.mock.calls[0] as unknown as [string, Course, unknown[]];
    expect(saved.code).toBe("MATH117");
    expect(saved.exams[1].weight).toBe(0.5);
    expect(topics).toHaveLength(32);
  });

  it("rejects a file that is not an outline", async () => {
    renderPage();
    importFile("<html></html>");
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Not a UW course outline", expect.anything()));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows a skeleton while loading and the error when loading fails", () => {
    state = { loading: true, error: null };
    const { unmount } = renderPage();
    expect(screen.getByRole("status", { name: "Loading courses" })).toBeTruthy();
    expect(screen.queryByText(/No courses yet/)).toBeNull();
    unmount();
    state = { loading: false, error: new Error("vault offline") };
    renderPage();
    expect(screen.getByText("Could not load courses: vault offline")).toBeTruthy();
  });

  it("says when every course is archived", () => {
    courses = [course("ECE105", true)];
    renderPage();
    expect(screen.getByText("All courses are archived")).toBeTruthy();
  });

  it("shows the _inbox entry with a count only when files wait there", () => {
    courses = [course("MATH117")];
    const { unmount } = renderPage();
    expect(screen.queryByRole("button", { name: /_inbox/ })).toBeNull();
    unmount();
    vaultNotes = [
      { path: "Observatory/_inbox/l07.md", title: "L07", frontmatter: { type: "slides", source: "[[Observatory/_inbox/l07.pdf]]" } },
      { path: "Observatory/_inbox/notes.md", title: "notes", frontmatter: {} },
    ];
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "_inbox, 1 unsorted" }));
    expect(screen.getByRole("list", { name: "Unsorted files" }).textContent).toContain("l07.pdf");
  });

  it("toasts a file it cannot read", async () => {
    renderPage();
    importFile(Promise.reject(new Error("io")));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Could not read that file"));
  });

  it("asks before merging an outline into an existing course", async () => {
    courses = [course("MATH117")];
    renderPage();
    importFile(outlineHtml);
    expect(await screen.findByText("Update MATH117 from outline?")).toBeTruthy();
    expect(screen.getByText("Your topic notes, questions and review progress are kept.")).toBeTruthy();
    expect(screen.getByText("32 topics added")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Update course" }));
    await waitFor(() => expect(applyOutlineMerge).toHaveBeenCalledTimes(1));
    const [folder, code, merge] = applyOutlineMerge.mock.calls[0] as unknown as [string, string, { added: unknown[] }];
    expect([folder, code, merge.added.length]).toEqual(["Observatory", "MATH117", 32]);
    expect(createCourse).not.toHaveBeenCalled();
  });

  it("deletes a course and restores it on undo", async () => {
    courses = [course("MATH117")];
    renderPage();
    fireEvent.click(screen.getByText("MATH117"));
    fireEvent.click(screen.getByRole("button", { name: "Delete course" }));
    expect(screen.getByText("Delete MATH117?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(undoToast).toHaveBeenCalledTimes(1));
    expect(deleteCourse).toHaveBeenCalledWith("Observatory", "MATH117");
    const [title, onUndo] = undoToast.mock.calls[0] as unknown as [string, () => void];
    expect(title).toBe("Deleted MATH117");
    onUndo();
    await waitFor(() => expect(restoreCourse).toHaveBeenCalledWith(".trash/MATH117", "Observatory", "MATH117"));
  });

  it("opens the review view and shows the goal ring", async () => {
    courses = [course("MATH117")];
    renderPage();
    expect(screen.getByRole("img", { name: "Daily goal: 0 of 3 observations" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(await screen.findByText("All caught up")).toBeTruthy();
  });

  it("shows an inline error for an invalid code", () => {
    renderPage();
    fireEvent.click(screen.getAllByRole("button", { name: /new course/i })[0]!);
    fireEvent.change(screen.getByLabelText("Code"), { target: { value: "12AB" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Use a code like MATH117")).toBeTruthy();
    expect(createCourse).not.toHaveBeenCalled();
  });

  it("switches between Courses and Deep Sky", async () => {
    courses = [course("MATH117")];
    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "Deep Sky" }));
    expect(await screen.findByText("No Deep Sky topics yet")).toBeTruthy();
    expect(screen.queryByText("MATH117 name")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Courses" }));
    expect(screen.getByText("MATH117 name")).toBeTruthy();
  });

  it("opens Deep Sky from a target", async () => {
    const { appUi } = await import("@/lib/appUi");
    appUi.setObservatoryTarget({ view: "deepsky" });
    renderPage();
    expect(await screen.findByText("No Deep Sky topics yet")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Deep Sky" }).getAttribute("aria-selected")).toBe("true");
  });
});
