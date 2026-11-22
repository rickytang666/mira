import { defineConfig } from "vite";
import { wasp } from "wasp/client/vite";

export default defineConfig({
  plugins: [wasp()],
  // Phones reach the dev server through cloudflared quick tunnels (scripts/tunnels.sh).
  server: { allowedHosts: [".trycloudflare.com"] },
});
