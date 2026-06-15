# Contributing

Thanks for helping improve Envolix.

## Requirements

- Node `>=24 <25`
- `pnpm` (See exact version in `package.json`)
- Vite+ through the repository scripts

The repository root is a private pnpm workspace. The public packages live under `packages/*`.

## First Setup

Install dependencies from the repository root:

```bash
vp install
```

Then build and validate the workspace:

```bash
pnpm run ready
```

`ready` builds every package first, then runs checks and tests:

```bash
vp run -r pack
vp check
vp test
```

The build step comes first because some packages import other workspace packages by their package name. For example, `@envolix/cli` imports `@envolix/env-parser`. The parser package exports files from `dist`, so TypeScript resolves the package through those built declaration files instead of through `src`.

If `dist` is empty, `vp check` can report an error like:

```text
Cannot find module '@envolix/env-parser' or its corresponding type declarations.
```

Running `pnpm run ready` fixes that by generating the package output before typechecking.

## Daily Development

Useful commands:

```bash
pnpm run ready
vp check
vp test
vp run -r pack
```

Run `pnpm run ready` before opening a pull request. It matches CI's validation order: build package outputs, then check, then test.

## Workspace Packages

Use pnpm's `workspace:*` protocol for local package dependencies:

```json
{
  "dependencies": {
    "@envolix/env-parser": "workspace:*"
  }
}
```

This tells pnpm to link the dependency from this monorepo instead of downloading it from the registry. If a package cannot be found, check that:

- the dependency name matches the depended-on package's `package.json` name
- the package directory is included by `pnpm-workspace.yaml`
- dependencies were installed from the repository root
- package outputs exist when imports resolve through `exports`

## Pull Requests

Before submitting a PR:

```bash
pnpm run ready
```

Keep changes focused, include tests for behavior changes, and update docs when workflow or user-facing behavior changes.
