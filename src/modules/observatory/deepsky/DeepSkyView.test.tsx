import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const files = new Map<string, { content: string; mtime: number }>();
let listed: object[] = [];
let clock = 1;
const put = (path: string, content: string) => {
  files.set(path, { content, mtime: ++clock });
  return { path, mtime: clock };
};
const createVaultNote = vi.fn(async ({ path, content }: { path: string; content: string }) => ({ ...put(path, content), created: true }));
const askAi = vi.fn();

vi.mock("../useObservatory", () => ({
  useCoursesTopics: () => ({ topics: [], loading: false }),
  useTopicBodies: (topics: unknown[]) => ({ topics, loading: false }),
  useProgress: () => ({ progress: {}, loading: false }),
}));
vi.mock("@/hooks/useVault", () => ({
  vaultErrorCode: (e: { code?: string }) => e?.code ?? null,
  fetchRawNote: vi.fn(async (path: string) => {
    const f = files.get(path);
    if (!f) throw Object.assign(new Error("missing"), { code: "not_found" });
    return { path, ...f };
  }),
  createVaultNote: (input: { path: string; content: string }) => createVaultNote(input),
  saveVaultNote: vi.fn(async ({ path, content }: { path: string; content: string }) => put(path, content)),
  useVaultNotes: () => ({ data: { notes: listed }, isLoading: false }),
}));
vi.mock("@/lib/ai", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/ai")>()), askAi: (...a: unknown[]) => askAi(...a) }));
vi.mock("@/lib/appActivity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/appActivity")>()),
  useAppActivity: () => ({ visible: true, still: true }),
}));
vi.mock("@/hooks/useShortcut", () => ({ useShortcut: () => {} }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), warning: vi.fn() }) }));

const settings = await import("../settings");
const { DeepSkyView } = await import("./DeepSkyView");

const renderView = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DeepSkyView courses={[]} />
    </QueryClientProvider>,
  );

const aiPath = (kind: string, slug: string) => new RegExp(`^Observatory/DeepSky/_ai/\\d{4}-\\d{2}-\\d{2}-${kind}-${slug}\\.md$`);
const created = (re: RegExp) => [...files.keys()].find((p) => re.test(p));
const status = (path: string | undefined) => /^status: (\w+)$/m.exec(files.get(path ?? "")?.content ?? "")?.[1];

beforeEach(() => {
  vi.clearAllMocks();
  files.clear();
  listed = [];
  settings.setObservatoryAiProvider("claude");
  settings.setObservatoryFlag("deepSkyRandom", true);
  settings.setObservatoryFlag("deepSkyProjects", false);
  settings.setObservatoryFlag("aiDraft", false);
});

describe("DeepSkyView", () => {
  it("hides AI sources when the provider is None", () => {
    settings.setObservatoryAiProvider("none");
    renderView();
    expect(screen.queryByRole("button", { name: /random ideas/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /suggest from my projects/i })).toBeNull();
    expect(screen.getByRole("button", { name: /add topic/i })).toBeTruthy();
    expect(askAi).not.toHaveBeenCalled();
  });

  it("records each suggestion in _ai, writes a topic only after Add and remembers not interested", async () => {
    askAi.mockResolvedValue(JSON.stringify({ topics: [{ title: "Tides", summary: "Why the sea moves" }, { title: "Knitting", summary: "Loops" }] }));
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /random ideas/i }));
    await screen.findByText("Tides");
    const tides = created(aiPath("random-idea", "tides"));
    const knitting = created(aiPath("random-idea", "knitting"));
    expect(status(tides)).toBe("pending");
    expect(files.get(knitting!)!.content).toContain("# Knitting\n\nLoops");
    expect(created(/topics\//)).toBeUndefined();

    fireEvent.click(screen.getAllByRole("button", { name: /not interested/i })[1]!);
    await waitFor(() => expect(status(knitting)).toBe("dismissed"));
    expect(files.get("Observatory/DeepSky/_deepsky.md")!.content).toContain("- Knitting");
    await waitFor(() => expect(screen.queryByText("Knitting")).toBeNull());
    const add = screen.getByRole("button", { name: /^add$/i }) as HTMLButtonElement;
    await waitFor(() => expect(add.disabled).toBe(false));

    fireEvent.click(add);
    await waitFor(() => expect(files.has("Observatory/DeepSky/topics/tides.md")).toBe(true));
    await waitFor(() => expect(status(tides)).toBe("accepted"));
  });

  it("dismiss marks the record dismissed without writing a topic", async () => {
    askAi.mockResolvedValue(JSON.stringify({ topics: [{ title: "Tides", summary: "" }] }));
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /random ideas/i }));
    await screen.findByText("Tides");
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    await waitFor(() => expect(screen.queryByText("Tides")).toBeNull());
    await waitFor(() => expect(status(created(aiPath("random-idea", "tides")))).toBe("dismissed"));
    expect(created(/topics\//)).toBeUndefined();
  });

  it("reloads pending suggestions from _ai notes and accepts one", async () => {
    settings.setObservatoryAiProvider("none");
    const pending = "Observatory/DeepSky/_ai/2026-11-14-project-suggestion-load-paths.md";
    put(pending, "---\nkind: project suggestion\ntitle: Load paths\nstatus: pending\n---\n# Load paths\n\nHow forces travel through a truss\n");
    listed = [
      { path: pending, title: "Load paths", status: "pending", frontmatter: { kind: "project suggestion" }, mtime: 2 },
      { path: "Observatory/DeepSky/_ai/2026-11-14-random-idea-old.md", title: "Old idea", status: "dismissed", frontmatter: { kind: "random idea" }, mtime: 1 },
      { path: "Observatory/DeepSky/_ai/2026-11-14-draft-cards-x.md", title: "Cards", status: "pending", frontmatter: { kind: "draft cards" }, mtime: 1 },
    ];
    renderView();
    expect(await screen.findByText("Load paths")).toBeTruthy();
    expect(await screen.findByText("How forces travel through a truss")).toBeTruthy();
    expect(screen.getByText("From your projects")).toBeTruthy();
    expect(screen.queryByText("Old idea")).toBeNull();
    expect(screen.queryByText("Cards")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    await waitFor(() => expect(files.get("Observatory/DeepSky/topics/load-paths.md")?.content).toContain("How forces travel through a truss"));
    await waitFor(() => expect(status(pending)).toBe("accepted"));
    expect(askAi).not.toHaveBeenCalled();
  });

  it("records drafted cards and marks them applied once written", async () => {
    settings.setObservatoryFlag("aiDraft", true);
    askAi.mockResolvedValue(JSON.stringify({ questions: [{ type: "card", text: "Why tides?", answer: "The Moon" }] }));
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /add topic/i }));
    fireEvent.change(screen.getByLabelText("Topic"), { target: { value: "Tides" } });
    fireEvent.click(screen.getByRole("button", { name: /add and draft cards/i }));
    await waitFor(() => expect(files.get("Observatory/DeepSky/topics/tides.md")?.content).toContain("Why tides?"));
    const log = created(aiPath("draft-cards", "tides"));
    expect(files.get(log!)!.content).toContain("Why tides?");
    await waitFor(() => expect(status(log)).toBe("applied"));
  });
});
