import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { appUi } from "@/lib/appUi";
import { SETTINGS_SECTIONS } from "@/lib/settingsSections";

vi.mock("@/lib/platform", async (orig) => ({ ...(await orig<object>()), isDesktop: () => false }));
vi.mock("@/hooks/useGlobalHotkey", () => ({ useGlobalHotkeys: () => ({ statuses: null }) }));
vi.mock("@/hooks/useVault", () => ({
  useVaultStatus: () => ({ data: null }),
  usePickVault: () => ({ mutate: () => {}, isPending: false }),
}));

const { default: SettingsPage } = await import("./SettingsPage");

const section = (id: string) => document.querySelector(`[data-settings-section="${id}"]`) as HTMLElement;
const expanded = (id: string) => section(id).querySelector("h3 button")!.getAttribute("aria-expanded");

describe("Settings search", () => {
  it("hides sections that don't match and unfolds the ones that do", () => {
    localStorage.setItem("crystal-os-settings-collapsed", JSON.stringify(["performance"]));
    render(<SettingsPage />);
    expect(expanded("performance")).toBe("false");

    fireEvent.change(screen.getByRole("searchbox", { name: "Search settings" }), { target: { value: "performance mode" } });
    expect(section("performance").hidden).toBe(false);
    expect(expanded("performance")).toBe("true");
    expect(section("atmosphere").hidden).toBe(true);
    // The Portal's only setting was its theme, which is gone.
    expect(section("portal")).toBeNull();

    // Unfolding for a search is not saved as the user's choice.
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    expect(expanded("performance")).toBe("false");
    expect(section("atmosphere").hidden).toBe(false);
  });

  it("matches text inside a section, not just its title", () => {
    render(<SettingsPage />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "aurora" } });
    expect(section("atmosphere").hidden).toBe(false);
    expect(section("performance").hidden).toBe(true);
  });

  it("still finds the Portal's unload delay under Performance", () => {
    render(<SettingsPage />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "portal" } });
    expect(section("performance").hidden).toBe(false);
  });

  it("says so when nothing matches", () => {
    render(<SettingsPage />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzzz-nothing" } });
    expect(screen.getByText(/No settings match/)).toBeInTheDocument();
  });
});

describe("Jumping to a section from the command palette", () => {
  it("lists every web section the page renders", () => {
    render(<SettingsPage />);
    for (const entry of SETTINGS_SECTIONS.filter((e) => !e.desktopOnly)) {
      expect(section(entry.id), entry.id).not.toBeNull();
    }
  });

  it("clears the search, unfolds the section, saves it open and flashes it", () => {
    vi.useFakeTimers();
    try {
      localStorage.setItem("crystal-os-settings-collapsed", JSON.stringify(["performance"]));
      Element.prototype.scrollIntoView = vi.fn();
      render(<SettingsPage />);
      fireEvent.change(screen.getByRole("searchbox"), { target: { value: "aurora" } });
      expect(section("performance").hidden).toBe(true);

      act(() => appUi.setSettingsSection("performance"));
      expect(screen.getByRole("searchbox")).toHaveValue("");
      expect(section("performance").hidden).toBe(false);
      expect(expanded("performance")).toBe("true");
      expect(section("performance").hasAttribute("data-flash")).toBe(true);
      expect(JSON.parse(localStorage.getItem("crystal-os-settings-collapsed")!)).not.toContain("performance");
      expect(appUi.getState().settingsSection).toBeNull();

      act(() => vi.advanceTimersByTime(2000));
      expect(section("performance").hasAttribute("data-flash")).toBe(false);
    } finally {
      vi.useRealTimers();
      appUi.reset();
    }
  });
});
