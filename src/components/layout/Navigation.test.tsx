import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { portal } from "@/lib/portalStore";

vi.mock("@/lib/platform", async (orig) => ({ ...(await orig<object>()), isDesktop: () => true }));

const { SidebarNav } = await import("./Navigation");

function hover(activeTab: "portal" | "home") {
  const { container } = render(<SidebarNav activeTab={activeTab} onTabChange={() => {}} />);
  const shell = container.querySelector(".sidebar-shell")!;
  fireEvent.mouseEnter(container.querySelector("aside")!);
  return shell;
}

beforeEach(() => {
  portal._reset();
});

describe("SidebarNav over the Portal", () => {
  it("expands only once the webview has left the screen", () => {
    act(() => portal.setOnScreen(true));
    const shell = hover("portal");
    expect(shell.hasAttribute("data-expanded")).toBe(false);
    expect(portal.getState().occluders).toBe(1);
    act(() => portal.setOnScreen(false));
    expect(shell.hasAttribute("data-expanded")).toBe(true);
  });

  it("stays collapsed if the pointer left before the webview did", () => {
    act(() => portal.setOnScreen(true));
    const shell = hover("portal");
    fireEvent.mouseLeave(shell.querySelector("aside")!);
    expect(portal.getState().occluders).toBe(0);
    act(() => portal.setOnScreen(false));
    expect(shell.hasAttribute("data-expanded")).toBe(false);
  });

  it("expands straight away on other tabs", () => {
    act(() => portal.setOnScreen(true));
    const shell = hover("home");
    expect(shell.hasAttribute("data-expanded")).toBe(true);
    expect(portal.getState().occluders).toBe(0);
  });
});
