export const packageName = '@envolix/env-parser';

export type EnvLineEnding = 'lf' | 'crlf' | 'mixed' | 'none';
export type EnvQuoteStyle = 'none' | 'single' | 'double';
export type EnvDiagnosticPhase = 'parse' | 'generation';
export type EnvDiagnosticCode =
  | 'InvalidKey'
  | 'UnsupportedQuote'
  | 'UnterminatedQuote'
  | 'DuplicateKey'
  | 'MixedLineEndings'
  | 'InvalidExport'
  | 'UnknownLine';

export interface EnvLineRange {
  readonly start: number;
  readonly end: number;
}

export interface EnvDiagnostic {
  readonly phase: EnvDiagnosticPhase;
  readonly code: EnvDiagnosticCode;
  readonly message: string;
  readonly lineRange: EnvLineRange;
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
  readonly diagnostic: EnvDiagnostic;
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
  readonly diagnostics: readonly EnvDiagnostic[];
  readonly lineEnding: EnvLineEnding;
  readonly finalNewline: boolean;
  findEntry(key: string): EnvEntry | undefined;
  findEntries(key: string): readonly EnvEntry[];
}

export class EnvValidationError extends Error {
  readonly diagnostics: readonly EnvDiagnostic[];

  constructor(diagnostics: readonly EnvDiagnostic[]) {
    super(formatValidationErrorMessage(diagnostics));
    this.name = 'EnvValidationError';
    this.diagnostics = Object.freeze([...diagnostics]);
  }
}

interface PhysicalLine {
  readonly text: string;
  readonly ending: '' | '\n' | '\r\n';
}

interface EntryParseResult {
  readonly entry: EnvEntry | undefined;
  readonly diagnostic: EnvDiagnostic | undefined;
  readonly consumedLines: number;
}

const keyPattern = /^[a-zA-Z_]+[a-zA-Z0-9_]*$/;

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

export const parseEnv = parseEnvDocument;

export function validateEnvDocumentForGeneration(document: EnvDocument): readonly EnvDiagnostic[] {
  const diagnostics: EnvDiagnostic[] = [...document.diagnostics];

  if (document.lineEnding === 'mixed') {
    diagnostics.push(
      createDiagnostic({
        phase: 'generation',
        code: 'MixedLineEndings',
        message: 'Source env document uses mixed line endings.',
        lineRange: lineRangeForDocument(document),
      }),
    );
  }

  for (const [key, entries] of Object.entries(document.keyIndex)) {
    if (entries.length <= 1) {
      continue;
    }

    diagnostics.push(
      createDiagnostic({
        phase: 'generation',
        code: 'DuplicateKey',
        message: `Source env document contains duplicate key "${key}".`,
        lineRange: {
          start: entries[0]?.lineRange.start ?? 1,
          end: entries.at(-1)?.lineRange.end ?? entries[0]?.lineRange.end ?? 1,
        },
      }),
    );
  }

  return Object.freeze(diagnostics);
}

export function assertEnvDocumentValidForGeneration(document: EnvDocument): void {
  const diagnostics = validateEnvDocumentForGeneration(document);
  if (diagnostics.length > 0) {
    throw new EnvValidationError(diagnostics);
  }
}

export function renderExampleEnvDocument(document: EnvDocument): string {
  assertEnvDocumentValidForGeneration(document);

  if (document.nodes.length === 0) {
    return '';
  }

  const lineEnding = document.lineEnding === 'crlf' ? '\r\n' : '\n';
  const rendered = document.nodes.map((node) => renderNode(node)).join(lineEnding);

  return document.finalNewline ? `${rendered}${lineEnding}` : rendered;
}

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

  return Object.freeze({
    raw,
    segments: Object.freeze(segments),
  });
}

function freezeNode<TNode extends EnvNode>(node: TNode): TNode {
  Object.freeze(node.lineRange);
  return Object.freeze(node);
}

function createUnknownLineDiagnostic(line: string, lineNumber: number): EnvDiagnostic {
  return createDiagnostic({
    phase: 'parse',
    code: 'UnknownLine',
    message: `Line ${lineNumber} is not a supported env entry, comment, or blank line.`,
    lineRange: { start: lineNumber, end: lineNumber },
  });
}

function createDiagnostic(input: EnvDiagnostic): EnvDiagnostic {
  Object.freeze(input.lineRange);
  return Object.freeze(input);
}

function lineRangeForDocument(document: EnvDocument): EnvLineRange {
  const firstNode = document.nodes[0];
  const lastNode = document.nodes.at(-1);

  return {
    start: firstNode?.lineRange.start ?? 1,
    end: lastNode?.lineRange.end ?? 1,
  };
}

function renderNode(node: EnvNode): string {
  switch (node.type) {
    case 'blank':
      return '';
    case 'comment':
      return node.raw;
    case 'entry':
      return `${node.exportPrefix ?? ''}${node.key}=${renderInlineComment(node)}`;
    case 'unknown':
      throw new EnvValidationError([node.diagnostic]);
  }
}

function renderInlineComment(entry: EnvEntry): string {
  return entry.inlineComment === undefined ? '' : ` ${entry.inlineComment.raw}`;
}

function formatValidationErrorMessage(diagnostics: readonly EnvDiagnostic[]): string {
  if (diagnostics.length === 0) {
    return 'Env document is valid for generation.';
  }

  if (diagnostics.length === 1) {
    return `Env document is not valid for generation: ${diagnostics[0]?.code}.`;
  }

  return `Env document is not valid for generation: ${diagnostics.length} diagnostics.`;
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
