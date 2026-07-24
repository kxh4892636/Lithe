export default {
  '*.{css,html,json,jsonc,md,yaml,yml}': 'oxfmt --write',
  '*.{js,jsx,mjs,cjs,ts,tsx}': [
    'oxfmt --write',
    'oxlint --type-aware --type-check --react-plugin --vitest-plugin --jsx-a11y-plugin --deny-warnings',
  ],
}
