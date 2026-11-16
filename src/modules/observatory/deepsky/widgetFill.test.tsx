import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { topicFromData } from "../model";

const summary = { loading: false, hasCourses: true, due: 0, next: null, stats: { today: 0, goal: 3, streak: 0, met: false }, exam: null, examDays: null };
const sky = [topicFromData({ course: "DeepSky", title: "Tides" }, "tides", "> [!question] q-1\n> Why?\n>> [!answer]-\n>> Moon")];

vi.mock("../useStudySummary", () => ({ useStudySummary: () => summary }));
vi.mock("../useDropFiling", () => ({ useDropFiling: () => ({ handle: vi.fn(), reading: 0, popup: null }) }));
vi.mock("@/lib/appActivity", async (orig) => ({ ...(await orig<typeof import("@/lib/appActivity")>()), useAppActivity: () => ({ visible: true, still: true }) }));
vi.mock("../useObservatory", () => ({
  useCourses: () => ({ courses: [], loading: false, error: null }),
  useCoursesTopics: (codes: string[]) => ({ topics: codes.includes("DeepSky") ? sky : [], loading: false }),
  useTopicBodies: (t: unknown[]) => ({ topics: t, loading: false }),
  useProgress: () => ({ progress: {}, loading: false }),
}));

const settings = await import("../settings");
const { ObservatoryWidget } = await import("../ObservatoryWidget");

const renderWidget = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ObservatoryWidget />
    </QueryClientProvider>,
  );

beforeEach(() => {
  summary.due = 0;
});

describe("Deep Sky on the Home widget", () => {
  it("draws the next observation from Deep Sky once course cards are done", () => {
    settings.setObservatoryFlag("deepSkyFillHome", true);
    renderWidget();
    expect(screen.getByText(/Next: Tides/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /review/i })).toBeTruthy();
  });

  it("stays on course cards while any are due, and when the setting is off", () => {
    settings.setObservatoryFlag("deepSkyFillHome", true);
    summary.due = 2;
    const { unmount } = renderWidget();
    expect(screen.queryByText(/Tides/)).toBeNull();
    unmount();
    settings.setObservatoryFlag("deepSkyFillHome", false);
    summary.due = 0;
    renderWidget();
    expect(screen.queryByText(/Tides/)).toBeNull();
  });
});
