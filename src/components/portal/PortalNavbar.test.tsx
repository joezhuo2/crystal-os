import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { portal } from "@/lib/portalStore";
import PortalNavbar from "./PortalNavbar";

const apps = [
  { id: "discord", name: "Discord", url: "https://discord.com/app" },
  { id: "x", name: "X", url: "https://x.com/" },
];

beforeEach(() => {
  portal._reset();
  vi.useFakeTimers();
  vi.spyOn(window, "focus").mockImplementation(() => {});
  vi.stubGlobal("DOMRect", { fromRect: () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }) });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PortalNavbar", () => {
  it("keeps the webview hidden when a right-press on another tab closes the open menu", () => {
    render(
      <TooltipProvider>
        <PortalNavbar
          desktop
          apps={apps}
          activeId="discord"
          badges={{}}
          confirm={null}
          onConfirmChange={() => {}}
          onSelect={() => {}}
          onReorder={() => {}}
          onAdd={() => {}}
          onNavigate={() => {}}
          onOpenExternal={() => {}}
          onSignOut={() => {}}
          onRemove={() => {}}
          onKeepLiveChange={() => {}}
          onKeepLoadedChange={() => {}}
          onNotifyChange={() => {}}
        />
      </TooltipProvider>,
    );
    fireEvent.contextMenu(screen.getByRole("button", { name: /Discord/ }));
    expect(portal.getState().occluders).toBe(1);

    act(() => {
      window.dispatchEvent(new MouseEvent("pointerdown", { button: 2, clientX: 0, clientY: 0 }));
    });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(portal.getState().occluders).toBe(1);

    act(() => vi.advanceTimersByTime(1500));
    expect(portal.getState().occluders).toBe(0);
  });
});
