import { defineConfig } from 'vitest/config';

// Takes precedence over vite.config.ts, whose wasp() plugin can't start under vitest.
export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  // Scoped to src/ and scripts/ so agent worktrees under .claude/ and generated code in .wasp/ aren't collected.
  test: { include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'], environment: 'node' },
});
