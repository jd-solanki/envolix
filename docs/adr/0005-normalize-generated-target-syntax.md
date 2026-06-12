# Normalize generated target syntax

Generated target env files preserve source document order, full-line comments, inline comments, comment annotations, blank lines, export prefixes, line ending style, and final newline presence, but normalize env entries to blank `KEY=` assignments. Envolix removes only env values and does not preserve source assignment spacing or value quotes because the target file is an example artifact with canonical generated syntax, not a byte-for-byte formatting clone.
