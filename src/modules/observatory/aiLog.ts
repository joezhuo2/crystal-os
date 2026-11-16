import yaml from "js-yaml";
import { createVaultNote, fetchRawNote, saveVaultNote, vaultErrorCode } from "@/hooks/useVault";
import { slugify } from "./model";

export type AiOutputStatus = "pending" | "accepted" | "dismissed" | "applied";

export interface AiOutput {
  folder: string;
  /** Course code, or "DeepSky". */
  code: string;
  kind: string;
  title: string;
  markdown: string;
  provider: string;
  model: string;
  status?: AiOutputStatus;
  source?: string;
}

export const aiOutputPath = (folder: string, code: string, kind: string, title: string, at: Date) =>
  `${folder}/${code}/_ai/${at.toISOString().slice(0, 10)}-${slugify(kind)}-${slugify(title).slice(0, 60)}.md`;

export function serializeAiOutput(o: AiOutput, at: Date): string {
  const meta = { kind: o.kind, title: o.title, provider: o.provider, model: o.model || "default", status: o.status ?? "pending", source: o.source, created: at.toISOString(), tags: ["ai-unverified"] };
  return `---\n${yaml.dump(JSON.parse(JSON.stringify(meta)), { lineWidth: -1 })}---\n# ${o.title}\n\n${o.markdown.trim()}\n`;
}

export async function saveAiOutput(o: AiOutput, at = new Date()): Promise<string> {
  const base = aiOutputPath(o.folder, o.code, o.kind, o.title, at);
  const content = serializeAiOutput(o, at);
  for (let n = 1; n < 50; n++) {
    const path = n === 1 ? base : base.replace(/\.md$/, `-${n}.md`);
    try {
      await createVaultNote({ path, content, overwrite: false });
      return path;
    } catch (err) {
      if (vaultErrorCode(err) !== "conflict") throw err;
    }
  }
  throw new Error("Could not find a free file name for the AI output");
}

export async function setAiOutputStatus(path: string, status: AiOutputStatus): Promise<void> {
  const raw = await fetchRawNote(path);
  const content = raw.content.replace(/^(status:\s*).*$/m, `$1${status}`);
  await saveVaultNote({ path, content, expectedMtime: raw.mtime });
}
