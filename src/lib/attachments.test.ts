import { describe, expect, it } from "vitest";
import { attachmentPath } from "./attachments";

const now = new Date("2026-11-16T09:05:03Z");

describe("attachmentPath", () => {
  it("files an attachment beside the note, stamped so names never collide", () => {
    expect(attachmentPath("School/Notes.md", { name: "image.png", type: "image/png" }, now)).toBe("School/attachments/Pasted 20261116090503.png");
    expect(attachmentPath("Inbox.md", { name: "Lab 2: results?.pdf", type: "application/pdf" }, now)).toBe("attachments/Lab 2  results 20261116090503.pdf");
  });

  it("refuses types the vault does not store", () => {
    expect(attachmentPath("Inbox.md", { name: "a.svg", type: "image/svg+xml" }, now)).toBeNull();
  });
});
