import { parseComment } from './comments';
import { createDiagnostic, createUnknownLineDiagnostic } from './diagnostics';
import { joinRawLines, type PhysicalLine } from './lines';
import { freezeNode } from './nodes';
import type { EnvComment, EnvDiagnostic, EnvEntry } from './types';

interface EntryParseResult {
  readonly entry: EnvEntry | undefined;
  readonly diagnostic: EnvDiagnostic | undefined;
  readonly consumedLines: number;
}

const keyPattern = /^[a-zA-Z_]+[a-zA-Z0-9_]*$/;

export function parseEntryAt(lines: readonly PhysicalLine[], startIndex: number): EntryParseResult {
  const firstLine = lines[startIndex];
  if (firstLine === undefined) {
    return { entry: undefined, diagnostic: undefined, consumedLines: 0 };
  }

  const parsedHead = parseEntryHead(firstLine.text);
  if (parsedHead === undefined) {
    return {
      entry: undefined,
      diagnostic: diagnoseInvalidEntryHead(firstLine.text, startIndex + 1),
      consumedLines: 1,
    };
  }

  const { exportPrefix, key, valueStart } = parsedHead;
  const valueSource = firstLine.text.slice(valueStart);
  const quote = valueSource.trimStart()[0];

  if (quote === '`') {
    return {
      entry: undefined,
      diagnostic: createDiagnostic({
        phase: 'parse',
        code: 'UnsupportedQuote',
        message: 'Backtick-quoted env values are not supported.',
        lineRange: { start: startIndex + 1, end: startIndex + 1 },
      }),
      consumedLines: 1,
    };
  }

  if (quote === "'" || quote === '"') {
    return parseQuotedEntry(lines, startIndex, {
      exportPrefix,
      key,
      valueSource,
      quote,
      valueOffset: valueStart,
    });
  }

  const valueEnd = findUnquotedValueEnd(valueSource);
  const rawValue = valueSource.slice(0, valueEnd);
  const commentRaw = valueSource.slice(valueEnd).trimStart();

  return {
    consumedLines: 1,
    diagnostic: undefined,
    entry: freezeNode({
      type: 'entry',
      raw: firstLine.text,
      lineRange: { start: startIndex + 1, end: startIndex + 1 },
      key,
      value: rawValue.trim(),
      rawValue,
      quoteStyle: 'none',
      exportPrefix,
      inlineComment: commentRaw.startsWith('#') ? parseComment(commentRaw) : undefined,
    }),
  };
}

function parseEntryHead(line: string):
  | {
      readonly exportPrefix: string | undefined;
      readonly key: string;
      readonly valueStart: number;
    }
  | undefined {
  let restOffset = line.search(/\S/);
  if (restOffset === -1) {
    return undefined;
  }

  let exportPrefix: string | undefined;
  const rest = line.slice(restOffset);
  const exportMatch = /^export[ \t]+/.exec(rest);
  if (exportMatch !== null) {
    exportPrefix = exportMatch[0];
    restOffset += exportMatch[0].length;
  }

  const equalsIndex = line.indexOf('=', restOffset);
  if (equalsIndex === -1) {
    return undefined;
  }

  const key = line.slice(restOffset, equalsIndex).trim();
  if (!keyPattern.test(key)) {
    return undefined;
  }

  return {
    exportPrefix,
    key,
    valueStart: equalsIndex + 1,
  };
}

