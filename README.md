# Envolix

Envolix derives shareable example env files from private source env files. It removes env values while preserving the useful authored structure around them: comments, annotations, blank lines, key order, export prefixes, line endings, and final-newline style.

## Packages

- `@envolix/env-parser`: parser, validation, lookup, and safe example-env rendering APIs.
- `@envolix/cli`: binary-only package that publishes the `envolix` command.

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

`envolix gen` resolves relative paths from the current working directory. It creates or overwrites the target file when the target parent directory already exists, rejects source and target paths that resolve to the same file, rejects directory paths, and writes through a temporary sibling file before renaming it into place. Missing sources and invalid source env documents fail before any target write occurs.

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

Validate and render a safe example env document:

```ts
import {
  EnvValidationError,
  parseEnvDocument,
  renderExampleEnvDocument,
  validateEnvDocumentForGeneration,
} from '@envolix/env-parser';

const document = parseEnvDocument('TOKEN=secret # required\n');
const diagnostics = validateEnvDocumentForGeneration(document);

if (diagnostics.length === 0) {
  console.log(renderExampleEnvDocument(document));
}

try {
  renderExampleEnvDocument(parseEnvDocument('DUP=one\nDUP=two\n'));
} catch (error) {
  if (error instanceof EnvValidationError) {
    console.error(error.diagnostics);
  }
}
```

The parser preserves duplicate entries and unknown lines in the AST. Generation validation rejects blockers such as duplicate keys, unknown syntax, unsupported backtick values, invalid keys, malformed export usage, unterminated quotes, and mixed line endings.

## Development

This repository is a Vite+ monorepo. Use `vp` as the canonical task entry point so local tasks run with the configured Node 24 runtime and pnpm workspace setup.

Project expectations:

- Node `>=24 <25`
- `pnpm@10`
- ESM-only package output

Common commands:

```bash
vp install
vp check
vp test
vp run -r pack
pnpm run ready
```

The root `vite.config.ts` owns formatting, linting, tests, staged-file checks, cached workspace tasks, and package packing. CI runs `vp install`, `vp check`, `vp test`, and `vp run -r pack`.

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

The publish workflow verifies that the selected package version is not already on npm, runs checks, tests, and package builds, generates changelog notes from the previous same-package tag, publishes only the selected package with npm trusted publishing, and creates a GitHub release.

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

The parser and CLI are intentionally separate. The CLI stays thin over `@envolix/env-parser`, keeping reusable parsing, validation, diagnostics, and rendering behavior in the library package.
