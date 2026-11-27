import { defineConfig } from 'vite';
import { wasp } from 'wasp/client/vite';

export default defineConfig({
  plugins: [wasp()],
  // Phones reach the dev server through cloudflared quick tunnels (scripts/tunnels.sh).
  // Agent worktrees live in .claude/; watching them reloads open pages whenever an agent edits its copy.
  server: { allowedHosts: ['.trycloudflare.com'], watch: { ignored: ['**/.claude/**'] } },
});
