import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Course } from "./model";
import type { Resource } from "./resources/ingest";

const undoToast = vi.fn();
const resource: Resource = { sidecar: "Observatory/_inbox/l07.md", pdf: "Observatory/_inbox/l07.pdf", name: "l07.pdf", title: "MATH117 L07", type: "other", added: "2026-11-15", processed: false };
let resources: Resource[] = [resource];
const moveResource = vi.fn(async (sidecar: string, code: string | null, type: string) => ({ code, type, sidecar, pdf: "x.pdf" }));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/lib/undo", () => ({ undoToast: (...a: unknown[]) => undoToast(...a) }));
vi.mock("@/lib/platform", async (orig) => ({ ...(await orig<typeof import("@/lib/platform")>()), isDesktop: () => true }));
vi.mock("./resources/ingest", async (orig) => ({
  ...(await orig<typeof import("./resources/ingest")>()),
  useResources: () => ({ resources, loading: false }),
  moveResource: (...a: [string, string | null, string]) => moveResource(...a),
}));

Element.prototype.scrollIntoView = vi.fn();

const { InboxView } = await import("./InboxView");

const course = (code: string): Course =>
  ({ code, name: `${code} name`, term: "2026F", color: "red", keywords: [], outcomes: [], exams: [], assessments: [], archived: false }) as Course;

const renderInbox = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <InboxView courses={[course("ECE150"), course("MATH117")]} onClose={() => {}} />
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  resources = [resource];
});

describe("InboxView", () => {
  it("files an unsorted PDF through the popup, likely course first, with Undo", async () => {
    renderInbox();
    fireEvent.click(screen.getByRole("button", { name: "File…" }));
    const list = await screen.findByRole("list", { name: "Courses" });
    expect(list.textContent!.indexOf("MATH117")).toBeLessThan(list.textContent!.indexOf("ECE150"));
    fireEvent.click(screen.getByRole("button", { name: /MATH117/ }));
    await waitFor(() => expect(moveResource).toHaveBeenCalledWith(resource.sidecar, "MATH117", "other"));
    await waitFor(() => expect(undoToast).toHaveBeenCalledWith("Filed l07.pdf to MATH117 / other", expect.any(Function)));
    undoToast.mock.calls[0]![1]();
    expect(moveResource).toHaveBeenLastCalledWith(resource.sidecar, null, "other");
  });

  it("moves straight to a course from Move to", async () => {
    renderInbox();
    fireEvent.click(screen.getByRole("combobox", { name: "Move l07.pdf to" }));
    fireEvent.click(await screen.findByRole("option", { name: "ECE150" }));
    await waitFor(() => expect(moveResource).toHaveBeenCalledWith(resource.sidecar, "ECE150", "other"));
  });

  it("says when nothing is waiting", () => {
    resources = [];
    renderInbox();
    expect(screen.getByText("Nothing waiting to be sorted")).toBeTruthy();
  });
});
