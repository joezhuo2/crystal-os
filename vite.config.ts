import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { obsidianApi } from "./server/obsidian/plugin";
import { calendarApi } from "./server/calendar/plugin";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // The empty prefix loads unprefixed vars too. OBSIDIAN_VAULT_PATH and the
  // GOOGLE_* keys are deliberately not VITE_-prefixed: they are only ever read
  // here, on the server side, so they never get inlined into the client bundle.
  const env = loadEnv(mode, process.cwd(), "");

  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    plugins: [
      react(),
      obsidianApi(env.OBSIDIAN_VAULT_PATH),
      calendarApi({
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        redirectUri: env.GOOGLE_REDIRECT_URI,
        // Written back into .env.local by the OAuth callback, so a restart
        // picks the connection straight back up.
        refreshToken: env.GOOGLE_REFRESH_TOKEN,
      }),
      mode === "development" && componentTagger(),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
