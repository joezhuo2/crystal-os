import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import type { Task } from "@/contexts/AppContext";

const tasks: Task[] = [
  {
    id: "t1",
    name: "File taxes",
    startDate: "2026-10-05",
    startTime: "09:00",
    endDate: "2026-10-05",
    endTime: "17:00",
    priority: "medium",
    categoryId: "work",
    completed: false,
  },
];
vi.mock("@/contexts/AppContext", () => ({ useTasks: () => tasks }));
vi.mock("@/hooks/useGoogleCalendar", () => ({
  calendarEventsQuery: () => ({ queryKey: ["events"], queryFn: () => ({ events: [] }) }),
  calendarWasConnected: () => false,
  useCalendarStatus: () => ({ data: undefined }),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: undefined }) }));
vi.mock("@/lib/platform", () => ({ isDesktop: () => false, usesSidecar: () => false }));

const shown = vi.fn();
class FakeNotification {
  static permission = "granted";
  constructor(title: string) {
    shown(title);
  }
}

import NotificationScheduler from "./NotificationScheduler";
import { notifySettings } from "@/lib/notifySettings";

const flush = () => act(async () => undefined);

beforeEach(() => {
  localStorage.clear();
  notifySettings._reset();
  shown.mockReset();
  vi.stubGlobal("Notification", FakeNotification);
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(new Date("2026-10-05T16:40:00"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("NotificationScheduler task reminders", () => {
  it("holds a reminder through Do Not Disturb and shows it once it ends", async () => {
    notifySettings.setFlag("doNotDisturb", true);
    render(<NotificationScheduler />);
    await flush();
    expect(shown).not.toHaveBeenCalled();

    act(() => notifySettings.setFlag("doNotDisturb", false));
    await act(async () => vi.advanceTimersByTime(30 * 1000));
    expect(shown).toHaveBeenCalledWith("Due soon: File taxes");

    await act(async () => vi.advanceTimersByTime(30 * 1000));
    expect(shown).toHaveBeenCalledTimes(1);
  });
});
