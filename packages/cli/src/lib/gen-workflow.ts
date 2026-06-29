import { parseEnvDocument, type EnvDiagnostic, type EnvDocument } from '@envolix/env-parser';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { constants, type Stats } from 'node:fs';
import { readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { isNodeError, statOptional } from './fs';
import { readSourceEnvFile } from './source-env-file';
import {
  renderTargetEnvDocument,
  validateEnvDocumentForTargetGeneration,
  type TargetGenerationDiagnostic,
} from './target-generation';
import { resolveValuePreservation, type ValuePreservation } from './value-preservation';

const execFileAsync = promisify(execFile);

export interface GenWorkflowOptions {
  readonly cwd: string;
  readonly source: string;
  readonly target: string;
  /** Reuse eligible existing target values instead of blanking them. Defaults to `true`. */
  readonly preserve?: boolean;
  readonly stage?: boolean;
}

export interface GenWorkflowResult {
  /** Non-fatal messages about values that could not be preserved (e.g. ambiguous target keys). */
  readonly warnings: readonly string[];
}

export class GenWorkflowError extends Error {
  constructor(
    message: string,
    readonly details: readonly string[] = [],
  ) {
    super(message);
    this.name = 'GenWorkflowError';
  }
}

export class GenWorkflowDiagnosticError extends Error {
  constructor(
    readonly sourcePath: string,
    readonly diagnostics: readonly (EnvDiagnostic | TargetGenerationDiagnostic)[],
  ) {
    super('Source env file is not valid for generation.');
    this.name = 'GenWorkflowDiagnosticError';
  }
}

export async function runGenWorkflow(options: GenWorkflowOptions): Promise<GenWorkflowResult> {
  const sourcePath = resolve(options.cwd, options.source);
  const targetPath = resolve(options.cwd, options.target);

  if (sourcePath === targetPath) {
    throw new GenWorkflowError('Source and target paths must be different.', [
      `Both resolved to ${sourcePath}`,
    ]);
  }

  const sourceEnvFile = await readSourceEnvFile({ cwd: options.cwd, source: options.source });

  const targetStat = await statOptional(targetPath);
  if (targetStat?.isDirectory() === true) {
    throw new GenWorkflowError('Target path must be a file, not a directory.', [targetPath]);
  }

  if (
    targetStat !== undefined &&
    sourceEnvFile.stats.dev === targetStat.dev &&
    sourceEnvFile.stats.ino === targetStat.ino
  ) {
    throw new GenWorkflowError('Source and target paths must be different.', [
      `Both paths refer to ${sourcePath}`,
    ]);
  }

  const targetParent = dirname(targetPath);
  const targetParentStat = await statPath(targetParent, 'target parent');
  if (!targetParentStat.isDirectory()) {
    throw new GenWorkflowError('Target parent path must be a directory.', [targetParent]);
  }

  const diagnostics = validateEnvDocumentForTargetGeneration(sourceEnvFile.document);
  if (diagnostics.length > 0) {
    throw new GenWorkflowDiagnosticError(sourceEnvFile.path, diagnostics);
  }

  const preservation = await resolvePreservation(
    options,
    targetPath,
    targetStat,
    sourceEnvFile.document,
  );

  const output = renderTargetEnvDocument(sourceEnvFile.document, {
    preservedValues: preservation.values,
  });
  await writeFileAtomically(targetPath, output);

  if (options.stage) {
    await stageGeneratedFile(options.cwd, targetPath);
  }

  return { warnings: preservation.warnings };
}

const NO_PRESERVATION: ValuePreservation = Object.freeze({
  values: new Map<string, string>(),
  warnings: Object.freeze([]),
});

async function resolvePreservation(
  options: GenWorkflowOptions,
  targetPath: string,
  targetStat: Stats | undefined,
  sourceDocument: EnvDocument,
): Promise<ValuePreservation> {
  if (options.preserve === false || targetStat === undefined) {
    return NO_PRESERVATION;
  }

  const existingTarget = parseEnvDocument(await readFile(targetPath, 'utf8'));
  return resolveValuePreservation(sourceDocument, existingTarget);
}

async function stageGeneratedFile(cwd: string, filePath: string): Promise<void> {
  try {
    await execFileAsync('git', ['add', '--', filePath], { cwd });
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr ?? '';
    if (
      stderr.includes('not a git repository') ||
      (error instanceof Error &&
        'code' in error &&
        (error as NodeJS.ErrnoException).code === 'ENOENT')
    ) {
      process.stderr.write(`Warning: --stage skipped: ${stderr.trim() || 'git not found'}\n`);
      return;
    }
    throw new GenWorkflowError('Failed to stage generated file.', [stderr.trim() || String(error)]);
  }
}

async function statPath(path: string, label: string) {
  try {
    return await stat(path);
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      throw new GenWorkflowError(`${capitalize(label)} path does not exist.`, [path]);
    }

    throw error;
  }
}

async function writeFileAtomically(targetPath: string, content: string): Promise<void> {
  const temporaryPath = resolve(dirname(targetPath), `.${randomUUID()}.tmp`);

  try {
    await writeFile(temporaryPath, content, {
      encoding: 'utf8',
      flag: constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
    });
    await rename(temporaryPath, targetPath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
