import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { questionSource, type QuestionDraft } from "./questions";

const saveQuestion = vi.fn(async (..._a: unknown[]) => "q-1");
const readVaultBinary = vi.fn(async (_p: string) => new Uint8Array([1, 2, 3]).buffer);
const askAi = vi.fn(async (_i: unknown) => JSON.stringify({ question: "Show that $\\int_a^b x\\,dx = \\frac{b^2-a^2}{2}$.", answer: "Use $\\frac{x^2}{2}$." }));
vi.mock("./store", () => ({ saveQuestion: (...a: unknown[]) => saveQuestion(...a) }));
vi.mock("@/lib/vaultNative", () => ({ readVaultBinary: (p: string) => readVaultBinary(p) }));
vi.mock("@/lib/ai", async (orig) => ({ ...(await orig<object>()), askAi: (i: unknown) => askAi(i) }));
vi.mock("./resources/pdf", () => ({ renderRegion: vi.fn(), renderPage: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), warning: vi.fn() } }));
const saveAiOutput = vi.fn(async (..._a: unknown[]) => "Observatory/MATH117/_ai/2026-11-15-question-reread-q-1.md");
vi.mock("./aiLog", () => ({ saveAiOutput: (...a: unknown[]) => saveAiOutput(...a), setAiOutputStatus: vi.fn() }));
URL.createObjectURL = vi.fn(() => "blob:q");
URL.revokeObjectURL = vi.fn();

const { CardSource } = await import("./CardSource");
const { setObservatoryAiProvider, setObservatoryFlag } = await import("./settings");

const tail = "![[Observatory/MATH117/resources/images/ps1-1.png]]\n\nSource: [[Observatory/MATH117/ps1.pdf#page=1&region=1,2,3,4]]";
const prompt = `show that ∫ b 1 ( ) ∑n n(n + 1) xdx = b2 − a2 . Recall that i = . a 2 2 i=1 ∫ 2\n\n${tail}`;
const question: QuestionDraft = { id: "q-1", type: "worked", prompt, answer: "" };
const onChange = vi.fn();
const show = (q = question) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CardSource code="MATH117" slug="integrals" question={q} src={questionSource(q.prompt)} onChange={onChange} />
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  setObservatoryAiProvider("none");
  setObservatoryFlag("aiExtract", true);
});

describe("CardSource", () => {
  it("shows the source image right away for garbled text, and no AI action without a provider", async () => {
    show();
    expect(screen.getByRole("button", { name: /hide source/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("img", { name: "Question source" })).toHaveAttribute("src", "blob:q"));
    expect(screen.queryByRole("button", { name: /re-read with ai/i })).toBeNull();
  });

  it("keeps the source one click away for clean text", () => {
    show({ ...question, prompt: `Show that $x^2 \\ge 0$.\n\n${tail}`, unverified: true });
    expect(screen.getByText("AI, unverified")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Question source" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /show source/i }));
    expect(screen.getByRole("img", { name: "Question source" })).toBeInTheDocument();
  });

  it("re-reads the question image with AI and saves it marked unverified, keeping the source", async () => {
    setObservatoryAiProvider("claude");
    show();
    fireEvent.click(screen.getByRole("button", { name: /re-read with ai/i }));
    await waitFor(() => expect(saveQuestion).toHaveBeenCalled());
    expect(saveQuestion).toHaveBeenCalledWith("Observatory", "MATH117", "integrals", {
      id: "q-1",
      type: "worked",
      prompt: `Show that $\\int_a^b x\\,dx = \\frac{b^2-a^2}{2}$.\n\n${tail}`,
      answer: "Use $\\frac{x^2}{2}$.",
      unverified: true,
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ unverified: true }));
    expect(saveAiOutput).toHaveBeenCalledWith(expect.objectContaining({ code: "MATH117", kind: "question-reread", status: "applied", source: "Observatory/MATH117/ps1.pdf#page=1", provider: "claude" }));
    expect((askAi.mock.calls[0]![0] as { messages: { content: { type: string; data: string }[] }[] }).messages[0]!.content[0]).toMatchObject({ type: "image", data: "AQID" });
  });

  it("makes no AI call with the extraction switch off", () => {
    setObservatoryAiProvider("claude");
    setObservatoryFlag("aiExtract", false);
    show();
    expect(screen.queryByRole("button", { name: /re-read with ai/i })).toBeNull();
  });
});
