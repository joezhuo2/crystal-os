import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import {
  ObservatoryDailyGoalInput,
  ObservatoryDeepSkyFolders,
  ObservatoryFlagSwitch,
  ObservatoryKeywordSortSwitch,
  ObservatoryNewPerDayInput,
  ObservatoryRetentionSlider,
} from "./ObservatorySettingsSection";
import { readObservatorySettings, setObservatoryAiProvider } from "./settings";

describe("Observatory settings", () => {
  it("saves new cards per day and the daily goal on blur, clamped", () => {
    render(
      <>
        <ObservatoryNewPerDayInput />
        <ObservatoryDailyGoalInput />
      </>,
    );
    const perDay = screen.getByLabelText("New cards per day per course") as HTMLInputElement;
    fireEvent.change(perDay, { target: { value: "25" } });
    fireEvent.blur(perDay);
    expect(readObservatorySettings().newPerDay).toBe(25);

    const goal = screen.getByLabelText("Daily goal") as HTMLInputElement;
    fireEvent.change(goal, { target: { value: "50" } });
    fireEvent.blur(goal);
    expect(readObservatorySettings().dailyGoal).toBe(20);
    expect(goal.value).toBe("20");
  });

  it("saves the target retention from the slider", () => {
    render(<ObservatoryRetentionSlider />);
    const thumb = screen.getByRole("slider");
    fireEvent.keyDown(thumb, { key: "ArrowRight" });
    expect(readObservatorySettings().retention).toBe(0.91);
    expect(screen.getByText("91%")).toBeTruthy();
  });

  it("toggles keyword sorting", () => {
    render(<ObservatoryKeywordSortSwitch />);
    fireEvent.click(screen.getByRole("switch", { name: "Sort PDFs by keywords" }));
    expect(readObservatorySettings().keywordSort).toBe(false);
  });

  it("keeps AI features locked until a provider is chosen, then saves Deep Sky folders", () => {
    render(
      <>
        <ObservatoryFlagSwitch flag="aiSort" label="Sort PDFs with AI" needsAi />
        <ObservatoryDeepSkyFolders />
      </>,
    );
    const sort = screen.getByRole("switch", { name: "Sort PDFs with AI" });
    expect(sort).toBeDisabled();
    act(() => setObservatoryAiProvider("claude"));
    expect(sort).toBeEnabled();

    const folders = screen.getByLabelText("Deep Sky project folders") as HTMLInputElement;
    fireEvent.change(folders, { target: { value: "Projects/, Code\\Apps, ../x" } });
    fireEvent.blur(folders);
    expect(readObservatorySettings().deepSkyFolders).toEqual(["Projects", "Code/Apps"]);
    expect(folders.value).toBe("Projects, Code/Apps");
    act(() => setObservatoryAiProvider("none"));
  });
});
