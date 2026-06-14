# Parser package is AST-first

`@envolix/env-parser` owns parsing a source env file into an env document and preserving parser diagnostics for Node-compatible env file rules. Target generation belongs to `@envolix/cli`: the CLI consumes the env document, validates whether a target env file can be generated, renders generated target syntax, handles filesystem safety, and presents diagnostics. The reusable seam is the env document, not parser-owned target rendering.
