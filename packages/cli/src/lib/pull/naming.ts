import { access } from 'node:fs/promises';
import { join } from 'node:path';

export interface PulledEnvFileNameOptions {
  readonly cwd: string;
  readonly providerName: string;
  readonly environment?: string;
  readonly now?: Date;
}

export async function createPulledEnvFileName(options: PulledEnvFileNameOptions): Promise<string> {
  const scope = options.environment ?? 'repo';
  const timestamp = formatTimestamp(options.now ?? new Date());
  const baseName = `.env.pull.${sanitizeNamePart(options.providerName)}.${sanitizeNamePart(
    scope,
  )}.${timestamp}`;

  for (let attempt = 0; ; attempt += 1) {
    const fileName = attempt === 0 ? baseName : `${baseName}.${attempt}`;
    if (!(await pathExists(join(options.cwd, fileName)))) {
      return fileName;
    }
  }
}

function formatTimestamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

function sanitizeNamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-');
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
