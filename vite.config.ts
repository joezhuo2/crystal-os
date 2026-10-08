import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { readFileSync } from "fs";
import { componentTagger } from "lovable-tagger";
import { obsidianApi } from "./server/obsidian/plugin";
import { calendarApi } from "./server/calendar/plugin";
import {
  createRequireUser,
  createSupabaseVerifier,
} from "./server/auth/requireUser";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // The empty prefix loads unprefixed vars too. OBSIDIAN_VAULT_PATH and the
  // GOOGLE_* keys are deliberately not VITE_-prefixed: they are only ever read
  // here, on the server side, so they never get inlined into the client bundle.
  const env = loadEnv(mode, process.cwd(), "");

  // Built once per server so the token cache is shared across both plugins.
  const requireUser =
    env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY
      ? createRequireUser(
          createSupabaseVerifier(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY),
        )
      : undefined;

  const { version } = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf8"));

  return {
    // Shown in Settings → Diagnostics reports (src/lib/diagnostics.ts).
    define: {
      __APP_VERSION__: JSON.stringify(version),
    },
    server: {
      // Loopback only. "::" bound every interface, which served the vault and
      // calendar to anything on the same network. Correct while this runs
      // natively on host hardware; inside Docker or WSL2 this would have to
      // return to "0.0.0.0" and the route gating would carry the security
      // burden alone.
      host: "127.0.0.1",
      port: 8080,
      // Tauri's devUrl is fixed at 8080. A second server sliding to 8081
      // would share node_modules/.vite with the first, and their dependency
      // re-optimizations wipe each other's cache (504s, pages failing to load).
      strictPort: true,
      hmr: {
        overlay: false,
      },
      // Cargo writes thousands of files under src-tauri/target during
      // `dev:desktop`; watching them would trigger endless reloads.
      watch: {
        ignored: ["**/src-tauri/**", "**/server-dist/**"],
      },
    },
    // Keep Tauri CLI output visible when Vite runs as its beforeDevCommand.
    clearScreen: false,
    plugins: [
      react(),
      obsidianApi(env.OBSIDIAN_VAULT_PATH, requireUser),
      calendarApi(
        {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          redirectUri: env.GOOGLE_REDIRECT_URI,
          // Written back into .env.local by the OAuth callback, so a restart
          // picks the connection straight back up.
          refreshToken: env.GOOGLE_REFRESH_TOKEN,
        },
        requireUser,
      ),
      mode === "development" && componentTagger(),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      rollupOptions: {
        output: {
          // Vendor code in chunks of its own, so their file names (content
          // hashes) only change when the dependency does and an update to the
          // app does not invalidate them. framer-motion is left to Rollup: one
          // chunk for it would pull the animation features, which
          // src/lib/motionFeatures.ts loads after the first render, back into
          // startup.
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            if (/node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|@remix-run)[\\/]/.test(id)) return "react";
            if (id.includes("@supabase")) return "supabase";
          },
        },
      },
    },
  };
});
