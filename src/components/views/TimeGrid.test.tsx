import { describe, expect, it, vi } from "vitest";
import { fireEvent, render as rtlRender, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { CalendarEvent } from "@/hooks/useGoogleCalendar";
import TimeGrid from "./TimeGrid";

/** Event blocks carry a GlassTip, which needs the app's TooltipProvider. */
const render = (ui: ReactElement) => rtlRender(<TooltipProvider>{ui}</TooltipProvider>);

const base: CalendarEvent = {
  id: "e1",
  calendarId: "primary",
  summary: "Standup",
  description: "",
  location: "",
  allDay: false,
  startDate: "2026-09-30",
  startTime: "09:00",
  endDate: "2026-09-30",
  endTime: "09:30",
  startISO: "",
  endISO: "",
  recurrence: null,
  recurringEventId: null,
  htmlLink: "",
};

describe("TimeGrid", () => {
  it("edits an event on click without also creating one", () => {
    const onEdit = vi.fn();
    const onCreateAt = vi.fn();
    render(<TimeGrid dates={["2026-09-30"]} events={[base]} color="#60a5fa" onEdit={onEdit} onCreateAt={onCreateAt} />);
    fireEvent.click(screen.getByRole("button", { name: /Standup/ }));
    expect(onEdit).toHaveBeenCalledWith(base);
    expect(onCreateAt).not.toHaveBeenCalled();
  });

  it("creates at the clicked half hour in that day's column", () => {
    const onCreateAt = vi.fn();
    const { container } = render(
      <TimeGrid dates={["2026-09-29", "2026-09-30"]} events={[]} color="#60a5fa" onEdit={() => {}} onCreateAt={onCreateAt} />,
    );
    const column = container.querySelector('[data-date="2026-09-30"]') as HTMLElement;
    // 48px per hour: 10:45 is 516px down, which snaps back to 10:30.
    column.getBoundingClientRect = () => ({ top: 0, left: 0 }) as DOMRect;
    fireEvent.click(column, { clientY: 516 });
    expect(onCreateAt).toHaveBeenCalledWith("2026-09-30", "10:30");
  });

  it("shows all-day events in the strip above the grid", () => {
    render(
      <TimeGrid
        dates={["2026-09-30"]}
        events={[{ ...base, id: "a", summary: "Holiday", allDay: true, startTime: "", endTime: "" }]}
        color="#60a5fa"
        onEdit={() => {}}
        onCreateAt={() => {}}
      />,
    );
    expect(screen.getByText("all day")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Holiday" })).toBeInTheDocument();
  });
});