function parseQuotedEntry(
  lines: readonly PhysicalLine[],
  startIndex: number,
  context: {
    readonly exportPrefix: string | undefined;
    readonly key: string;
    readonly valueSource: string;
    readonly quote: "'" | '"';
    readonly valueOffset: number;
  },
): EntryParseResult {
  const quoteStartOffset = context.valueOffset + context.valueSource.search(/\S/);
  const firstLine = lines[startIndex];
  if (firstLine === undefined) {
    return { entry: undefined, diagnostic: undefined, consumedLines: 0 };
  }

  const rawValueParts: string[] = [];
  let currentLineIndex = startIndex;
  let currentOffset = quoteStartOffset + 1;

  while (currentLineIndex < lines.length) {
    const line = lines[currentLineIndex];
    if (line === undefined) {
      break;
    }

    const closingOffset = line.text.indexOf(context.quote, currentOffset);
    if (closingOffset !== -1) {
      rawValueParts.push(line.text.slice(currentOffset, closingOffset));
      const afterQuote = line.text.slice(closingOffset + 1);
      const raw = joinRawLines(lines, startIndex, currentLineIndex);
      const parsedSuffix = parseQuotedValueSuffix(afterQuote);

      if (parsedSuffix === undefined) {
        return {
          entry: undefined,
          diagnostic: createUnknownLineDiagnostic(raw, startIndex + 1),
          consumedLines: currentLineIndex - startIndex + 1,
        };
      }

      return {
        consumedLines: currentLineIndex - startIndex + 1,
        diagnostic: undefined,
        entry: freezeNode({
          type: 'entry',
          raw,
          lineRange: { start: startIndex + 1, end: currentLineIndex + 1 },
          key: context.key,
          value: rawValueParts.join(''),
          rawValue: `${context.quote}${rawValueParts.join('')}${context.quote}`,
          quoteStyle: context.quote === "'" ? 'single' : 'double',
          exportPrefix: context.exportPrefix,
          inlineComment: parsedSuffix.inlineComment,
        }),
      };
    }

    rawValueParts.push(line.text.slice(currentOffset));
    currentLineIndex += 1;
    const nextLine = lines[currentLineIndex];
    if (nextLine !== undefined) {
      rawValueParts.push(line.ending);
    }
    currentOffset = 0;
  }

  return {
    entry: undefined,
    diagnostic: createDiagnostic({
      phase: 'parse',
      code: 'UnterminatedQuote',
      message: `Quoted env value for key "${context.key}" is missing a closing quote.`,
      lineRange: { start: startIndex + 1, end: lines.length },
    }),
    consumedLines: lines.length - startIndex,
  };
}

function parseQuotedValueSuffix(
  afterQuote: string,
): { readonly inlineComment: EnvComment | undefined } | undefined {
  if (/^[ \t]*$/.test(afterQuote)) {
    return { inlineComment: undefined };
  }

  const commentMatch = /^[ \t]+(#.*)$/.exec(afterQuote);
  if (commentMatch !== null) {
    return { inlineComment: parseComment(commentMatch[1] ?? '#') };
  }

  return undefined;
}

function diagnoseInvalidEntryHead(line: string, lineNumber: number): EnvDiagnostic | undefined {
  const restOffset = line.search(/\S/);
  if (restOffset === -1) {
    return undefined;
  }

  const rest = line.slice(restOffset);
  const exportMatch = /^export[ \t]+/.exec(rest);
  const keyStart = exportMatch === null ? restOffset : restOffset + exportMatch[0].length;
  const equalsIndex = line.indexOf('=', keyStart);

  if (exportMatch !== null && equalsIndex === -1) {
    return createDiagnostic({
      phase: 'parse',
      code: 'InvalidExport',
      message: 'Export-prefixed env entries must include an assignment.',
      lineRange: { start: lineNumber, end: lineNumber },
    });
  }

  if (equalsIndex !== -1) {
    const key = line.slice(keyStart, equalsIndex).trim();
    if (!keyPattern.test(key)) {
      return createDiagnostic({
        phase: 'parse',
        code: exportMatch === null ? 'InvalidKey' : 'InvalidExport',
        message:
          exportMatch === null
            ? `Env key "${key}" is not a valid Node-compatible key.`
            : `Export-prefixed env key "${key}" is not valid.`,
        lineRange: { start: lineNumber, end: lineNumber },
      });
    }
  }

  return undefined;
}

function findUnquotedValueEnd(source: string): number {
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '#' && (index === 0 || /\s/.test(source[index - 1] ?? ''))) {
      return index;
    }
  }

  return source.length;
}
