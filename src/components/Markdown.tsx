import { lazy, memo, Suspense, useEffect, useState, type ReactNode } from "react";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { readVaultBinary } from "@/lib/vaultNative";

const VaultPdf = lazy(() => import("./VaultPdf"));
const VAULT = "vault-embed:";
const EMBED = /!\[\[([^\]|#]+\.(png|jpe?g|webp|gif|pdf))(?:\|([^\]]*))?\]\]/gi;
const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };

interface MdNode { type: string; value?: string; url?: string; alt?: string; children?: MdNode[] }

function splitEmbeds(text: string): MdNode[] {
  const out: MdNode[] = [];
  let at = 0;
  for (const m of text.matchAll(EMBED)) {
    if (m.index! > at) out.push({ type: "text", value: text.slice(at, m.index) });
    out.push({ type: "image", url: VAULT + encodeURIComponent(m[1]!.trim()), alt: m[3]?.trim() || m[1]!.trim() });
    at = m.index! + m[0].length;
  }
  if (at < text.length) out.push({ type: "text", value: text.slice(at) });
  return out;
}

function walk(node: MdNode) {
  if (!node.children) return;
  node.children = node.children.flatMap((c) => (c.type === "text" && c.value?.includes("![[") ? splitEmbeds(c.value) : (walk(c), [c])));
}

const remarkVaultEmbeds = () => walk;

export function VaultImage({ path, alt, className, fallback }: { path: string; alt?: string; className?: string; fallback?: ReactNode }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    let made: string | null = null;
    const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
    readVaultBinary(path).then(
      (bytes) => {
        made = URL.createObjectURL(new Blob([bytes], { type: MIME[ext] ?? "application/octet-stream" }));
        if (live) setUrl(made);
        else URL.revokeObjectURL(made);
      },
      () => live && setFailed(true),
    );
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [path]);
  if (failed) return fallback ?? <span className="text-xs text-muted-foreground">Image not found: {path}</span>;
  return url ? <img src={url} alt={alt ?? path} className={className ?? "max-w-full rounded-md bg-white"} /> : <span role="img" aria-label={alt ?? path} className="inline-block h-8" />;
}

const REMARK_PLUGINS = [remarkGfm, remarkMath, remarkVaultEmbeds];
const REHYPE_PLUGINS = [rehypeKatex];
const urlTransform = (url: string) => (url.startsWith(VAULT) ? url : defaultUrlTransform(url));
const COMPONENTS: Components = {
  pre: ({ node: _node, className, ...props }) => (
    <pre className={["font-mono", className].filter(Boolean).join(" ")} {...props} />
  ),
  img: ({ node: _node, src, alt, ...props }) => {
    if (typeof src !== "string" || !src.startsWith(VAULT)) return <img src={src} alt={alt} {...props} />;
    const path = decodeURIComponent(src.slice(VAULT.length));
    return /\.pdf$/i.test(path) ? (
      <Suspense fallback={null}>
        <VaultPdf path={path} />
      </Suspense>
    ) : (
      <VaultImage path={path} alt={alt} />
    );
  },
};

export const Markdown = memo(function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={COMPONENTS} urlTransform={urlTransform}>
      {children}
    </ReactMarkdown>
  );
});
