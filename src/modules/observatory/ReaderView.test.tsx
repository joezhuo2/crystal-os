import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Resource } from "./resources/ingest";

const R = "Observatory/MATH117/resources/textbooks/calc";
const book = `---\ntype: textbook\nsource: "[[${R}/book.pdf]]"\ntitle: Calculus\nchapters:\n  - {number: '1', title: Limits, start: 1, end: 1}\n  - {number: '2', title: Derivatives, start: 2, end: 2}\nneeds_ocr: [2]\n---\n`;

vi.mock("@/hooks/useVault", () => ({ fetchRawNote: vi.fn(async (path: string) => ({ path, content: book, mtime: 1 })) }));
vi.mock("@/lib/vaultNative", async (orig) => ({ ...(await orig<object>()), readVaultBinary: vi.fn(async () => new ArrayBuffer(4)) }));
vi.mock("./resources/pdf", () => ({
  openPdf: vi.fn(async () => ({ numPages: 2, loadingTask: { destroy: vi.fn(async () => {}) } })),
  renderPage: vi.fn(async () => document.createElement("canvas")),
}));
vi.mock("./resources/ocr", () => ({ ocrPage: vi.fn(async () => ({ text: "F = ma scribble", confidence: 0.3, words: [] })) }));
vi.mock("./PoolView", () => ({ PoolView: ({ path }: { path: string }) => <p>Pool {path}</p> }));

const { ReaderView } = await import("./ReaderView");

const resource: Resource = { sidecar: `${R}/_book.md`, pdf: `${R}/book.pdf`, name: "calc.pdf", title: "Calculus", type: "textbook", added: null, processed: true };

const drawSpy = (ctx: { mock: { results: { value: unknown }[] } }) =>
  ctx.mock.results.reduce((n, r) => n + (r.value as { drawImage: { mock: { calls: unknown[] } } }).drawImage.mock.calls.length, 0);

describe("ReaderView", () => {
  it("shows pages, a chapter dropdown, the chapter's questions and Unclear OCR text for scanned pages", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ReaderView resource={resource} code="MATH117" topics={[]} onBack={() => {}} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("1. Limits (pp. 1-1)")).toBeInTheDocument();
    expect(screen.getByText(`Pool ${R}/chapters/ch01.md`)).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole("img", { name: /^page \d$/i })).toHaveLength(2));
    expect(await screen.findByText("F = ma scribble")).toBeInTheDocument();
    expect(screen.getByText("Unclear")).toBeInTheDocument();
  });

  it("fills the window on Full screen and leaves it on Escape", async () => {
    Element.prototype.scrollIntoView ??= () => {};
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <ReaderView resource={resource} code="MATH117" topics={[]} onBack={() => {}} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getAllByRole("img", { name: /^page \d$/i })).toHaveLength(2));
    fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
    expect(container.firstElementChild).toHaveClass("fixed");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Full screen" })).toBeInTheDocument();
    expect(container.firstElementChild).not.toHaveClass("fixed");
  });

  it("zooms the pages on Ctrl + scroll and toggles full screen on F", async () => {
    Element.prototype.scrollIntoView ??= () => {};
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <ReaderView resource={resource} code="MATH117" topics={[]} onBack={() => {}} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getAllByRole("img", { name: /^page \d$/i })).toHaveLength(2));
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => window.setTimeout(() => cb(0), 0));
    const page = container.querySelector("[data-page]")!;
    fireEvent.wheel(page, { deltaY: -100 });
    expect(screen.queryByRole("button", { name: "Reset zoom" })).toBeNull();
    fireEvent.wheel(page, { deltaY: -100, ctrlKey: true });
    await waitFor(() => expect(screen.getByRole("button", { name: "Reset zoom" })).toHaveTextContent("111%"), { timeout: 10000 });
    fireEvent.click(screen.getByRole("button", { name: "Reset zoom" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Reset zoom" })).toBeNull(), { timeout: 10000 });
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Reset zoom" })).toHaveTextContent("125%"), { timeout: 10000 });
    fireEvent.keyDown(document, { code: "Minus" });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Reset zoom" })).toBeNull(), { timeout: 10000 });
    vi.unstubAllGlobals();
    fireEvent.keyDown(document, { code: "KeyF" });
    expect(container.firstElementChild).toHaveClass("fixed");
  }, 40000);

  it("captures a dragged box for the AI panel and folds the panels", async () => {
    const rect = vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200, x: 0, y: 0, toJSON: () => ({}) });
    const ctx = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ fillRect: vi.fn(), drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    const url = vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/jpeg;base64,AAAA");
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <ReaderView resource={resource} code="MATH117" topics={[]} onBack={() => {}} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(container.querySelectorAll("[data-canvas] canvas")).toHaveLength(2));
    const page = container.querySelector("[data-page]")!;
    fireEvent.mouseDown(page, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.mouseMove(window, { clientX: 12, clientY: 12 });
    fireEvent.mouseUp(window);
    expect(drawSpy(ctx)).toBe(0);
    fireEvent.mouseDown(page, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.mouseMove(window, { clientX: 90, clientY: 70 });
    fireEvent.mouseUp(window);
    expect(drawSpy(ctx)).toBeGreaterThan(0);
    const ai = screen.getByRole("button", { name: "AI" });
    expect(ai).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(ai);
    expect(ai).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /^Questions/ })).toHaveAttribute("aria-expanded", "true");
    rect.mockRestore();
    ctx.mockRestore();
    url.mockRestore();
  });
});
