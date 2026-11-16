const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "application/pdf": "pdf" };

export function attachmentPath(notePath: string, file: { name: string; type: string }, now: Date): string | null {
  const ext = EXT[file.type];
  if (!ext) return null;
  const dir = notePath.slice(0, notePath.lastIndexOf("/") + 1);
  const stamp = now.toISOString().replace(/\D/g, "").slice(0, 14);
  const base = /^image\.\w+$/i.test(file.name) ? "" : file.name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|#^[\]]/g, " ").trim();
  return `${dir}attachments/${base || "Pasted"} ${stamp}.${ext}`;
}
