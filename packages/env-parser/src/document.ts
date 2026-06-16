import { parseComment } from './comments.js';
import { createUnknownLineDiagnostic } from './diagnostics.js';
import { parseEntryAt } from './entry-parser.js';
import { detectLineEnding, joinRawLines, splitPhysicalLines } from './lines.js';
import { createKeyIndex, emptyEntries, freezeNode } from './nodes.js';
import type { EnvDiagnostic, EnvDocument, EnvNode } from './types.js';

export function parseEnvDocument(source: string): EnvDocument {
  const physicalLines = splitPhysicalLines(source);
  const nodes: EnvNode[] = [];
  const diagnostics: EnvDiagnostic[] = [];

  for (let index = 0; index < physicalLines.length; ) {
    const line = physicalLines[index];
    if (line === undefined) {
      break;
    }

    const lineNumber = index + 1;

    if (line.text.trim() === '') {
      nodes.push(
        freezeNode({
          type: 'blank',
          raw: line.text,
          lineRange: { start: lineNumber, end: lineNumber },
        }),
      );
      index += 1;
      continue;
    }

    if (/^\s*#/.test(line.text)) {
      nodes.push(
        freezeNode({
          type: 'comment',
          raw: line.text,
          lineRange: { start: lineNumber, end: lineNumber },
          comment: parseComment(line.text.slice(line.text.indexOf('#'))),
        }),
      );
      index += 1;
      continue;
    }

    const parsedEntry = parseEntryAt(physicalLines, index);
    if (parsedEntry.entry !== undefined) {
      nodes.push(parsedEntry.entry);
      index += parsedEntry.consumedLines;
      continue;
    }

    const diagnostic = parsedEntry.diagnostic ?? createUnknownLineDiagnostic(line.text, lineNumber);
    diagnostics.push(diagnostic);
    nodes.push(
      freezeNode({
        type: 'unknown',
        raw:
          parsedEntry.consumedLines > 1
            ? joinRawLines(physicalLines, index, index + parsedEntry.consumedLines - 1)
            : line.text,
        lineRange: diagnostic.lineRange,
        diagnostic,
      }),
    );
    index += parsedEntry.consumedLines;
  }

  const keyIndex = createKeyIndex(nodes);

  const document: EnvDocument = {
    type: 'document',
    nodes: Object.freeze(nodes),
    keyIndex,
    diagnostics: Object.freeze(diagnostics),
    lineEnding: detectLineEnding(physicalLines),
    finalNewline: source.endsWith('\n'),
    findEntry(key) {
      return this.findEntries(key)[0];
    },
    findEntries(key) {
      return keyIndex[key] ?? emptyEntries;
    },
  };

  return Object.freeze(document);
}
