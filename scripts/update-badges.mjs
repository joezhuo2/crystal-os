// Rewrites the Version and Tests badges in README.md from package.json and a
// fresh vitest run, so they can't drift from the real numbers again.
// Usage: npm run badges            (runs the suite)
//        npm run badges -- --skip-tests   (version badge only)
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("..", import.meta.url);
const rootDir = fileURLToPath(root);
const readmePath = new URL("README.md", root);
const { version } = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));

let readme = readFileSync(readmePath, "utf8");

function replaceBadge(pattern, replacement, label) {
  if (!pattern.test(readme)) {
    console.error(`README.md has no ${label} badge to update`);
    process.exit(1);
  }
  readme = readme.replace(pattern, replacement);
}

replaceBadge(
  /badge\/version-[^-)]+-6366F1/,
  `badge/version-${version}-6366F1`,
  "Version",
);
console.log(`version badge: ${version}`);

if (!process.argv.includes("--skip-tests")) {
  const dir = mkdtempSync(join(tmpdir(), "crystal-badges-"));
  const outFile = join(dir, "vitest.json");
  try {
    try {
      execSync(`npx vitest run --reporter=json --outputFile="${outFile}"`, {
        cwd: rootDir,
        stdio: ["ignore", "ignore", "inherit"],
      });
    } catch (err) {
      console.error(`Test run failed (${err.message}); tests badge left unchanged.`);
      process.exit(1);
    }
    const { numPassedTests, numFailedTests } = JSON.parse(readFileSync(outFile, "utf8"));
    if (numFailedTests > 0) {
      console.error(`${numFailedTests} tests failing; tests badge left unchanged.`);
      process.exit(1);
    }
    replaceBadge(
      /badge\/tests-\d+%20passing-brightgreen/,
      `badge/tests-${numPassedTests}%20passing-brightgreen`,
      "Tests",
    );
    console.log(`tests badge: ${numPassedTests} passing`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

writeFileSync(readmePath, readme);
