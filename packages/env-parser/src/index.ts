export const packageName = '@envolix/env-parser';

export type EnvLineEnding = 'lf' | 'crlf' | 'mixed' | 'none';
export type EnvQuoteStyle = 'none' | 'single' | 'double';

export interface EnvLineRange {
  readonly start: number;
  readonly end: number;
}

export interface EnvCommentSegment {
  readonly raw: string;
  readonly text: string;
}

export interface EnvComment {
  readonly raw: string;
  readonly segments: readonly EnvCommentSegment[];
}

export interface EnvBlankLine {
  readonly type: 'blank';
  readonly raw: string;
  readonly lineRange: EnvLineRange;
}

export interface EnvFullLineComment {
  readonly type: 'comment';
  readonly raw: string;
  readonly lineRange: EnvLineRange;
  readonly comment: EnvComment;
}

export interface EnvUnknownLine {
  readonly type: 'unknown';
  readonly raw: string;
  readonly lineRange: EnvLineRange;
}

export interface EnvEntry {
  readonly type: 'entry';
  readonly raw: string;
  readonly lineRange: EnvLineRange;
  readonly key: string;
  readonly value: string;
  readonly rawValue: string;
  readonly quoteStyle: EnvQuoteStyle;
  readonly exportPrefix: string | undefined;
  readonly inlineComment: EnvComment | undefined;
}

export type EnvNode = EnvBlankLine | EnvEntry | EnvFullLineComment | EnvUnknownLine;

export interface EnvDocument {
  readonly type: 'document';
  readonly nodes: readonly EnvNode[];
  readonly keyIndex: Readonly<Record<string, readonly EnvEntry[]>>;
  readonly lineEnding: EnvLineEnding;
  readonly finalNewline: boolean;
  findEntry(key: string): EnvEntry | undefined;
  findEntries(key: string): readonly EnvEntry[];
}

interface PhysicalLine {
  readonly text: string;
  readonly ending: '' | '\n' | '\r\n';
}

interface EntryParseResult {
  readonly entry: EnvEntry | undefined;
  readonly consumedLines: number;
}

const keyPattern = /^[a-zA-Z_]+[a-zA-Z0-9_]*$/;

export function parseEnvDocument(source: string): EnvDocument {
  const physicalLines = splitPhysicalLines(source);
  const nodes: EnvNode[] = [];

  for (let index = 0; index < physicalLines.length; ) {
    const line = physicalLines[index];
    if (line === undefined) {
      break;
    }

    const lineNumber = index + 1;

    if (line.text.trim() === '') {
      nodes.push({
        type: 'blank',
        raw: line.text,
        lineRange: { start: lineNumber, end: lineNumber },
      });
      index += 1;
      continue;
    }

    if (/^\s*#/.test(line.text)) {
      nodes.push({
        type: 'comment',
        raw: line.text,
        lineRange: { start: lineNumber, end: lineNumber },
        comment: parseComment(line.text.slice(line.text.indexOf('#'))),
      });
      index += 1;
      continue;
    }

    const parsedEntry = parseEntryAt(physicalLines, index);
    if (parsedEntry.entry !== undefined) {
      nodes.push(parsedEntry.entry);
      index += parsedEntry.consumedLines;
      continue;
    }

    nodes.push({
      type: 'unknown',
      raw: line.text,
      lineRange: { start: lineNumber, end: lineNumber },
    });
    index += 1;
  }

  const keyIndex = createKeyIndex(nodes);

  return {
    type: 'document',
    nodes: Object.freeze(nodes),
    keyIndex,
    lineEnding: detectLineEnding(physicalLines),
    finalNewline: source.endsWith('\n'),
    findEntry(key) {
      return this.findEntries(key)[0];
    },
    findEntries(key) {
      return keyIndex[key] ?? emptyEntries;
    },
  };
}

export const parseEnv = parseEnvDocument;

function splitPhysicalLines(source: string): PhysicalLine[] {
  if (source === '') {
    return [];
  }

  const lines: PhysicalLine[] = [];
  const linePattern = /([^\r\n]*)(\r\n|\n|$)/g;
  let match: RegExpExecArray | null;

  while ((match = linePattern.exec(source)) !== null) {
    const text = match[1] ?? '';
    const ending = (match[2] ?? '') as PhysicalLine['ending'];

    if (text === '' && ending === '') {
      break;
    }

    lines.push({ text, ending });

    if (ending === '') {
      break;
    }
  }

  return lines;
}

