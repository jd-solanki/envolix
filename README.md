# envolix

envolix helps keep Example Environment Files aligned with Source Environment Files without exposing source values.

## Development

Run the CLI locally:

```sh
pnpm envolix --help
pnpm envolix sync --help
```

Sync the default Source Environment File to the default Example Environment File:

```sh
pnpm envolix sync
```

Sync explicit file paths:

```sh
pnpm envolix sync .env .env.example
```

The MVP `sync` command projects one Source Environment File to one file-based Sync Target. Source values are rendered as Blank Assignments in the target.

Run tests:

```sh
pnpm test
```
