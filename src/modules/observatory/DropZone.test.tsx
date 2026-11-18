import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Course } from "./model";
import type { Analysis, Filed } from "./resources/ingest";

type ToastOpts = { action: { onClick: () => void }; cancel: { onClick: () => void } };
const toast = Object.assign(vi.fn<(title: string, opts: ToastOpts) => void>(), { error: vi.fn(), loading: vi.fn(() => "loading-id"), dismiss: vi.fn() });
let desktop = true;
let outcome: { analysis: Analysis; filed: Filed | null };
const filed: Filed = { code: "MATH117", type: "slides", pdf: "Observatory/MATH117/resources/lectures/l07.pdf", sidecar: "Observatory/MATH117/resources/lectures/l07.md" };
const fileDrop = vi.fn(async () => outcome);
const fileTo = vi.fn(async (_a: unknown, code: string | null, type: string) => ({ ...filed, code, type }));
const moveResource = vi.fn(async (_s: string, code: string | null, type: string) => ({ ...filed, code, type }));
const undoFile = vi.fn(async () => {});
let filedNames = new Set<string>();

const course = (code: string): Course =>
  ({ code, name: `${code} name`, term: "2026F", color: "red", keywords: [], outcomes: [], exams: [], assessments: [], archived: false }) as Course;

vi.mock("sonner", () => ({ toast }));
vi.mock("@/lib/platform", async (orig) => ({ ...(await orig<typeof import("@/lib/platform")>()), isDesktop: () => desktop }));
vi.mock("@/lib/appActivity", async (orig) => ({ ...(await orig<typeof import("@/lib/appActivity")>()), useAppActivity: () => ({ visible: true, still: true }) }));
vi.mock("./useObservatory", () => ({ useCourses: () => ({ courses: [course("ECE150"), course("MATH117")].map((c) => ({ course: c, path: "" })), loading: false, error: null }) }));
vi.mock("./CourseDialog", () => ({ CourseDialog: ({ onClose }: { onClose: () => void }) => <button onClick={onClose}>course dialog</button> }));
const convertToPdf = vi.fn(async (..._a: unknown[]) => new Uint8Array([9]).buffer);
vi.mock("@/lib/vaultNative", async (orig) => ({ ...(await orig<typeof import("@/lib/vaultNative")>()), convertToPdf: (...a: unknown[]) => convertToPdf(...a) }));
vi.mock("./resources/ingest", async (orig) => ({
  ...(await orig<typeof import("./resources/ingest")>()),
  fileDrop: (...a: unknown[]) => fileDrop(...(a as [])),
  fileTo: (...a: [unknown, string | null, string]) => fileTo(...a),
  moveResource: (...a: [string, string | null, string]) => moveResource(...a),
  undoFile: () => undoFile(),
  useFiledNames: () => filedNames,
}));

const setAiOutputStatus = vi.fn(async (..._a: unknown[]) => {});
vi.mock("./aiLog", () => ({ saveAiOutput: vi.fn(), setAiOutputStatus: (...a: unknown[]) => setAiOutputStatus(...a) }));

const { DropZone } = await import("./DropZone");

const pdf = (name: string) => ({ name, arrayBuffer: async () => new ArrayBuffer(4) });
const analysis = (name = "L07.pdf"): Analysis => ({ file: { name, bytes: new Uint8Array() }, title: "L07", type: "slides", ranked: ["MATH117", "ECE150"] });

const renderZone = (courseHint?: string) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DropZone courseHint={courseHint} />
    </QueryClientProvider>,
  );

const drop = (...files: { name: string }[]) => {
  fireEvent.dragEnter(window, { dataTransfer: { types: ["Files"] } });
  fireEvent.drop(screen.getByTestId("observatory-drop"), { dataTransfer: { types: ["Files"], files } });
};

beforeEach(() => {
  vi.clearAllMocks();
  desktop = true;
  filedNames = new Set();
  outcome = { analysis: analysis(), filed };
});

