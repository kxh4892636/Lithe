import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/cli/**/*.test.ts', 'src/main/**/*.test.ts', 'src/shared/**/*.test.ts'],
  },
})
