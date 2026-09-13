import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Vitest config — separate from vite.config.js so it never affects the
// production build. Run with:  npx vitest run   (or `npm test`)
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.test.{js,jsx}'],
    css: false,
    // No unit test files exist in this project yet — without this, CI's
    // `vitest run` would fail on "no test files found" even though nothing
    // is actually broken. Remove this once real test files are added.
    passWithNoTests: true,
  },
});
