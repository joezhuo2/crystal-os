import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { topicFromData, type Course, type Topic } from "./model";

const course = { code: "MATH117", name: "Calculus", term: "2026F", color: "red", keywords: [], outcomes: [], exams: [], assessments: [], archived: false } as Course;
let topics: Topic[] = [];
const handle = vi.fn();
const recordReview = vi.fn(async () => ({}));
const recordObservation = vi.fn(async () => ({}));
const summary = { loading: false, hasCourses: true, due: 1, next: null, stats: { today: 0, goal: 3, streak: 0, met: false }, exam: null, examDays: null };

vi.mock("./useStudySummary", () => ({ useStudySummary: () => summary }));
vi.mock("./useDropFiling", () => ({ useDropFiling: () => ({ handle, reading: 0, popup: null }) }));
vi.mock("@/lib/platform", async (orig) => ({ ...(await orig<typeof import("@/lib/platform")>()), isDesktop: () => true }));
vi.mock("@/lib/appActivity", async (orig) => ({ ...(await orig<typeof import("@/lib/appActivity")>()), useAppActivity: () => ({ visible: true, still: true }) }));
vi.mock("./focus", () => ({ requestFocus: vi.fn(), releaseFocus: vi.fn() }));
vi.mock("./useObservatory", () => ({
  useCourses: () => ({ courses: [{ course, path: "" }], loading: false, error: null }),
  useCoursesTopics: () => ({ topics, loading: false }),
  useTopicBodies: (t: Topic[]) => ({ topics: t, loading: false }),
  useProgress: () => ({ progress: {}, loading: false }),
}));
vi.mock("./srs", async (orig) => ({
  ...(await orig<typeof import("./srs")>()),
  recordReview: (...a: unknown[]) => recordReview(...(a as [])),
  recordObservation: (...a: unknown[]) => recordObservation(...(a as [])),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const { ObservatoryWidget } = await import("./ObservatoryWidget");

const renderWidget = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ObservatoryWidget />
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  summary.hasCourses = true;
  topics = [topicFromData({ course: "MATH117", title: "Limits", priority: "high" }, "limits", "> [!question] q-1\n> What is a limit?\n>> [!answer]-\n>> The value approached.")];
});

describe("ObservatoryWidget", () => {
  it("files dropped PDFs through the ingest path and shows a drag-over state", () => {
    renderWidget();
    const card = screen.getByTestId("observatory-widget");
    const file = { name: "L07.pdf" };
    fireEvent.dragEnter(card, { dataTransfer: { types: ["Files"] } });
    expect(screen.getByTestId("observatory-widget-drop")).toBeTruthy();
    fireEvent.drop(card, { dataTransfer: { types: ["Files"], files: [file] } });
    expect(handle).toHaveBeenCalledWith([file]);
    expect(screen.queryByTestId("observatory-widget-drop")).toBeNull();
  });

  it("reviews inline, grades with a key and exits back to the summary", async () => {
    renderWidget();
    fireEvent.click(screen.getByRole("button", { name: /review/i }));
    expect(await screen.findByText("What is a limit?")).toBeTruthy();
    fireEvent.keyDown(document, { code: "Space" });
    fireEvent.keyDown(document, { code: "Digit3" });
    await waitFor(() => expect(recordReview).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole("button", { name: "Done" }));
    expect(screen.getByText(/to review/)).toBeTruthy();
  });

  it("ignores review keys once focus leaves the card", async () => {
    renderWidget();
    fireEvent.click(screen.getByRole("button", { name: /review/i }));
    await screen.findByText("What is a limit?");
    fireEvent.blur(screen.getByTestId("review-compact"), { relatedTarget: document.body });
    fireEvent.keyDown(document, { code: "Space" });
    expect(screen.queryByText("The value approached.")).toBeNull();
  });

  it("offers Deep Sky when there are no courses", () => {
    summary.hasCourses = false;
    const onDeepSky = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ObservatoryWidget onDeepSky={onDeepSky} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Deep Sky" }));
    expect(onDeepSky).toHaveBeenCalled();
  });
});
