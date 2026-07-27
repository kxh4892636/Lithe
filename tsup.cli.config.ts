import { readFileSync } from 'node:fs'

import { defineConfig } from 'tsup'

const { version } = JSON.parse(
  readFileSync(new URL('./packages/lithe-tool/package.json', import.meta.url), 'utf8'),
) as { version: string }

export default defineConfig({
  clean: true,
  define: { __LITHE_TOOL_VERSION__: JSON.stringify(version) },
  entry: ['src/cli/index.ts'],
  format: ['cjs'],
  loader: { '.md': 'text' },
  noExternal: ['commander', 'smol-toml', 'which', 'zod'],
  outDir: 'packages/lithe-tool/dist',
  outExtension: (): { js: string } => ({ js: '.cjs' }),
  platform: 'node',
  target: 'node20',
})
