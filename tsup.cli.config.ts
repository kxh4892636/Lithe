import { defineConfig } from 'tsup'

export default defineConfig({
  clean: true,
  entry: ['src/cli/index.ts'],
  format: ['cjs'],
  loader: { '.md': 'text' },
  noExternal: ['commander', 'smol-toml', 'which', 'zod'],
  outDir: 'packages/lithe-tool/dist',
  outExtension: (): { js: string } => ({ js: '.cjs' }),
  platform: 'node',
  target: 'node20',
})
