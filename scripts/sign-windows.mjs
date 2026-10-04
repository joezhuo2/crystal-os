// Code-signs one Windows binary. Tauri runs this for every executable it
// bundles (the app, the crystal-api sidecar and the NSIS installer) through
// `bundle.windows.signCommand` in src-tauri/tauri.bundle.conf.json, passing
// the file path as the only argument. The working directory is src-tauri.
//
// With no certificate configured it prints a note and succeeds, so builds
// keep working unsigned (SmartScreen will say "unknown publisher"). Configure
// one of:
//
//   CRYSTAL_SIGN_THUMBPRINT   SHA-1 thumbprint of a code-signing certificate in
//                             the Windows certificate store (a hardware token
//                             or cloud HSM shows up there too).
//   CRYSTAL_SIGN_PFX          Path to a .pfx file, with its password in
//                             CRYSTAL_SIGN_PFX_PASSWORD.
//
// Optional:
//   CRYSTAL_SIGN_TIMESTAMP_URL  RFC 3161 server (default DigiCert's).
//   CRYSTAL_SIGN_REQUIRED=1     Fail instead of skipping when unconfigured.
//   SIGNTOOL                    Full path to signtool.exe, when it is not on
//                               PATH or in the Windows SDK's default folder.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const file = process.argv[2];
if (!file) {
  console.error("sign-windows: no file to sign");
  process.exit(1);
}

const thumbprint = process.env.CRYSTAL_SIGN_THUMBPRINT?.replace(/\s/g, "");
const pfx = process.env.CRYSTAL_SIGN_PFX;
const timestampUrl = process.env.CRYSTAL_SIGN_TIMESTAMP_URL || "http://timestamp.digicert.com";

if (!thumbprint && !pfx) {
  if (process.env.CRYSTAL_SIGN_REQUIRED === "1") {
    console.error("sign-windows: CRYSTAL_SIGN_REQUIRED is set but no certificate is configured");
    process.exit(1);
  }
  console.log(`sign-windows: no certificate configured, leaving ${file} unsigned`);
  process.exit(0);
}

/** signtool.exe from SIGNTOOL, PATH, or the newest Windows 10/11 SDK. */
function findSigntool() {
  if (process.env.SIGNTOOL) return process.env.SIGNTOOL;
  const onPath = spawnSync("where", ["signtool.exe"], { encoding: "utf8" });
  if (onPath.status === 0) return onPath.stdout.split(/\r?\n/)[0].trim();
  const kits = join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Windows Kits", "10", "bin");
  const versions = existsSync(kits)
    ? readdirSync(kits)
        .filter((name) => /^10\.\d+\.\d+\.\d+$/.test(name))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .reverse()
    : [];
  for (const version of versions) {
    const candidate = join(kits, version, "x64", "signtool.exe");
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

const signtool = findSigntool();
if (!signtool) {
  console.error("sign-windows: signtool.exe not found. Install the Windows SDK or set SIGNTOOL.");
  process.exit(1);
}

const identity = thumbprint ? ["/sha1", thumbprint] : ["/f", pfx, ...(process.env.CRYSTAL_SIGN_PFX_PASSWORD ? ["/p", process.env.CRYSTAL_SIGN_PFX_PASSWORD] : [])];
const result = spawnSync(signtool, ["sign", ...identity, "/fd", "sha256", "/tr", timestampUrl, "/td", "sha256", file], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
