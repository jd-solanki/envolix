import { execFile } from 'node:child_process';
import { access, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import type { RemoteEntry } from '../provider/index';

const execFileAsync = promisify(execFile);

export interface PulledEnvFileEntry {
  readonly key: string;
  readonly value: string;
  readonly kind: RemoteEntry['kind'];
}

export interface PlanPulledEnvFileOptions {
  readonly cwd: string;
  readonly providerName: string;
  readonly environment?: string;
  readonly now?: Date;
  readonly entries: readonly PulledEnvFileEntry[];
}

export interface PulledEnvFilePlan {
  readonly fileName: string;
  readonly filePath: string;
  readonly entries: readonly PulledEnvFileEntry[];
  readonly blankSecretKeys: readonly string[];
}

export interface PulledEnvFileResult extends PulledEnvFilePlan {
  readonly isGitIgnored: boolean;
}

export class PulledEnvFileError extends Error {
  constructor(
    message: string,
    readonly details: readonly string[] = [],
  ) {
    super(message);
    this.name = 'PulledEnvFileError';
  }
}

export async function planPulledEnvFile(
  options: PlanPulledEnvFileOptions,
): Promise<PulledEnvFilePlan> {
  const fileName = await createPulledEnvFileName(options);

  return Object.freeze({
    fileName,
    filePath: join(options.cwd, fileName),
    entries: Object.freeze([...options.entries]),
    blankSecretKeys: Object.freeze(
      options.entries.filter((entry) => entry.kind === 'secret').map((entry) => entry.key),
    ),
  });
}

export async function createPulledEnvFile(plan: PulledEnvFilePlan): Promise<PulledEnvFileResult> {
  try {
    await writeFile(plan.filePath, renderPulledEnvFile(plan.entries), { flag: 'wx' });
  } catch (error) {
    if (isNodeError(error) && error.code === 'EEXIST') {
      throw new PulledEnvFileError('Pulled env file already exists.', [plan.filePath]);
    }

    throw error;
  }

  return Object.freeze({
    ...plan,
    isGitIgnored: await isPathGitIgnored(plan.fileName, plan.filePath),
  });
}

function renderPulledEnvFile(entries: readonly PulledEnvFileEntry[]): string {
  if (entries.length === 0) {
    return '';
  }

  return `${entries.map(renderPulledEnvEntry).join('\n')}\n`;
}

function renderPulledEnvEntry(entry: PulledEnvFileEntry): string {
  if (entry.kind === 'secret') {
    return `${entry.key}= #varType:secret`;
  }

  return `${entry.key}=${renderEnvValue(entry.value)}`;
}

function renderEnvValue(value: string): string {
  return /^[^\s#'"`]*$/.test(value) ? value : JSON.stringify(value);
}

async function createPulledEnvFileName(options: PlanPulledEnvFileOptions): Promise<string> {
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

async function isPathGitIgnored(fileName: string, filePath: string): Promise<boolean> {
  const cwd = dirname(filePath);

  try {
    await execFileAsync('git', ['check-ignore', '--quiet', fileName], { cwd });
    return true;
  } catch (error) {
    if (isGitCheckIgnoreMiss(error) || isGitUnavailable(error)) {
      return isPathIgnoredByLocalGitignore(fileName, cwd);
    }

    throw error;
  }
}

async function isPathIgnoredByLocalGitignore(fileName: string, cwd: string): Promise<boolean> {
  const gitignorePath = join(cwd, '.gitignore');
  let gitignore = '';
  try {
    gitignore = await readFile(gitignorePath, 'utf8');
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }

  return gitignore
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .some((pattern) => matchesGitignorePattern(fileName, pattern));
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

function isGitCheckIgnoreMiss(error: unknown): boolean {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? (error as { readonly code?: unknown }).code
      : undefined;

  return code === 1 || code === 128;
}

function isGitUnavailable(error: unknown): boolean {
  return isNodeError(error) && error.code === 'ENOENT';
}

function matchesGitignorePattern(fileName: string, pattern: string): boolean {
  const normalizedPattern = pattern.startsWith('/') ? pattern.slice(1) : pattern;
  if (!normalizedPattern.includes('*')) {
    return fileName === normalizedPattern;
  }

  const escaped = normalizedPattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(fileName);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
