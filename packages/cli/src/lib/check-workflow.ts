import type { EnvDocument } from '@envolix/env-parser';
import { readSourceEnvFile } from './source-env-file';
import { readTargetEnvFile } from './target-env-file';
import {
  validateEnvDocumentForTargetGeneration,
  type TargetGenerationDiagnosticSet,
} from './target-generation';

export interface CheckWorkflowOptions {
  readonly cwd: string;
  readonly source: string;
  readonly target: string;
  /** Also report keys present in the target but absent from the source. Defaults to `false`. */
  readonly strict?: boolean;
}

/**
 * The outcome of comparing a source env file against a target env file.
 *
 * `missingKeys` are source keys absent from the target; they are always
 * reported. `extraKeys` are target keys absent from the source; they are
 * populated only under strict mode and empty otherwise. Both lists keep the
 * order in which the keys first appear in their originating file.
 */
export interface CheckResult {
  readonly missingKeys: readonly string[];
  readonly extraKeys: readonly string[];
}

export class CheckWorkflowDiagnosticError extends Error {
  constructor(
    readonly sourcePath: string,
    readonly diagnostics: readonly TargetGenerationDiagnosticSet[],
  ) {
    super('Source env file is not valid for checking.');
    this.name = 'CheckWorkflowDiagnosticError';
  }
}

/**
 * Compare a source env file against an existing target env file and report key
 * drift, modifying neither file.
 *
 * The source is held to the same validity rules as generation, so an ambiguous
 * source (duplicate keys, mixed line endings) is rejected before any comparison
 * rather than producing a misleading drift report.
 */
export async function runCheckWorkflow(options: CheckWorkflowOptions): Promise<CheckResult> {
  const source = await readSourceEnvFile({ cwd: options.cwd, source: options.source });

  const diagnostics = validateEnvDocumentForTargetGeneration(source.document);
  if (diagnostics.length > 0) {
    throw new CheckWorkflowDiagnosticError(source.path, diagnostics);
  }

  const target = await readTargetEnvFile({ cwd: options.cwd, target: options.target });

  const sourceKeys = documentKeys(source.document);
  const targetKeys = documentKeys(target.document);
  const sourceKeySet = new Set(sourceKeys);
  const targetKeySet = new Set(targetKeys);

  return Object.freeze({
    missingKeys: sourceKeys.filter((key) => !targetKeySet.has(key)),
    extraKeys: options.strict ? targetKeys.filter((key) => !sourceKeySet.has(key)) : [],
  });
}

// The parser's key index is built in document order and deduplicates repeated
// keys, so this yields each key once in the order it first appears.
function documentKeys(document: EnvDocument): string[] {
  return Object.keys(document.keyIndex);
}
