# Parser returns an ordered env document

The env parser returns an ordered env document instead of a key/value object because Envolix must preserve comments, blank lines, ordering, and unknown lines when generating target env files. A convenience key lookup API can sit on top of the document, but the document structure is the canonical parser result.
