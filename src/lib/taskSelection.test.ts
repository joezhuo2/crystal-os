import { beforeEach, describe, expect, it } from "vitest";
import { taskSelection } from "./taskSelection";

const order = ["a", "b", "c", "d", "e"];
const picked = () => [...taskSelection.ids()].sort();

describe("taskSelection", () => {
  beforeEach(() => taskSelection.clear());

  it("toggles a task in and out", () => {
    taskSelection.toggle("b");
    expect(picked()).toEqual(["b"]);
    taskSelection.toggle("b");
    expect(picked()).toEqual([]);
  });

  it("extends from the last toggled task, in either direction", () => {
    taskSelection.toggle("d");
    taskSelection.extendTo("b", order);
    expect(picked()).toEqual(["b", "c", "d"]);
    taskSelection.extendTo("e", order);
    expect(picked()).toEqual(["b", "c", "d", "e"]);
  });

  it("selects just the task when there is nothing to extend from", () => {
    taskSelection.extendTo("c", order);
    expect(picked()).toEqual(["c"]);
  });
});
