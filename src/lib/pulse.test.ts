import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarEvent } from "@/hooks/useGoogleCalendar";
import { appActivity } from "@/lib/appActivity";
import { perfSettings } from "@/lib/perfSettings";
import { TRAVEL_REFRESH_MS, _resetPlaces, travelMinutes, upcomingLocations, useTravelTimes } from "./pulse";

const getPosition = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useWeather", () => ({ getPosition }));

function json(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response);
}

beforeEach(() => _resetPlaces());
afterEach(() => vi.unstubAllGlobals());

describe("travelMinutes", () => {
  it("geocodes once and rounds the drive up to minutes", async () => {
    const fetchMock = vi.fn((url: string) =>
      url.includes("nominatim") ? json([{ lat: "43.7", lon: "-79.4" }]) : json({ code: "Ok", routes: [{ duration: 1501 }] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await travelMinutes({ lat: 43.6, lon: -79.3 }, "Main St")).toBe(26);
    expect(fetchMock.mock.calls[1][0]).toContain("/driving/-79.3,43.6;-79.4,43.7");
    await travelMinutes({ lat: 43.6, lon: -79.3 }, "Main St");
    expect(fetchMock.mock.calls.filter(([u]) => u.includes("nominatim"))).toHaveLength(1);
  });

  it("is null when the place or route is not found", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string) => (url.includes("nominatim") ? json([]) : json({ code: "NoRoute" }))));
    expect(await travelMinutes({ lat: 0, lon: 0 }, "Nowhere")).toBeNull();
  });
});

describe("upcomingLocations", () => {
  const now = Date.parse("2026-10-05T12:00:00Z");
  const ev = (o: Partial<CalendarEvent>) =>
    ({ id: "e", calendarId: "primary", summary: "", allDay: false, startISO: "2026-10-05T13:00:00Z", ...o }) as CalendarEvent;

  it("keeps soon, timed events with a real place", () => {
    expect(
      upcomingLocations(
        [
          ev({ location: " Main St " }),
          ev({ location: "Main St" }),
          ev({ location: "https://zoom.us/j/1" }),
          ev({ location: "Far", startISO: "2026-10-05T20:00:00Z" }),
          ev({ location: "Past", startISO: "2026-10-05T11:00:00Z" }),
          ev({ location: "All day", allDay: true }),
        ],
        now,
      ),
    ).toEqual(["Main St"]);
  });
});

describe("useTravelTimes", () => {
  afterEach(() => {
    vi.useRealTimers();
    appActivity._setWindowShown(true);
    localStorage.clear();
    perfSettings._reset();
  });

  it("skips the half-hourly refresh while hidden only when background refresh is off", async () => {
    vi.useFakeTimers();
    getPosition.mockReset().mockRejectedValue(new Error("no position"));
    const event = {
      id: "e",
      calendarId: "primary",
      summary: "",
      allDay: false,
      startISO: new Date(Date.now() + 60 * 60_000).toISOString(),
      location: "Main St",
    } as CalendarEvent;
    renderHook(() => useTravelTimes([event], true));
    expect(getPosition).toHaveBeenCalledTimes(1);
    appActivity._setWindowShown(false);
    await act(async () => {
      vi.advanceTimersByTime(TRAVEL_REFRESH_MS);
    });
    expect(getPosition).toHaveBeenCalledTimes(2);
    perfSettings.setSwitch("backgroundRefresh", false);
    await act(async () => {
      vi.advanceTimersByTime(TRAVEL_REFRESH_MS);
    });
    expect(getPosition).toHaveBeenCalledTimes(2);
    appActivity._setWindowShown(true);
    await act(async () => {
      vi.advanceTimersByTime(TRAVEL_REFRESH_MS);
    });
    expect(getPosition).toHaveBeenCalledTimes(3);
  });
});
