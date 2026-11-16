import { createServer } from "node:http";
import path from "node:path";
import dotenv from "dotenv";
import { createLocalVerifier, createRequireUser } from "./auth/requireUser";
import { createApiHandler } from "./standalone";

/**
 * Entry point of the desktop sidecar (`crystal-api`), bundled into a single
 * executable by scripts/build-sidecar.mjs and launched by src-tauri/src/lib.rs.
 *
 * Tauri passes CRYSTAL_CONFIG_DIR — the app's config directory — and the user's
 * `.env.local` lives there, not in the install directory, so it survives
 * upgrades and the calendar refresh token can be written back to it.
 */
const rootDir = process.env.CRYSTAL_CONFIG_DIR || process.cwd();
const port = Number.parseInt(process.env.CRYSTAL_API_PORT ?? "", 10) || 8787;

const fileEnv =
  dotenv.config({ path: path.join(rootDir, ".env.local"), processEnv: {}, quiet: true }).parsed ?? {};
const env = { ...fileEnv, ...process.env } as Record<string, string | undefined>;
// The dev defaults point at Vite on 8080, which the packaged app does not run.
env.GOOGLE_REDIRECT_URI ||= `http://127.0.0.1:${port}/api/calendar/auth/callback`;
env.MAIL_REDIRECT_URI ||= `http://127.0.0.1:${port}/api/mail/auth/callback`;

const requireUser = process.env.CRYSTAL_API_TOKEN
  ? createRequireUser(createLocalVerifier(process.env.CRYSTAL_API_TOKEN))
  : undefined;

if (!requireUser) {
  console.warn("[crystal-api] CRYSTAL_API_TOKEN is not set; every API route will return 503");
}

const server = createServer(createApiHandler({ env, requireUser, rootDir }));

server.on("error", (err) => {
  console.error("[crystal-api] failed to start:", err.message);
  process.exit(1);
});

// Loopback only, same as the Vite dev server.
server.listen(port, "127.0.0.1", () => {
  console.log(`[crystal-api] listening on http://127.0.0.1:${port} (config: ${rootDir})`);
});
