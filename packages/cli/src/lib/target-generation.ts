import type {
  EnvDiagnostic,
  EnvDocument,
  EnvEntry,
  EnvLineRange,
  EnvNode,
} from '@envolix/env-parser';

export type TargetGenerationDiagnosticCode = 'DuplicateKey' | 'MixedLineEndings';

export interface TargetGenerationDiagnostic {
  readonly phase: 'generation';
  readonly code: TargetGenerationDiagnosticCode;
  readonly message: string;
  readonly lineRange: EnvLineRange;
}

export type TargetGenerationDiagnosticSet = EnvDiagnostic | TargetGenerationDiagnostic;

export class TargetGenerationError extends Error {
  readonly diagnostics: readonly TargetGenerationDiagnosticSet[];

  constructor(diagnostics: readonly TargetGenerationDiagnosticSet[]) {
    super(formatTargetGenerationErrorMessage(diagnostics));
    this.name = 'TargetGenerationError';
    this.diagnostics = Object.freeze([...diagnostics]);
  }
}

export function validateEnvDocumentForTargetGeneration(
  document: EnvDocument,
): readonly TargetGenerationDiagnosticSet[] {
  const diagnostics: TargetGenerationDiagnosticSet[] = [...document.diagnostics];

  if (document.lineEnding === 'mixed') {
    diagnostics.push(
      createTargetGenerationDiagnostic({
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
      createTargetGenerationDiagnostic({
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

export function assertEnvDocumentValidForTargetGeneration(document: EnvDocument): void {
  const diagnostics = validateEnvDocumentForTargetGeneration(document);
  if (diagnostics.length > 0) {
    throw new TargetGenerationError(diagnostics);
  }
}

export interface RenderTargetEnvOptions {
  /**
   * Values to splice after `KEY=` instead of blanking, keyed by env key. Built
   * by value preservation from the existing target; absent keys are blanked.
   */
  readonly preservedValues?: ReadonlyMap<string, string>;
}

export function renderTargetEnvDocument(
  document: EnvDocument,
  options: RenderTargetEnvOptions = {},
): string {
  assertEnvDocumentValidForTargetGeneration(document);

  if (document.nodes.length === 0) {
    return '';
  }

  const preservedValues = options.preservedValues ?? new Map<string, string>();
  const lineEnding = document.lineEnding === 'crlf' ? '\r\n' : '\n';
  const rendered = document.nodes.map((node) => renderNode(node, preservedValues)).join(lineEnding);

  return document.finalNewline ? `${rendered}${lineEnding}` : rendered;
}

function createTargetGenerationDiagnostic(
  diagnostic: TargetGenerationDiagnostic,
): TargetGenerationDiagnostic {
  Object.freeze(diagnostic.lineRange);
  return Object.freeze(diagnostic);
}

function lineRangeForDocument(document: EnvDocument): EnvLineRange {
  const firstNode = document.nodes[0];
  const lastNode = document.nodes.at(-1);

  return {
    start: firstNode?.lineRange.start ?? 1,
    end: lastNode?.lineRange.end ?? 1,
  };
}

function renderNode(node: EnvNode, preservedValues: ReadonlyMap<string, string>): string {
  switch (node.type) {
    case 'blank':
      return '';
    case 'comment':
      return node.raw;
    case 'entry': {
      const value = preservedValues.get(node.key) ?? '';
      return `${node.exportPrefix ?? ''}${node.key}=${value}${renderInlineComment(node)}`;
    }
    case 'unknown':
      throw new TargetGenerationError([node.diagnostic]);
  }
}

function renderInlineComment(entry: EnvEntry): string {
  return entry.inlineComment === undefined ? '' : ` ${entry.inlineComment.raw}`;
}

function formatTargetGenerationErrorMessage(
  diagnostics: readonly TargetGenerationDiagnosticSet[],
): string {
  if (diagnostics.length === 0) {
    return 'Env document is valid for target generation.';
  }

  if (diagnostics.length === 1) {
    return `Env document is not valid for target generation: ${diagnostics[0]?.code}.`;
  }

  return `Env document is not valid for target generation: ${diagnostics.length} diagnostics.`;
}
