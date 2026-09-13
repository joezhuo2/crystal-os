// Builds the desktop sidecar: server/sidecar.ts -> one self-contained executable
// at src-tauri/binaries/crystal-api-<target-triple>[.exe], the name Tauri's
// `bundle.externalBin` expects.
//
// 1. esbuild bundles the server and all its deps into a single CJS file.
// 2. Node's Single Executable Application support turns that into a blob.
// 3. postject injects the blob into a copy of the running node binary.

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "server-dist");
const binDir = path.join(root, "src-tauri", "binaries");
const bundle = path.join(outDir, "crystal-api.cjs");
const blob = path.join(outDir, "crystal-api.blob");
const seaConfig = path.join(outDir, "sea-config.json");

/** Rust host triple, e.g. x86_64-pc-windows-msvc. Falls back for machines without rustc. */
function targetTriple() {
  try {
    const out = execFileSync("rustc", ["-vV"], { encoding: "utf-8" });
    const host = out.match(/^host: (\S+)$/m)?.[1];
    if (host) return host;
  } catch {
    /* rustc not installed: derive from Node below */
  }
  const arch = { x64: "x86_64", arm64: "aarch64" }[process.arch];
  const platform = {
    win32: "pc-windows-msvc",
    darwin: "apple-darwin",
    linux: "unknown-linux-gnu",
  }[process.platform];
  if (!arch || !platform) {
    throw new Error(`Unsupported platform ${process.platform}/${process.arch}`);
  }
  return `${arch}-${platform}`;
}

mkdirSync(outDir, { recursive: true });
mkdirSync(binDir, { recursive: true });

console.log("[sidecar] bundling server/sidecar.ts");
await build({
  entryPoints: [path.join(root, "server", "sidecar.ts")],
  outfile: bundle,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: `node${process.versions.node.split(".")[0]}`,
  minify: true,
  legalComments: "none",
  logLevel: "warning",
});

console.log("[sidecar] generating SEA blob");
writeFileSync(
  seaConfig,
  JSON.stringify(
    { main: bundle, output: blob, disableExperimentalSEAWarning: true },
    null,
    2,
  ),
);
execFileSync(process.execPath, ["--experimental-sea-config", seaConfig], { stdio: "inherit" });

const exe = path.join(
  binDir,
  `crystal-api-${targetTriple()}${process.platform === "win32" ? ".exe" : ""}`,
);
console.log(`[sidecar] injecting into ${path.relative(root, exe)}`);
copyFileSync(process.execPath, exe);

const postjectArgs = [
  exe,
  "NODE_SEA_BLOB",
  blob,
  "--sentinel-fuse",
  "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
];
if (process.platform === "darwin") postjectArgs.push("--macho-segment-name", "NODE_SEA");

execFileSync(
  process.execPath,
  [path.join(root, "node_modules", "postject", "dist", "cli.js"), ...postjectArgs],
  { stdio: "inherit" },
);

if (process.platform === "darwin") {
  execFileSync("codesign", ["--sign", "-", exe], { stdio: "inherit" });
}

console.log("[sidecar] done");
