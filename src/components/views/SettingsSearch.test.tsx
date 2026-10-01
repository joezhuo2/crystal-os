import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

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
    expect(section("portal").hidden).toBe(true);

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

  it("says so when nothing matches", () => {
    render(<SettingsPage />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzzz-nothing" } });
    expect(screen.getByText(/No settings match/)).toBeInTheDocument();
  });
});
