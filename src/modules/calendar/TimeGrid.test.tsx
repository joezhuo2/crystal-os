import { describe, expect, it, vi } from "vitest";
import { fireEvent, render as rtlRender, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { CalendarEvent } from "@/hooks/useGoogleCalendar";
import TimeGrid from "./TimeGrid";

/** Event blocks carry a GlassTip, which needs the app's TooltipProvider. */
const render = (ui: ReactElement) => rtlRender(<TooltipProvider>{ui}</TooltipProvider>);

// jsdom has no PointerEvent, which would drop clientX/clientY from fireEvent.pointer*.
if (!window.PointerEvent) {
  class PointerEventShim extends MouseEvent {
    pointerId: number;
    pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? "mouse";
    }
  }
  window.PointerEvent = PointerEventShim as unknown as typeof PointerEvent;
}

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
  it("lists date, location, repeat and description in the hover card, skipping empty ones", async () => {
    const event = { ...base, location: "Room 4", description: "Daily sync", recurrence: ["RRULE:FREQ=WEEKLY"] };
    render(<TimeGrid dates={["2026-09-30"]} events={[event]} color="#60a5fa" onEdit={() => {}} onCreateAt={() => {}} />);
    fireEvent.focus(screen.getByRole("button", { name: /Standup/ }));
    const tip = (await screen.findAllByRole("tooltip"))[0];
    for (const text of ["Wed, Sep 30", "Room 4", "Weekly", "Daily sync"]) expect(tip).toHaveTextContent(text);
  });

  it("drags a timed event to a new time and does not open the editor", () => {
    const onMoveEvent = vi.fn();
    const onEdit = vi.fn();
    render(
      <TimeGrid
        dates={["2026-09-30"]}
        events={[base]}
        color="#60a5fa"
        onEdit={onEdit}
        onCreateAt={() => {}}
        onMoveEvent={onMoveEvent}
      />,
    );
    const block = screen.getByRole("button", { name: /Standup/ });
    fireEvent.pointerDown(block, { clientX: 10, clientY: 100, button: 0, pointerId: 1 });
    fireEvent.pointerMove(block, { clientX: 10, clientY: 148, pointerId: 1 });
    fireEvent.pointerUp(block, { clientX: 10, clientY: 148, pointerId: 1 });
    fireEvent.click(block);
    expect(onMoveEvent).toHaveBeenCalledWith(base, "2026-09-30", "10:00", "10:30");
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("outlines where the event will land while dragging, snapped to 10 minutes", () => {
    const onMoveEvent = vi.fn();
    const { container } = render(
      <TimeGrid dates={["2026-09-30"]} events={[base]} color="#60a5fa" onEdit={() => {}} onCreateAt={() => {}} onMoveEvent={onMoveEvent} />,
    );
    const block = screen.getByRole("button", { name: /Standup/ });
    fireEvent.pointerDown(block, { clientX: 10, clientY: 100, button: 0, pointerId: 1 });
    fireEvent.pointerMove(block, { clientX: 10, clientY: 157, pointerId: 1 });
    const target = container.querySelector("[data-drop-target]") as HTMLElement;
    expect(target.style.top).toBe(`${(10 * 60 + 10) * 0.8}px`);
    expect(target.textContent).toMatch(/10:10.*10:40/);
    fireEvent.pointerUp(block, { clientX: 10, clientY: 157, pointerId: 1 });
    expect(container.querySelector("[data-drop-target]")).toBeNull();
    expect(onMoveEvent).toHaveBeenCalledWith(base, "2026-09-30", "10:10", "10:40");
  });

  it("treats a press without travel as a click", () => {
    const onMoveEvent = vi.fn();
    const onEdit = vi.fn();
    render(
      <TimeGrid dates={["2026-09-30"]} events={[base]} color="#60a5fa" onEdit={onEdit} onCreateAt={() => {}} onMoveEvent={onMoveEvent} />,
    );
    const block = screen.getByRole("button", { name: /Standup/ });
    fireEvent.pointerDown(block, { clientX: 10, clientY: 100, button: 0, pointerId: 1 });
    fireEvent.pointerUp(block, { clientX: 10, clientY: 100, pointerId: 1 });
    fireEvent.click(block);
    expect(onMoveEvent).not.toHaveBeenCalled();
    expect(onEdit).toHaveBeenCalledWith(base);
  });
});