describe("DropZone", () => {
  it("files PDFs chosen from the home drop box", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <DropZone box />
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByTestId("observatory-dropbox-input"), { target: { files: [pdf("L07.pdf")] } });
    await waitFor(() => expect(fileDrop).toHaveBeenCalledWith(expect.objectContaining({ name: "L07.pdf" }), expect.any(Array), { courseHint: undefined, typeHint: undefined }));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast.loading).toHaveBeenCalledWith("Processing L07.pdf…", { id: "observatory-processing" });
    expect(toast.dismiss).toHaveBeenCalledWith("observatory-processing");
  });

  it("shows one processing toast that names three files and counts the rest", async () => {
    renderZone();
    drop(pdf("a.pdf"), pdf("b.pdf"), pdf("c.pdf"), pdf("d.pdf"), pdf("e.pdf"));
    expect(toast.loading).toHaveBeenCalledWith("Processing a.pdf, b.pdf, c.pdf and 2 more…", { id: "observatory-processing" });
    await waitFor(() => expect(toast.dismiss).toHaveBeenCalledWith("observatory-processing"));
  });

  it("shows the overlay only for file drags", () => {
    renderZone();
    fireEvent.dragEnter(window, { dataTransfer: { types: ["text/plain"] } });
    expect(screen.queryByTestId("observatory-drop")).toBeNull();
    fireEvent.dragEnter(window, { dataTransfer: { types: ["Files"] } });
    expect(screen.getByText("Drop PDFs to file them")).toBeTruthy();
  });

  it("rejects non-PDFs and sorts each PDF on its own", async () => {
    renderZone("MATH117");
    drop(pdf("a.pdf"), pdf("notes.docx"), pdf("b.PDF"));
    await waitFor(() => expect(fileDrop).toHaveBeenCalledTimes(2));
    expect(toast.error).toHaveBeenCalledWith("Only PDF, PowerPoint and HTML files can be filed", { description: "notes.docx" });
    expect(fileDrop).toHaveBeenCalledWith(expect.objectContaining({ name: "a.pdf" }), expect.any(Array), { courseHint: "MATH117", typeHint: undefined });
  });

  it("converts slides and web pages to PDF before filing them", async () => {
    renderZone();
    drop(pdf("Week 1.pptx"), pdf("outline.html"));
    await waitFor(() => expect(fileDrop).toHaveBeenCalledTimes(2));
    expect(convertToPdf).toHaveBeenCalledWith("Week 1.pptx", expect.any(Uint8Array));
    expect(fileDrop).toHaveBeenCalledWith({ name: "Week 1.pdf", bytes: new Uint8Array([9]) }, expect.any(Array), expect.anything());
    expect(fileDrop).toHaveBeenCalledWith(expect.objectContaining({ name: "outline.pdf" }), expect.any(Array), expect.anything());
  });

  it("skips PDFs whose name is already filed or repeated in the drop", async () => {
    filedNames = new Set(["l07.pdf"]);
    renderZone();
    drop(pdf("L07.pdf"), pdf("L08.pdf"), pdf("l08.PDF"));
    await waitFor(() => expect(fileDrop).toHaveBeenCalledTimes(1));
    expect(fileDrop).toHaveBeenCalledWith(expect.objectContaining({ name: "L08.pdf" }), expect.any(Array), expect.anything());
    expect(toast).toHaveBeenCalledWith("Skipped PDFs that are already filed", { description: "L07.pdf, l08.PDF" });
  });

  it("shows the filed toast with Undo and Change", async () => {
    renderZone();
    drop(pdf("L07.pdf"));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Filed L07.pdf to MATH117 / lectures", expect.objectContaining({ duration: 5000 })));
    const opts = toast.mock.calls[0]![1];
    act(() => opts.cancel.onClick());
    fireEvent.click(await screen.findByRole("button", { name: /ECE150/ }));
    await waitFor(() => expect(moveResource).toHaveBeenCalledWith(filed.sidecar, "ECE150", "slides"));
    act(() => opts.action.onClick());
    expect(undoFile).not.toHaveBeenCalled();
    act(() => toast.mock.calls[1]![1].action.onClick());
    await waitFor(() => expect(undoFile).toHaveBeenCalledTimes(1));
  });

  it("opens the popup when the sorter is unsure, most likely course first", async () => {
    outcome = { analysis: analysis(), filed: null };
    renderZone();
    drop(pdf("L07.pdf"));
    const list = await screen.findByRole("list", { name: "Courses" });
    expect(list.textContent?.indexOf("MATH117")).toBeLessThan(list.textContent!.indexOf("ECE150"));
    fireEvent.click(screen.getByRole("button", { name: /MATH117/ }));
    await waitFor(() => expect(fileTo).toHaveBeenCalledWith(outcome.analysis, "MATH117", "slides"));
    expect(toast).toHaveBeenCalledWith("Filed L07.pdf to MATH117 / lectures", expect.anything());
  });

  it("marks the AI sort note accepted or dismissed by the course picked", async () => {
    outcome = { analysis: { ...analysis(), suggested: "MATH117", aiLog: "Observatory/MATH117/_ai/sort.md" }, filed: null };
    renderZone();
    drop(pdf("L07.pdf"));
    fireEvent.click(await screen.findByRole("button", { name: /MATH117/ }));
    await waitFor(() => expect(setAiOutputStatus).toHaveBeenCalledWith("Observatory/MATH117/_ai/sort.md", "accepted"));
    outcome = { analysis: { ...analysis("L08.pdf"), suggested: "MATH117", aiLog: "Observatory/MATH117/_ai/sort-2.md" }, filed: null };
    drop(pdf("L08.pdf"));
    fireEvent.click(await screen.findByRole("button", { name: /ECE150/ }));
    await waitFor(() => expect(setAiOutputStatus).toHaveBeenCalledWith("Observatory/MATH117/_ai/sort-2.md", "dismissed"));
  });

  it("files to _inbox on Skip and opens the course dialog from New course", async () => {
    outcome = { analysis: analysis(), filed: null };
    renderZone();
    drop(pdf("L07.pdf"));
    fireEvent.click(await screen.findByRole("button", { name: /New course/ }));
    fireEvent.click(screen.getByRole("button", { name: "course dialog" }));
    fireEvent.click(await screen.findByRole("button", { name: "Skip" }));
    await waitFor(() => expect(fileTo).toHaveBeenCalledWith(outcome.analysis, null, "slides"));
  });

  it("does not file on the web", () => {
    desktop = false;
    renderZone();
    drop(pdf("L07.pdf"));
    fireEvent.dragEnter(window, { dataTransfer: { types: ["Files"] } });
    expect(screen.getByText("Filing PDFs needs the desktop app")).toBeTruthy();
    expect(fileDrop).not.toHaveBeenCalled();
  });
});
