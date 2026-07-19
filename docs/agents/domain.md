# Domain Docs

How the engineering skills should consume this repository's domain documentation.

## Before exploring, read these

- `CONTEXT.md` at the repository root.
- Relevant ADRs under `docs/adr/`.`

If these files do not exist, proceed silently. Do not suggest creating them upfront. The `/domain-modeling` skill creates them lazily when domain terms or architectural decisions are actually resolved.

## File structure

This repository uses a single-context layout:

```text
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-example-decision.md
│   └── 0002-another-decision.md
└── src/
```

`CONTEXT.md` 和 `docs/adr/` 中的文件内容使用中文

## Use the glossary's vocabulary

When output names a domain concept, use the term defined in `CONTEXT.md`. Do not drift to synonyms that the glossary explicitly avoids.

If a required concept is absent, reconsider whether the term belongs to the project or note the gap for `/domain-modeling`.

## Flag ADR conflicts

If proposed work contradicts an existing ADR, surface the conflict explicitly instead of silently overriding the decision.
