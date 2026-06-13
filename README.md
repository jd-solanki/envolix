# Envolix

Envolix helps teams derive shareable example env files from private env files while keeping the human-authored structure readable.

## Packages

- `@envolix/env-parser`: parser and generation domain package. Later implementation slices will add the ordered env document AST, diagnostics, validation, and rendering.
- `@envolix/cli`: binary package for the `envolix` command. Later implementation slices will add Commander wiring and filesystem behavior.

## Toolchain

This repository is a Vite+ monorepo. Use `vp` as the canonical task entry point so the project runs with the configured Node 24 runtime and pnpm workspace setup.

```bash
vp install
vp check
vp test
vp run -r pack
```

The root `vite.config.ts` owns formatting, linting, tests, staged-file checks, cached workspace tasks, and package packing. Package builds are ESM-only and emit TypeScript declarations through `vp pack`.

## Layout

```text
packages/
  env-parser/
    src/
    test/
  cli/
    src/
    test/
```

The source env parser and the CLI are intentionally separate packages. The CLI will remain thin over `@envolix/env-parser`, which keeps reusable parsing and generation behavior in the library package.
