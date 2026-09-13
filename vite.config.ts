import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
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

  return {
    server: {
      // Loopback only. "::" bound every interface, which served the vault and
      // calendar to anything on the same network. Correct while this runs
      // natively on host hardware; inside Docker or WSL2 this would have to
      // return to "0.0.0.0" and the route gating would carry the security
      // burden alone.
      host: "127.0.0.1",
      port: 8080,
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
  };
});
