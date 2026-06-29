# Envolix

Envolix derives shareable example env files from private source env files. It removes env values while preserving the useful authored structure around them: comments, annotations, blank lines, key order, export prefixes, line endings, and final-newline style.

## Packages

- `@envolix/env-parser`: AST-first parser and env-document lookup APIs.
- `@envolix/cli`: binary-only package that publishes the `envolix` command and owns target generation, including generation validation and generated target syntax rendering.

Both packages are ESM-only and emit TypeScript declarations when packed.

## CLI Usage

Generate `.env.example` from `.env` in the current working directory:

```bash
envolix gen
```

Generate a custom target from the default `.env` source:

```bash
envolix gen --target .env.sample
```

Generate from a custom source and target:

```bash
envolix gen --source .env.prod --target .env.staging
envolix gen -s .env.prod -t .env.staging
```

Help is available at both command levels:

```bash
envolix --help
envolix gen --help
```

By default `gen` preserves values you have hand-entered into the existing target. A key keeps its current target value only when its **source** entry is annotated `#varType:plain`; secret-annotated and unannotated keys are always blanked, so a regenerated target never re-emits a private value. Pass `--no-preserve` to blank every value and produce a fresh target:

```bash
envolix gen --no-preserve
```

For example, with `DEV_URL=http://internal # varType:plain` in the source and `DEV_URL=http://localhost:3000` already in `.env.example`, regenerating keeps `DEV_URL=http://localhost:3000 # varType:plain`. If a plain key is duplicated in the existing target, `gen` cannot tell which value you meant, so it blanks that key and prints a warning instead of failing.

`envolix gen` resolves relative paths from the current working directory. It creates or overwrites the target file when the target parent directory already exists, rejects source and target paths that resolve to the same file, rejects directory paths, and writes through a temporary sibling file before renaming it into place. Missing sources and invalid source env documents fail before any target write occurs.

### Checking for drift

`envolix check` verifies that an existing target file still contains every key defined in its source, without writing anything. It is meant for a pre-commit hook guarding gitignored targets that `gen` does not manage, such as `.env.production` or `.env.staging`:

```bash
envolix check --target .env.production
```

Like `gen`, it defaults to `.env` → `.env.example`. The check passes (exit code `0`) when the target covers every source key, and fails (exit code `1`) listing the keys the target is missing. Keys that exist only in the target are ignored by default — production environments legitimately add their own — unless you pass `--strict`, which also reports them:

```bash
envolix check --target .env.production --strict
```

`check` compares keys only; it never reads or compares values, so blank target values never count as drift. The source must be valid under the same rules as `gen` (no duplicate keys, no mixed line endings). A missing target file is reported as a distinct error rather than as every key being absent.

Source:

```dotenv
# service #varType:secret
export API_KEY="private" # keep this #owner:platform

PORT=3000
```

Generated target:

```dotenv
# service #varType:secret
export API_KEY= # keep this #owner:platform

PORT=
```

## Parser API

Install the parser package when reusable env-document behavior is needed outside the CLI:

```bash
pnpm add @envolix/env-parser
```

Parse source content into an ordered document:

```ts
import { parseEnvDocument } from '@envolix/env-parser';

const document = parseEnvDocument(`# database
DATABASE_URL=postgres://local # connection
DATABASE_URL=postgres://duplicate
`);

console.log(document.nodes.map((node) => node.type));
console.log(document.findEntry('DATABASE_URL')?.value);
console.log(document.findEntries('DATABASE_URL').length);
console.log(document.diagnostics);
```

The parser preserves duplicate entries and unknown lines in the AST. Target generation, including generation validation, is owned by `@envolix/cli`, which rejects blockers such as duplicate keys, unknown syntax, unsupported backtick values, invalid keys, malformed export usage, unterminated quotes, and mixed line endings before writing a target env file.

## Development

This repository is a Vite+ monorepo. Use `vp` as the canonical task entry point so local tasks run with the configured Node 24 runtime and pnpm workspace setup.

Project expectations:

- Node `>=24 <25`
- `pnpm` (See exact version in `package.json`)
- ESM-only package output

Common commands:

```bash
vp install
pnpm run ready
vp check
vp test
vp run -r pack
```

The root `vite.config.ts` owns formatting, linting, tests, staged-file checks, cached workspace tasks, and package packing. CI installs with a frozen lockfile, then runs `vp run -r pack`, `vp check`, and `vp test`. Package outputs are built before typechecking because workspace imports resolve through package export maps.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full local setup flow.

## Releases

This monorepo publishes each workspace package from its own package directory. Do not publish the private repository root.

Before relying on automation, manually publish each public package once with npm ownership:

```bash
cd packages/env-parser
npm publish --access public

cd ../cli
npm publish --access public
```

After the first publish, configure npm trusted publishing on both package settings pages:

- `@envolix/env-parser`
- `@envolix/cli`

Use GitHub Actions as the trusted publisher with organization/user `jd-solanki`, repository `envolix`, workflow filename `publish.yml`, and allowed action `npm publish`. Leave the environment name blank unless the workflow starts using a GitHub environment.

Automated releases are tag driven. Use package-specific release tags so the workflow can publish exactly one package and generate changelogs from scoped Conventional Commits:

```bash
nr release:env-parser
nr release:cli
```

The publish workflow verifies that the selected package version is not already on npm, builds packages, runs checks and tests, generates changelog notes from the previous same-package tag, publishes only the selected package with npm trusted publishing, and creates a GitHub release.

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

The parser and CLI are intentionally separate. The parser package owns Source env file parsing and Env document data. The CLI package owns Target generation: generation validation, generated target syntax rendering, filesystem safety, diagnostics presentation, and exit behavior.
