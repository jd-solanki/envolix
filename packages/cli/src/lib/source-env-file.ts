import { parseEnvDocument, type EnvDocument } from '@envolix/env-parser';
import type { Stats } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

export interface ReadSourceEnvFileOptions {
  readonly cwd: string;
  readonly source: string;
}

export interface SourceEnvFile {
  readonly path: string;
  readonly stats: Stats;
  readonly document: EnvDocument;
}

export class SourceEnvFileError extends Error {
  constructor(
    message: string,
    readonly details: readonly string[] = [],
  ) {
    super(message);
    this.name = 'SourceEnvFileError';
  }
}

export async function readSourceEnvFile(options: ReadSourceEnvFileOptions): Promise<SourceEnvFile> {
  const sourcePath = resolve(options.cwd, options.source);
  const sourceStats = await statSourceEnvFile(sourcePath);

  if (sourceStats.isDirectory()) {
    throw new SourceEnvFileError('Source path must be a file, not a directory.', [sourcePath]);
  }

  return Object.freeze({
    path: sourcePath,
    stats: sourceStats,
    document: parseEnvDocument(await readFile(sourcePath, 'utf8')),
  });
}

async function statSourceEnvFile(sourcePath: string): Promise<Stats> {
  try {
    return await stat(sourcePath);
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      throw new SourceEnvFileError('Source path does not exist.', [sourcePath]);
    }

    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
