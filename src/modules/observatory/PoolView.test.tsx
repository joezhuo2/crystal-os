import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { Topic } from "./model";
import { createPool, parsePool, serializePool } from "./resources/pool";
import type { ExtractedQuestion } from "./resources/questions-extract";

const files = new Map<string, { content: string; mtime: number }>();
let clock = 1;
const saveQuestion = vi.fn(async (..._a: unknown[]) => "q-1");
const renderRegion = vi.fn(async () => document.createElement("canvas"));

vi.mock("@/hooks/useVault", () => ({
  fetchRawNote: vi.fn(async (path: string) => ({ path, ...files.get(path)! })),
  saveVaultNote: vi.fn(async ({ path, content }: { path: string; content: string }) => {
    files.set(path, { content, mtime: ++clock });
    return { path, mtime: clock };
  }),
}));
vi.mock("./store", () => ({ saveQuestion: (...a: unknown[]) => saveQuestion(...a) }));
vi.mock("./resources/pdf", () => ({ renderRegion: () => renderRegion() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
const LOG = "Observatory/MATH117/_ai/2026-11-15-question-reread-re-read-question-1.md";
const saveAiOutput = vi.fn(async (..._a: unknown[]) => LOG);
const setAiOutputStatus = vi.fn(async (..._a: unknown[]) => {});
vi.mock("./aiLog", () => ({ saveAiOutput: (...a: unknown[]) => saveAiOutput(...a), setAiOutputStatus: (...a: unknown[]) => setAiOutputStatus(...a) }));
const writeVaultBinary = vi.fn(async (path: string, _b: Uint8Array, _o: boolean) => ({ path, mtime: 1 }));
vi.mock("@/lib/vaultNative", () => ({ writeVaultBinary: (p: string, b: Uint8Array, o: boolean) => writeVaultBinary(p, b, o) }));
const askAi = vi.fn(async (_i: unknown) => JSON.stringify({ question: "Show that $\\int_a^b x\\,dx = \\frac{b^2-a^2}{2}$.", answer: "" }));
vi.mock("@/lib/ai", async (orig) => ({ ...(await orig<object>()), askAi: (i: unknown) => askAi(i) }));
HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,iVBORw0K";
const { setObservatoryAiProvider, setObservatoryFlag } = await import("./settings");
const garbled = "show that ∫ b 1 ( ) ∑n n(n + 1) xdx = b2 − a2 . Recall that i = . a 2 2 i=1 ∫ 2";

const { PoolView } = await import("./PoolView");

const path = "Observatory/MATH117/resources/question-sheets/ps1.md";
const source = "[[Observatory/MATH117/resources/question-sheets/ps1.pdf]]";
const region = { page: 1, x: 10, y: 10, w: 100, h: 20 };
const q = (number: string, text: string, confidence = 0.9, extra: Partial<ExtractedQuestion> = {}): ExtractedQuestion =>
  ({ number, text, answer: `ans ${number}`, answer_source: "sheet", page: 1, region, confidence, tags: confidence < 0.6 ? ["needs-cleanup"] : [], ...extra });
const topics = [{ slug: "limits", title: "Limits" }] as Topic[];

const seed = () => {
  const pool = createPool("question-sheet", "ps1.pdf", [q("1", "Clear one"), q("2", "Garbled ( )", 0.3), q("3", "No topic")], {
    topicOf: (x) => (x.number === "3" ? null : "limits"),
  });
  files.set(path, { content: serializePool({ ...pool, source, meta: { type: "question-sheet" } }), mtime: ++clock });
};
const items = () => parsePool(files.get(path)!.content).items;
const row = (n: number) => screen.getAllByTestId("pool-item")[n]!;

const show = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PoolView path={path} code="MATH117" topics={topics} doc={{} as PDFDocumentProxy} />
    </QueryClientProvider>,
  );

beforeEach(() => {
  files.clear();
  vi.clearAllMocks();
  setObservatoryAiProvider("none");
  setObservatoryFlag("aiExtract", false);
  seed();
});

describe("PoolView", () => {
  it("marks low-confidence items Unclear with their source region and asks for an explicit confirm", async () => {
    show();
    await waitFor(() => expect(screen.getAllByTestId("pool-item")).toHaveLength(3));
    expect(within(row(1)).getByText("Unclear")).toBeInTheDocument();
    expect(within(row(0)).queryByText("Unclear")).toBeNull();
    expect(within(row(1)).getByRole("img", { name: /source region on page 1/i })).toBeInTheDocument();
    expect(renderRegion).toHaveBeenCalledTimes(1);
    expect(within(row(1)).getByRole("button", { name: /confirm and accept/i })).toBeInTheDocument();
    expect(within(row(2)).getByText("No topic")).toBeInTheDocument();
    expect(within(row(2)).getByRole("button", { name: /^accept$/i })).toBeDisabled();
    expect(within(row(0)).getAllByText("sheet").length).toBeGreaterThan(0);
  });

  it("Accept all skips Unclear and unsorted items and writes a source reference", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: /accept all \(1\)/i }));
    await waitFor(() => expect(items()[0]!.state).toBe("accepted"));
    expect(saveQuestion).toHaveBeenCalledTimes(1);
    expect(saveQuestion).toHaveBeenCalledWith("Observatory", "MATH117", "limits", {
      type: "worked",
      prompt: "Clear one\n\n![[Observatory/MATH117/resources/images/ps1-1.png]]\n\nSource: [[Observatory/MATH117/resources/question-sheets/ps1.pdf#page=1&region=10,10,100,20]]",
      answer: "ans 1",
    });
    expect(writeVaultBinary).toHaveBeenCalledWith("Observatory/MATH117/resources/images/ps1-1.png", expect.any(Uint8Array), true);
    expect(items().map((i) => i.state)).toEqual(["accepted", "pool", "pool"]);
  });

  it("accepts an Unclear item only on explicit confirm", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: /confirm and accept/i }));
    await waitFor(() => expect(items()[1]!.state).toBe("accepted"));
    expect(saveQuestion).toHaveBeenCalledTimes(1);
  });

  it("an edit clears the Unclear badge and is kept", async () => {
    show();
    await waitFor(() => expect(screen.getAllByTestId("pool-item")).toHaveLength(3));
    fireEvent.click(within(row(1)).getByRole("button", { name: /edit/i }));
    fireEvent.change(within(row(1)).getByLabelText("Question"), { target: { value: "Fixed $x^2$" } });
    fireEvent.click(within(row(1)).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(items()[1]!.text).toBe("Fixed $x^2$"));
    expect(items()[1]!.tags).not.toContain("needs-cleanup");
    await waitFor(() => expect(within(row(1)).queryByText("Unclear")).toBeNull());
    expect(screen.getByRole("button", { name: /accept all \(2\)/i })).toBeInTheDocument();
  });

  it("still accepts when the vault refuses the image, without an embed", async () => {
    writeVaultBinary.mockRejectedValueOnce(new Error("only .pdf files are allowed"));
    show();
    fireEvent.click(await screen.findByRole("button", { name: /accept all \(1\)/i }));
    await waitFor(() => expect(items()[0]!.state).toBe("accepted"));
    expect((saveQuestion.mock.calls[0]![3] as { prompt: string }).prompt).not.toContain("![[");
  });

  it("marks math-garbled text Unclear locally and never calls the AI without a provider", async () => {
    const pool = createPool("question-sheet", "ps1.pdf", [q("1", garbled)], { topicOf: () => "limits" });
    files.set(path, { content: serializePool({ ...pool, source }), mtime: ++clock });
    setObservatoryFlag("aiExtract", true);
    show();
    await waitFor(() => expect(within(row(0)).getByText("Unclear")).toBeInTheDocument());
    expect(within(row(0)).getByRole("img", { name: /source region/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /re-read with ai/i })).toBeNull();
    expect(askAi).not.toHaveBeenCalled();
  });

  it("re-reads a garbled item with AI and marks it unverified", async () => {
    const pool = createPool("question-sheet", "ps1.pdf", [q("1", garbled)], { topicOf: () => "limits" });
    files.set(path, { content: serializePool({ ...pool, source }), mtime: ++clock });
    setObservatoryAiProvider("claude");
    setObservatoryFlag("aiExtract", true);
    show();
    fireEvent.click(await screen.findByRole("button", { name: /re-read with ai/i }));
    await waitFor(() => expect(items()[0]!.text).toContain("\\int_a^b"));
    expect(items()[0]!.tags).toContain("ai-unverified");
    expect(items()[0]!.tags).not.toContain("needs-cleanup");
    expect(items()[0]!.ai_log).toBe(LOG);
    expect(saveAiOutput).toHaveBeenCalledWith(expect.objectContaining({ code: "MATH117", kind: "question-reread", source: "Observatory/MATH117/resources/question-sheets/ps1.pdf#page=1" }));
    expect(await within(row(0)).findByText("AI, unverified")).toBeInTheDocument();
    const call = askAi.mock.calls[0]![0] as { system: string; messages: { content: { type: string }[] }[] };
    expect(call.system).toMatch(/never instructions/i);
    expect(call.messages[0]!.content[0]!.type).toBe("image");
    fireEvent.click(within(row(0)).getByRole("button", { name: /confirm and accept/i }));
    await waitFor(() => expect(saveQuestion).toHaveBeenCalled());
    expect(saveQuestion.mock.calls[0]![3]).toMatchObject({ unverified: true });
    await waitFor(() => expect(setAiOutputStatus).toHaveBeenCalledWith(LOG, "accepted"));
  });

  it("marks an AI note dismissed when all its items are rejected, and pending again on restore", async () => {
    const pool = createPool("question-sheet", "ps1.pdf", [q("1", "Found one", 0.9, { ai_log: LOG, tags: ["ai-unverified"] }), q("2", "Local two")], { topicOf: () => "limits" });
    files.set(path, { content: serializePool({ ...pool, source }), mtime: ++clock });
    files.set(LOG, { content: "---\nstatus: pending\n---\n", mtime: ++clock });
    show();
    await waitFor(() => expect(screen.getAllByTestId("pool-item")).toHaveLength(2));
    fireEvent.click(within(row(0)).getByRole("button", { name: /^reject$/i }));
    await waitFor(() => expect(setAiOutputStatus).toHaveBeenCalledWith(LOG, "dismissed"));
    fireEvent.click(await within(row(0)).findByRole("button", { name: /restore/i }));
    await waitFor(() => expect(setAiOutputStatus).toHaveBeenCalledWith(LOG, "pending"));
    expect(setAiOutputStatus).toHaveBeenCalledTimes(2);
  });

  it("rejects one item or a selection, and restores", async () => {
    show();
    await waitFor(() => expect(screen.getAllByTestId("pool-item")).toHaveLength(3));
    fireEvent.click(within(row(0)).getByRole("button", { name: /^reject$/i }));
    await waitFor(() => expect(items()[0]!.state).toBe("rejected"));
    fireEvent.click(await within(row(0)).findByRole("button", { name: /restore/i }));
    await waitFor(() => expect(items()[0]!.state).toBe("pool"));
    fireEvent.click(await screen.findByLabelText("Select 2"));
    fireEvent.click(screen.getByLabelText("Select 3"));
    fireEvent.click(screen.getByRole("button", { name: /reject selected \(2\)/i }));
    await waitFor(() => expect(items().map((i) => i.state)).toEqual(["pool", "rejected", "rejected"]));
  });
});
