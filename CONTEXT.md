# Envolix

Envolix helps teams derive shareable example env files from private env files while keeping the human-authored structure readable.

## Language

**Source env file**:
The env file whose keys, ordering, comments, blank lines, and formatting are treated as authoritative for generation.
_Avoid_: Input env, original env

**Target env file**:
The example env file produced from a source env file. It is safe to share because generated values are blank.
_Avoid_: Output env, destination env

**Generated value**:
The blank value written for a key in the target env file, replacing the private source value. Target generation removes only env values while preserving comments and document structure.
_Avoid_: Placeholder, masked value

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
A stable PascalCase identifier that classifies parser and generation validation diagnostics for programmatic handling.
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
