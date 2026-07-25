import { defineConfig } from 'tsup'

export default defineConfig({
  clean: true,
  entry: ['src/cli/index.ts'],
  format: ['cjs'],
  noExternal: ['commander', 'zod'],
  outDir: 'packages/lithe-tool/dist',
  outExtension: (): { js: string } => ({ js: '.cjs' }),
  platform: 'node',
  target: 'node20',
})
