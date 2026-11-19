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
});
