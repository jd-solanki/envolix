# Keep CLI thin over parser package

`@envolix/cli` depends on `@envolix/env-parser` through its public API and owns command-line concerns such as arguments, filesystem access, same-file safety checks, errors, and exit codes. Parsing, generation validation, and example env rendering live in `@envolix/env-parser` so the core behavior is reusable without invoking the `envolix` binary. Example env rendering validates the env document before producing output; Envolix does not expose an unsafe renderer for invalid source documents.
