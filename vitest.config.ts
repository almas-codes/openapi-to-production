import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/tests/**/*.test.ts', 'e2e/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'generated/**'],
  },
});
