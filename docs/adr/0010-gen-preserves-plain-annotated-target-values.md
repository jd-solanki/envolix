# Gen preserves plain-annotated target values

By default, `gen` now reads back the existing target env file and, for any key whose **source** entry is annotated `varType:plain`, reuses that key's existing target value verbatim instead of blanking it. This is a deliberate DX win — hand-entered example values for non-sensitive keys (e.g. a dev server URL) survive regeneration — gated behind a security-first rule so the shareable target can never silently re-commit a secret. The `--no-preserve` flag forces a fresh, fully-blanked target (the previous behavior).

## Considered Options

- **Source of preserved values.** We read them back from the existing target file itself (stateless, matches the user story) rather than introducing a separate defaults/overrides file (a new tracked artifact for no added benefit).
- **Eligibility gate.** We preserve **only** when the source entry is annotated `varType:plain`. Secret-annotated **and** unannotated keys are always blanked. We rejected "preserve any non-blank target value" (trust-the-user) because the target is the committable, shareable artifact and a leaked secret would be re-committed on every regen. Security-first wins; the cost is that the DX benefit requires the source author to opt a key in with `# varType:plain`.
- **How the value is rendered.** We copy the target entry's raw value and quote style **byte-for-byte** (value only) rather than re-deriving quoting from the parsed value. This guarantees a clean round-trip — values containing `#`, spaces, or newlines can't be corrupted — and needs no new escaping logic. Everything other than the value (key, order, `export` prefix, full-line and inline comments, blank lines) still comes from the source, which remains authoritative.
- **Messy existing target.** Target parsing is best-effort and never fails `gen`: an ambiguous key (e.g. duplicated in the target) or unparseable content falls back to a generated (blank) value and emits a non-fatal warning. The target is a regenerable artifact, so refusing to regenerate it because it is currently messy would be backwards.

## Consequences

- `gen` becomes the **second workflow after `push` to interpret `varType` annotations**. The resolver (`getEntryVarType`) is extracted from the push module into a shared module so `gen` and `push` can never disagree on a key's kind — a divergence would mean "plain to gen, secret to push" and reopen the leak risk. Interpretation stays in the CLI; the parser continues to preserve annotations uninterpreted.
- `gen` now reads its own previous output as a second input. A future reader seeing `gen` parse the target file should look here for why.
- The "blank `KEY=`" invariant in [ADR-0005](./0005-normalize-generated-target-syntax.md) gains an exception; see the amendment there.
