import { beforeEach, describe, expect, it } from "vitest";
import { INSTALLED_MODULES_KEY, installedModuleList, installedModules, parseInstalledModules } from "./installedModules";

beforeEach(() => {
  localStorage.clear();
  installedModules._reset();
});

describe("parseInstalledModules", () => {
  it("installs everything by default and drops unknown, duplicate and core ids", () => {
    expect(parseInstalledModules(null)).toEqual({ uninstalled: [] });
    expect(parseInstalledModules("not json")).toEqual({ uninstalled: [] });
    expect(parseInstalledModules(JSON.stringify({ uninstalled: ["orbit", "bogus", "orbit", "home", "settings"] }))).toEqual({
      uninstalled: ["orbit"],
    });
  });
});

describe("installedModules", () => {
  it("uninstalls and reinstalls a module, and persists it", () => {
    installedModules.uninstall("portal");
    expect(installedModules.isInstalled("portal")).toBe(false);
    expect(installedModuleList().map((m) => m.id)).not.toContain("portal");
    expect(JSON.parse(localStorage.getItem(INSTALLED_MODULES_KEY)!)).toEqual({ uninstalled: ["portal"] });

    installedModules._reset();
    expect(installedModules.isInstalled("portal")).toBe(false);

    installedModules.install("portal");
    expect(installedModules.isInstalled("portal")).toBe(true);
  });

  it("never uninstalls core modules", () => {
    installedModules.uninstall("home");
    installedModules.uninstall("settings");
    expect(installedModules.getState().uninstalled).toEqual([]);
  });
});
