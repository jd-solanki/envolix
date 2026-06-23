# Envolix

Envolix helps teams derive shareable example env files from private env files while keeping the human-authored structure readable.

## Language

**Source env file**:
The env file whose keys, ordering, comments, blank lines, and formatting are treated as authoritative for generation.
_Avoid_: Input env, original env

**Source env file intake**:
The CLI-owned module that resolves a Source env file path, verifies it is readable as a file, reads it, and parses it into an env document for downstream workflows.
_Avoid_: Source loading, Input parsing

**Target env file**:
The example env file produced from a source env file. It is safe to share because generated values are blank.
_Avoid_: Output env, destination env

**Target generation**:
The CLI-owned workflow that consumes an env document, verifies whether a target env file can be produced, and renders generated target syntax.
_Avoid_: Parser rendering, example rendering

**Generated value**:
The blank value written for a key in the target env file when its value is not preserved, replacing the private source value. Target generation removes only env values while preserving comments and document structure. See **Preserved value** for the exception.
_Avoid_: Placeholder, masked value

**Preserved value**:
The value carried over verbatim from the existing target env file into a freshly generated target, used in place of a generated (blank) value. Only entries whose source env entry is annotated `varType:plain` are eligible; secret-annotated and unannotated entries always receive a generated value.
_Avoid_: Kept value, Retained value, Carried-over value

**Value preservation**:
The default target-generation behavior of reusing eligible existing target values instead of blanking them. Disabled with `--no-preserve`, which forces every entry to a generated value.
_Avoid_: Merge, Carry-over, Sticky values

**Env document**:
An ordered representation of an env file as authored, including entries, comments, blank lines, and lines that cannot be interpreted as entries.
_Avoid_: Env object, parsed env map

**Env entry**:
A line in an env document that defines a key and its associated value, along with any surrounding syntax or comment information needed to reproduce the line.
_Avoid_: Env pair, variable row

**Node-compatible env file**:
An env file whose entries follow Node.js dotenv rules. Envolix preserves authored structure, but only treats lines as env entries when Node would recognize them as valid env declarations.
_Avoid_: Dotenv-compatible env file, shell-compatible env file

**Unknown line**:
A line in an env document that is preserved by the parser but is not a valid Node-compatible env entry, comment, or blank line.
_Avoid_: Invalid entry, parse failure

**Duplicate entry**:
An env entry whose key appears more than once in the same source env file. The parser preserves duplicate entries, but generated target env files require source keys to be unique.
_Avoid_: Repeated variable, key conflict

**Multiline value**:
A quoted env entry value that spans more than one physical line according to Node-compatible env rules.
_Avoid_: Block value, heredoc value

**Concrete env syntax**:
The author-facing syntax around an env entry that Envolix preserves as meaningful structure, including quote style, export prefix, comments, and original source range.
_Avoid_: Metadata, formatting extras

**Generated target syntax**:
The normalized env entry syntax used when rendering a target env file from a source env file. Generated entries use `KEY=` with no value quotes, preserve any `export` prefix, and preserve full-line and inline comments.
_Avoid_: Preserved formatting, source formatting

**Blank line**:
A separator line in an env document. Generated target env files preserve blank lines but normalize whitespace-only separator lines to empty lines.
_Avoid_: Empty entry, whitespace entry

**Line ending style**:
The newline convention used by an env document. Generated target env files preserve the source file's line ending style and whether the source ends with a final newline.
_Avoid_: Newline normalization, platform line ending

**Mixed line endings**:
An env document that uses more than one newline convention. The parser can represent mixed line endings, but generated target env files require one consistent line ending style.
_Avoid_: Inconsistent newlines, platform mismatch

**Diagnostic code**:
A stable PascalCase identifier that classifies parser and target generation diagnostics for programmatic handling.
_Avoid_: Error string, reason string

**Comment segment**:
A `#`-prefixed part of a full-line or inline comment. A single comment may contain multiple comment segments that are preserved for later interpretation.
_Avoid_: Comment tag, comment token

**Inline comment**:
A comment that appears after an env entry value on the same logical line.
_Avoid_: Trailing comment, value note

**Comment annotation**:
A structured convention embedded inside a comment segment for downstream automation, such as identifying whether an env value is secret or plain. Comment annotations are preserved by MVP parsing but interpreted in a later version.
_Avoid_: Tag, magic comment

**CLI package**:
The `@envolix/cli` package that publishes the `envolix` command-line binary.
_Avoid_: Envolix package, binary package

**Envolix binary**:
The `envolix` command exposed by the CLI package.
_Avoid_: CLI package, executable package

**Provider**:
An external service that stores env config remotely, such as GitHub, Vercel, or Cloudflare. A provider owns environments and the remote entries within them.
_Avoid_: Target, Platform, Remote, Destination

**Provider catalog**:
The CLI-owned module that maps supported provider names to provider adapters and provider-specific target labels. Commands ask the Provider catalog for provider behavior instead of constructing adapters directly.
_Avoid_: Provider switch, Provider registry

**Environment**:
A named deployment scope on a provider that groups remote entries, such as production, staging, or preview. The unabbreviated word is reserved for this remote scope; the local file world always uses the `env` prefix (env file, env document, env entry).
_Avoid_: Stage, Scope, Deployment target

**Remote entry**:
An individual key and value stored on a provider within an environment. A remote entry is either a remote secret or a remote variable. Mirrors the local env entry.
_Avoid_: Key, Var, Config value

**Remote secret**:
A remote entry whose value is encrypted and write-only on the provider. Push derives secret kind from the source env entry's `varType:secret` comment annotation.
_Avoid_: Encrypted variable, hidden value

**Remote variable**:
A remote entry whose value is stored in readable plain text on the provider. Push derives variable kind from the source env entry's `varType:plain` comment annotation.
_Avoid_: Plain secret, public value

**Sync**:
The capability of moving env config between a local env file and a provider environment, in either direction. Sync is a concept realized by the push and pull commands, not a single command.
_Avoid_: Mirror, Reconcile

**Push**:
The one-way workflow that uploads env entries from a source env file to an environment on a provider, creating or updating remote entries. Push never deletes remote entries that are absent from the source.
_Avoid_: Upload, Deploy, Export

**Pull**:
The one-way workflow that reads remote entries from an environment on a provider and writes them into a local env file. The provider is authoritative for the values pull retrieves.
_Avoid_: Download, Fetch, Import

**Pulled env file**:
A local env file written by pull, containing real remote variable values and blank remote secrets, named to encode its provider and environment. It is sensitive and intended to be gitignored. It is distinct from a target env file, which is safe to share.
_Avoid_: Target env file, Pulled target, Remote env file
