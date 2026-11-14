import { describe, expect, it } from "vitest";
import { checklist, type ChecklistState, type EnvStatus } from "./setup";

const env = (over: Partial<EnvStatus> = {}): EnvStatus => ({
  VITE_SUPABASE_URL: true,
  VITE_SUPABASE_ANON_KEY: true,
  GOOGLE_CLIENT_ID: true,
  GOOGLE_CLIENT_SECRET: true,
  ...over,
});

const state = (over: Partial<ChecklistState> = {}): ChecklistState => ({
  env: env(),
  vaultChosen: true,
  calendarConnected: true,
  nimKey: true,
  launchAtLogin: true,
  installed: () => true,
  ...over,
});

describe("checklist", () => {
  it("is all done when everything is set up", () => {
    expect(checklist(state()).every((item) => item.done)).toBe(true);
  });

  it("says which keys are missing", () => {
    const noSupabase = checklist(state({ env: env({ VITE_SUPABASE_ANON_KEY: false }) }))[0];
    expect(noSupabase.done).toBe(false);
    expect(noSupabase.detail).toMatch(/Supabase keys are missing/);
    const noGoogle = checklist(state({ env: env({ GOOGLE_CLIENT_SECRET: false }) }));
    expect(noGoogle[0].detail).toMatch(/Google keys are missing/);
    expect(noGoogle.find((i) => i.id === "calendar")?.detail).toMatch(/Needs the Google keys/);
  });

  it("leaves out items of uninstalled sections", () => {
    const ids = checklist(state({ installed: (m) => m !== "nebula" && m !== "archive" })).map((i) => i.id);
    expect(ids).toEqual(["keys", "calendar", "login"]);
  });

  it("treats unknown status as not done", () => {
    const items = checklist(state({ env: null, nimKey: null, launchAtLogin: null }));
    expect(items.filter((i) => !i.done).map((i) => i.id)).toEqual(["keys", "nim", "login"]);
  });
});