function parseEntryAt(lines: readonly PhysicalLine[], startIndex: number): EntryParseResult {
  const firstLine = lines[startIndex];
  if (firstLine === undefined) {
    return { entry: undefined, consumedLines: 0 };
  }

  const parsedHead = parseEntryHead(firstLine.text);
  if (parsedHead === undefined) {
    return { entry: undefined, consumedLines: 1 };
  }

  const { exportPrefix, key, valueStart } = parsedHead;
  const valueSource = firstLine.text.slice(valueStart);
  const quote = valueSource.trimStart()[0];

  if (quote === '`') {
    return { entry: undefined, consumedLines: 1 };
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
    entry: {
      type: 'entry',
      raw: firstLine.text,
      lineRange: { start: startIndex + 1, end: startIndex + 1 },
      key,
      value: rawValue.trim(),
      rawValue,
      quoteStyle: 'none',
      exportPrefix,
      inlineComment: commentRaw.startsWith('#') ? parseComment(commentRaw) : undefined,
    },
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
    return { entry: undefined, consumedLines: 0 };
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
      const commentStart = afterQuote.search(/\s#/);
      const commentRaw = commentStart === -1 ? undefined : afterQuote.slice(commentStart).trim();
      const raw = joinRawLines(lines, startIndex, currentLineIndex);

      return {
        consumedLines: currentLineIndex - startIndex + 1,
        entry: {
          type: 'entry',
          raw,
          lineRange: { start: startIndex + 1, end: currentLineIndex + 1 },
          key: context.key,
          value: rawValueParts.join(''),
          rawValue: `${context.quote}${rawValueParts.join('')}${context.quote}`,
          quoteStyle: context.quote === "'" ? 'single' : 'double',
          exportPrefix: context.exportPrefix,
          inlineComment:
            commentRaw?.startsWith('#') === true ? parseComment(commentRaw) : undefined,
        },
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

  return { entry: undefined, consumedLines: 1 };
}

function findUnquotedValueEnd(source: string): number {
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '#' && (index === 0 || /\s/.test(source[index - 1] ?? ''))) {
      return index;
    }
  }

  return source.length;
}

function parseComment(raw: string): EnvComment {
  const segments: EnvCommentSegment[] = [];
  const segmentPattern = /#[^#]*/g;
  let match: RegExpExecArray | null;

  while ((match = segmentPattern.exec(raw)) !== null) {
    const segment = match[0] ?? '';
    segments.push({
      raw: segment,
      text: segment.slice(1).trim(),
    });
  }

  return {
    raw,
    segments: Object.freeze(segments),
  };
}

function createKeyIndex(nodes: readonly EnvNode[]): Readonly<Record<string, readonly EnvEntry[]>> {
  const mutableIndex: Record<string, EnvEntry[]> = Object.create(null) as Record<
    string,
    EnvEntry[]
  >;

  for (const node of nodes) {
    if (node.type !== 'entry') {
      continue;
    }

    const entries = mutableIndex[node.key] ?? [];
    entries.push(node);
    mutableIndex[node.key] = entries;
  }

  for (const key of Object.keys(mutableIndex)) {
    Object.freeze(mutableIndex[key]);
  }

  return Object.freeze(mutableIndex);
}

function detectLineEnding(lines: readonly PhysicalLine[]): EnvLineEnding {
  const endings = new Set(lines.map((line) => line.ending).filter(Boolean));
  if (endings.size === 0) {
    return 'none';
  }

  if (endings.size > 1) {
    return 'mixed';
  }

  return endings.has('\r\n') ? 'crlf' : 'lf';
}

function joinRawLines(
  lines: readonly PhysicalLine[],
  startIndex: number,
  endIndex: number,
): string {
  let raw = '';

  for (let index = startIndex; index <= endIndex; index += 1) {
    const line = lines[index];
    if (line === undefined) {
      continue;
    }

    raw += line.text;
    if (index < endIndex) {
      raw += line.ending;
    }
  }

  return raw;
}

const emptyEntries = Object.freeze([]) as readonly EnvEntry[];
