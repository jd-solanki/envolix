# Follow Node dotenv rules

Envolix targets Node-compatible env files and treats unsupported syntax as non-entry document nodes instead of accepting broader dotenv-package behavior. The parser is implemented in this repository rather than depending on `dotenv` because Envolix needs an ordered document with comments, blank lines, and unknown lines, while `dotenv` exposes a key/value object and accepts compatibility quirks outside the intended Node surface.
