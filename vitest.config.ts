import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths({ projects: ['./tsconfig.json'] })],
  test: {
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 600_000,
    hookTimeout: 120_000,
  },
})
