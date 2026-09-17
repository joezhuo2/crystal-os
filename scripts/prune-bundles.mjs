// Removes installers left in src-tauri/target/release/bundle by earlier
// `npm run build:desktop` runs. Tauri writes each version's MSI and NSIS
// installer next to the old ones, so without this they pile up (~70 MB per
// version). Installers for the current package.json version are kept.
import { readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const bundleDir = join(root, "src-tauri", "target", "release", "bundle");

let removed = 0;
let freed = 0;
for (const kind of ["msi", "nsis"]) {
  let entries;
  try {
    entries = readdirSync(join(bundleDir, kind));
  } catch {
    continue; // No previous build of this kind.
  }
  for (const name of entries) {
    // Installer names look like "Crystal OS_0.6.3_x64_en-US.msi".
    if (name.includes(`_${version}_`)) continue;
    const path = join(bundleDir, kind, name);
    freed += statSync(path).size;
    rmSync(path, { recursive: true, force: true });
    console.log(`removed ${kind}/${name}`);
    removed++;
  }
}
console.log(`pruned ${removed} old installer(s), freed ${(freed / 1024 / 1024).toFixed(1)} MB`);
