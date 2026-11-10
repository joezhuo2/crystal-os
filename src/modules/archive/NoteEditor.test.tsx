import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

// CodeMirror needs real layout; a textarea is enough to drive the save logic.
vi.mock("@uiw/react-codemirror", () => ({
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="editor" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

let file = { path: "Note.md", content: "# Hello\n", mtime: 100 };
const mutate = vi.fn();
const refetch = vi.fn(async () => ({ data: file }));

vi.mock("@/hooks/useVault", () => ({
  useRawNote: () => ({ data: file, isLoading: false, error: null, refetch }),
  useSaveNote: () => ({ mutate, isPending: false }),
  vaultErrorCode: (err: { code?: string }) => err.code ?? null,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const { default: NoteEditor } = await import("./NoteEditor");

const editor = () => screen.getByLabelText("editor") as HTMLTextAreaElement;

describe("NoteEditor", () => {
  beforeEach(() => {
    file = { path: "Note.md", content: "# Hello\n", mtime: 100 };
    mutate.mockReset();
    refetch.mockClear();
  });

  it("saves the edited file against the mtime it was opened at", () => {
    const onDone = vi.fn();
    render(<NoteEditor path="Note.md" onDone={onDone} />);
    expect(editor().value).toBe("# Hello\n");

    fireEvent.change(editor(), { target: { value: "# Hello\nmore\n" } });
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));
    expect(mutate).toHaveBeenCalledWith(
      { path: "Note.md", content: "# Hello\nmore\n", expectedMtime: 100 },
      expect.anything(),
    );

    act(() => mutate.mock.calls[0][1].onSuccess());
    expect(onDone).toHaveBeenCalled();
  });

  it("closes without writing when nothing changed", () => {
    const onDone = vi.fn();
    render(<NoteEditor path="Note.md" onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));
    expect(mutate).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalled();
  });

  it("offers overwrite on a conflict and retries against the newer mtime", async () => {
    render(<NoteEditor path="Note.md" onDone={() => {}} />);
    fireEvent.change(editor(), { target: { value: "mine\n" } });
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));
    act(() => mutate.mock.calls[0][1].onError({ code: "conflict", message: "changed" }));
    expect(screen.getByRole("alert")).toHaveTextContent("changed on disk");

    file = { path: "Note.md", content: "theirs\n", mtime: 200 };
    fireEvent.click(screen.getByRole("button", { name: "Overwrite with mine" }));
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(2));
    expect(mutate.mock.calls[1][0]).toEqual({ path: "Note.md", content: "mine\n", expectedMtime: 200 });
  });

  it("can drop local edits and load the newer file instead", async () => {
    render(<NoteEditor path="Note.md" onDone={() => {}} />);
    fireEvent.change(editor(), { target: { value: "mine\n" } });
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));
    act(() => mutate.mock.calls[0][1].onError({ code: "conflict", message: "changed" }));

    file = { path: "Note.md", content: "theirs\n", mtime: 200 };
    fireEvent.click(screen.getByRole("button", { name: "Discard mine, load theirs" }));
    await waitFor(() => expect(editor().value).toBe("theirs\n"));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps unsaved edits as a draft across unmounts", () => {
    const first = render(<NoteEditor path="Draft.md" onDone={() => {}} />);
    fireEvent.change(editor(), { target: { value: "half-written\n" } });
    first.unmount();

    render(<NoteEditor path="Draft.md" onDone={() => {}} />);
    expect(editor().value).toBe("half-written\n");
  });

  it("asks before discarding unsaved edits", () => {
    const onDone = vi.fn();
    render(<NoteEditor path="Note.md" onDone={onDone} />);
    fireEvent.change(editor(), { target: { value: "changed\n" } });
    fireEvent.click(screen.getByRole("button", { name: /Cancel/ }));
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Discard changes/ }));
    expect(onDone).toHaveBeenCalled();
  });
});
