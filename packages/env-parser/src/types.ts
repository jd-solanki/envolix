export type EnvLineEnding = 'lf' | 'crlf' | 'mixed' | 'none';
export type EnvQuoteStyle = 'none' | 'single' | 'double';
export type EnvDiagnosticPhase = 'parse';
export type EnvDiagnosticCode =
  | 'InvalidKey'
  | 'UnsupportedQuote'
  | 'UnterminatedQuote'
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
