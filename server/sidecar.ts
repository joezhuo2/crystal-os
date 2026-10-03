import { createServer } from "node:http";
import path from "node:path";
import dotenv from "dotenv";
import { createRequireUser, createSupabaseVerifier } from "./auth/requireUser";
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

const requireUser =
  env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY
    ? createRequireUser(createSupabaseVerifier(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY))
    : undefined;

if (!requireUser) {
  console.warn(
    `[crystal-api] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing in ${path.join(rootDir, ".env.local")}; every API route will return 503`,
  );
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
