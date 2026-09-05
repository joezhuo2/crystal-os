import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { obsidianApi } from "./server/obsidian/plugin";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // The empty prefix loads unprefixed vars too. OBSIDIAN_VAULT_PATH is
  // deliberately not VITE_-prefixed: it is only ever read here, on the server
  // side, so it never gets inlined into the client bundle.
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
      mode === "development" && componentTagger(),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
