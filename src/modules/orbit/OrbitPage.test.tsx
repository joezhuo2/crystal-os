import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { act, fireEvent, render as rtlRender, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { buildReview, type ReviewKind, type ReviewPeriod } from "@/lib/orbitReview";
import type { OrbitReviewResult } from "@/hooks/useOrbitReview";
import { orbitStore } from "@/lib/orbitStore";

const now = new Date("2026-10-14T12:00:00");
let still = false;
const status: Record<ReviewKind, "loading" | "ready"> = { weekly: "ready", monthly: "ready", yearly: "ready" };

const result = (period: ReviewPeriod): OrbitReviewResult => {
  const loading = status[period.kind] === "loading";
  return {
    review: loading
      ? null
      : buildReview(period, { completions: [], focus: [], tasks: [], transactions: [], notes: [], events: [], today: "2026-10-14" }),
    loading,
    historyError: null,
    vaultUnavailable: false,
    calendarConnected: false,
  };
};

vi.mock("@/hooks/useOrbitReview", () => ({
  useNow: () => now,
  useOrbitReview: (period: ReviewPeriod) => result(period),
  OrbitHistoryError: class extends Error {},
}));
vi.mock("@/lib/appActivity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/appActivity")>()),
  useAppActivity: () => ({ visible: true, still }),
}));
// The Today and Mood cards read the vault; not under test here.
vi.mock("@/modules/orbit/TodayCard", () => ({ TodayCard: () => null }));
vi.mock("@/modules/orbit/MoodCard", () => ({ MoodCard: () => null }));
vi.mock("@/hooks/useVault", () => ({ useCreateNote: () => ({ mutate: vi.fn(), isPending: false }), vaultErrorCode: () => null }));
vi.mock("@/hooks/useShortcut", () => ({ useShortcut: () => {} }));

const { default: OrbitPage } = await import("./OrbitPage");

/** The cards carry GlassTips, which need the app's TooltipProvider. */
const wrap = (ui: ReactElement) => <TooltipProvider>{ui}</TooltipProvider>;
const render = (ui: ReactElement) => {
  const view = rtlRender(wrap(ui));
  return { ...view, rerender: (next: ReactElement) => view.rerender(wrap(next)) };
};

const skeleton = () => screen.queryByRole("status", { name: "Loading the review" });
const tasksCard = () => screen.queryByRole("region", { name: "Tasks" });

describe("The Orbit loading skeleton", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    orbitStore._reload();
    still = false;
    status.weekly = status.monthly = status.yearly = "ready";
  });
  afterEach(() => vi.useRealTimers());

  it("shows on opening the page until the review is in", () => {
    status.weekly = "loading";
    const { rerender } = render(<OrbitPage />);
    expect(skeleton()).toBeTruthy();
    expect(tasksCard()).toBeNull();

    status.weekly = "ready";
    rerender(<OrbitPage />);
    expect(skeleton()).toBeNull();
    expect(tasksCard()).toBeTruthy();
  });

  it("replaces the old review after it fades out when switching to one still loading", () => {
    status.yearly = "loading";
    const { rerender } = render(<OrbitPage />);
    expect(tasksCard()).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Yearly" }));
    // The old review is still fading out.
    expect(skeleton()).toBeNull();
    act(() => vi.advanceTimersByTime(200));
    expect(skeleton()).toBeTruthy();
    expect(tasksCard()).toBeNull();
    expect(screen.getByText(/Yearly review/)).toBeTruthy();

    status.yearly = "ready";
    rerender(<OrbitPage />);
    expect(skeleton()).toBeNull();
    expect(tasksCard()).toBeTruthy();
  });

  it("shows at once in performance mode", () => {
    still = true;
    status.monthly = "loading";
    render(<OrbitPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Monthly" }));
    expect(skeleton()).toBeTruthy();
  });

  it("does not show when switching to a review already loaded", () => {
    render(<OrbitPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Monthly" }));
    act(() => vi.advanceTimersByTime(200));
    expect(skeleton()).toBeNull();
    expect(tasksCard()).toBeTruthy();
  });
});
