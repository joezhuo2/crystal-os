import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import HomePage from "./HomePage";
import type { HomeWidget } from "./HomeGrid";
import { INSTALLED_MODULES_KEY, installedModules } from "@/lib/installedModules";
import type { TabId } from "@/modules/registry";

vi.mock("./HomeGrid", () => ({
  default: ({ widgets }: { widgets: HomeWidget[] }) => (
    <div>{widgets.map((widget) => <div key={widget.id} data-testid={widget.id}>{widget.label}</div>)}</div>
  ),
}));

vi.mock("./HomeSpaces", () => ({
  NebulaSpace: () => null,
  PortalSpace: () => null,
  TerminalSpace: () => null,
}));

const mappings: [string, TabId][] = [
  ["clock", "orbit"],
  ["weather", "weather"],
  ["vault", "financials"],
  ["engine", "tasks"],
  ["horizon", "calendar"],
  ["mail", "mail"],
  ["archive", "archive"],
  ["nebula", "nebula"],
  ["portal", "portal"],
  ["terminal", "terminal"],
];

beforeEach(() => {
  localStorage.clear();
  installedModules._reset();
});

describe("HomePage modules", () => {
  it("shows every widget when all modules are installed", () => {
    render(<HomePage />);
    for (const [id] of mappings) expect(screen.getByTestId(id)).toBeInTheDocument();
  });

  it.each(mappings)("updates the %s widget when %s is uninstalled and reinstalled", (id, module) => {
    render(<HomePage />);

    act(() => installedModules.uninstall(module));
    expect(screen.queryByTestId(id)).not.toBeInTheDocument();
    for (const [otherId] of mappings) {
      if (otherId !== id) expect(screen.getByTestId(otherId)).toBeInTheDocument();
    }

    act(() => installedModules.install(module));
    expect(screen.getByTestId(id)).toBeInTheDocument();
  });

  it("hides modules already uninstalled in storage", () => {
    localStorage.setItem(INSTALLED_MODULES_KEY, JSON.stringify({ uninstalled: mappings.map(([, module]) => module) }));
    installedModules._reset();

    render(<HomePage />);
    for (const [id] of mappings) expect(screen.queryByTestId(id)).not.toBeInTheDocument();
  });
});
