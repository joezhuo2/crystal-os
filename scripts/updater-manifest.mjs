// Writes latest.json for tauri-plugin-updater after `npm run build:release`.
// Attach it to the GitHub release together with the NSIS installer: the app
// reads https://github.com/joezhuo2/crystal-os/releases/latest/download/latest.json
// (plugins.updater.endpoints in src-tauri/tauri.conf.json).
//
// The release notes come from this version's CHANGELOG.md section.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "joezhuo2/crystal-os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const { productName } = JSON.parse(readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8"));
const nsisDir = join(root, "src-tauri", "target", "release", "bundle", "nsis");

const installer = `${productName}_${version}_x64-setup.exe`;
const sigPath = join(nsisDir, `${installer}.sig`);
if (!existsSync(sigPath)) {
  console.error(`updater-manifest: ${sigPath} is missing. Build with \`npm run build:release\` and TAURI_SIGNING_PRIVATE_KEY set.`);
  process.exit(1);
}

/** The `## [vX.Y.Z]` section of CHANGELOG.md, without its heading. */
function changelogNotes() {
  const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
  const start = changelog.indexOf(`## [v${version}]`);
  if (start === -1) return `Crystal OS v${version}`;
  const body = changelog.slice(changelog.indexOf("\n", start) + 1);
  const next = body.search(/^## \[/m);
  return (next === -1 ? body : body.slice(0, next)).trim();
}

// GitHub replaces spaces in uploaded asset names with dots, so
// "Crystal OS_0.8.2_x64-setup.exe" is served as "Crystal.OS_0.8.2_x64-setup.exe".
const assetName = installer.replace(/ /g, ".");
const manifest = {
  version,
  notes: changelogNotes(),
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature: readFileSync(sigPath, "utf8").trim(),
      url: `https://github.com/${REPO}/releases/download/v${version}/${encodeURIComponent(assetName)}`,
    },
  },
};

const out = join(nsisDir, "latest.json");
writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`wrote ${out}`);
console.log(`attach to release v${version}: ${installer} and latest.json`);
