import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const readVaultBinary = vi.fn(async (_path: string) => new ArrayBuffer(4));
vi.mock("@/lib/vaultNative", () => ({ readVaultBinary: (p: string) => readVaultBinary(p) }));
URL.createObjectURL = vi.fn(() => "blob:vault-image");
URL.revokeObjectURL = vi.fn();

const { Markdown } = await import("./Markdown");

describe("Markdown", () => {
  it("renders inline and display math with KaTeX", () => {
    const { container } = render(<Markdown>{"Euler: $e^{i\\pi}+1=0$\n\n$$\n\\int_0^1 x\\,dx\n$$"}</Markdown>);
    expect(container.querySelectorAll(".katex").length).toBe(2);
    expect(container.querySelector(".katex-display")).not.toBeNull();
  });

  it("renders fenced code in a mono pre block", () => {
    const { container } = render(<Markdown>{"```ts\nconst x = 1;\n```"}</Markdown>);
    const pre = container.querySelector("pre");
    expect(pre).not.toBeNull();
    expect(pre?.className).toContain("font-mono");
    expect(pre?.querySelector("code")?.textContent).toBe("const x = 1;\n");
  });

  it("renders Obsidian image embeds from the vault and leaves code and other links alone", async () => {
    render(<Markdown>{"Look: ![[Observatory/M/resources/images/ps1 1.png|Question 1]]\n\n`![[x.png]]`\n\n[link](https://example.com)"}</Markdown>);
    await waitFor(() => expect(screen.getByRole("img", { name: "Question 1" })).toHaveAttribute("src", "blob:vault-image"));
    expect(readVaultBinary).toHaveBeenCalledTimes(1);
    expect(readVaultBinary).toHaveBeenCalledWith("Observatory/M/resources/images/ps1 1.png");
    expect(screen.getByText("![[x.png]]").tagName).toBe("CODE");
    expect(screen.getByRole("link", { name: "link" })).toHaveAttribute("href", "https://example.com");
  });

  it("shows the path when the embedded image cannot be read", async () => {
    readVaultBinary.mockRejectedValueOnce(new Error("missing"));
    render(<Markdown>{"![[gone.png]]"}</Markdown>);
    expect(await screen.findByText("Image not found: gone.png")).toBeInTheDocument();
  });
});
