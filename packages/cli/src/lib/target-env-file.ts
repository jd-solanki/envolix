import { parseEnvDocument, type EnvDocument } from '@envolix/env-parser';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { statOptional } from './fs';

export interface ReadTargetEnvFileOptions {
  readonly cwd: string;
  readonly target: string;
}

export interface TargetEnvFile {
  readonly path: string;
  readonly document: EnvDocument;
}

export class TargetEnvFileError extends Error {
  constructor(
    message: string,
    readonly details: readonly string[] = [],
  ) {
    super(message);
    this.name = 'TargetEnvFileError';
  }
}

/**
 * Read and parse an existing target env file so it can be compared against a
 * source.
 *
 * The file must already exist: check validates a target someone else produced,
 * so a missing target is a setup problem the caller must fix — not key drift to
 * report. This is the opposite contract to generation, where the target is the
 * file being written and may legitimately not exist yet.
 */
export async function readTargetEnvFile(options: ReadTargetEnvFileOptions): Promise<TargetEnvFile> {
  const targetPath = resolve(options.cwd, options.target);
  const targetStats = await statOptional(targetPath);

  if (targetStats === undefined) {
    throw new TargetEnvFileError('Target path does not exist.', [targetPath]);
  }

  if (targetStats.isDirectory()) {
    throw new TargetEnvFileError('Target path must be a file, not a directory.', [targetPath]);
  }

  return Object.freeze({
    path: targetPath,
    document: parseEnvDocument(await readFile(targetPath, 'utf8')),
  });
}
