import { fireEvent, render, screen } from "@testing-library/react";
import { Dialog, DialogContent, DialogTitle } from "./dialog";
import { DateField } from "./field-controls";

test("a date picker inside a modal dialog stays clickable", () => {
  render(
    <Dialog open>
      <DialogContent aria-describedby={undefined}>
        <DialogTitle>Edit</DialogTitle>
        <DateField aria-label="Exam date" value="" onChange={() => {}} />
      </DialogContent>
    </Dialog>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Exam date" }));
  const panel = document.querySelector<HTMLElement>("[data-popup]")!;
  expect(document.body.style.pointerEvents).toBe("none");
  expect(panel.style.pointerEvents).toBe("auto");
});
