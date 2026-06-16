import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import {
  createProviderTarget,
  type Provider,
  type ProviderTarget,
  type RemoteEntry,
} from '../provider/index.js';
import { createPulledEnvFileName } from './naming.js';

const execFileAsync = promisify(execFile);

export interface PlanPullOptions {
  readonly cwd: string;
  readonly providerName: string;
  readonly provider: Provider;
  readonly repo?: string;
  readonly environment?: string;
  readonly now?: Date;
}

export interface PullPlanEntry {
  readonly key: string;
  readonly value: string;
  readonly kind: RemoteEntry['kind'];
}

export interface PullPlan {
  readonly target: ProviderTarget;
  readonly providerName: string;
  readonly fileName: string;
  readonly filePath: string;
  readonly entries: readonly PullPlanEntry[];
  readonly blankSecretKeys: readonly string[];
}

export interface PullResult extends PullPlan {
  readonly isGitIgnored: boolean;
}

export class PullWorkflowError extends Error {
  constructor(
    message: string,
    readonly details: readonly string[] = [],
  ) {
    super(message);
    this.name = 'PullWorkflowError';
  }
}

export async function planPull(options: PlanPullOptions): Promise<PullPlan> {
  const target = createProviderTarget(options);
  const [remoteEntries, remoteVariables] = await Promise.all([
    options.provider.listRemoteEntries(target),
    options.provider.listRemoteVariables(target),
  ]);
  const variableValues = new Map(remoteVariables.map((variable) => [variable.key, variable.value]));
  const entries = remoteEntries.map((entry): PullPlanEntry => {
    if (entry.kind === 'secret') {
      return { key: entry.key, value: '', kind: 'secret' };
    }

    return { key: entry.key, value: variableValues.get(entry.key) ?? '', kind: 'variable' };
  });
  const blankSecretKeys = entries
    .filter((entry) => entry.kind === 'secret')
    .map((entry) => entry.key);
  const fileName = await createPulledEnvFileName({
    cwd: options.cwd,
    providerName: options.providerName,
    ...(options.environment === undefined ? {} : { environment: options.environment }),
    ...(options.now === undefined ? {} : { now: options.now }),
  });

  return Object.freeze({
    target,
    providerName: options.providerName,
    fileName,
    filePath: join(options.cwd, fileName),
    entries: Object.freeze(entries),
    blankSecretKeys: Object.freeze(blankSecretKeys),
  });
}

export async function executePull(plan: PullPlan): Promise<PullResult> {
  try {
    await writeFile(plan.filePath, renderPulledEnvFile(plan.entries), { flag: 'wx' });
  } catch (error) {
    if (isNodeError(error) && error.code === 'EEXIST') {
      throw new PullWorkflowError('Pulled env file already exists.', [plan.filePath]);
    }

    throw error;
  }

  return Object.freeze({
    ...plan,
    isGitIgnored: await isPathGitIgnored(plan.fileName, plan.filePath),
  });
}

function renderPulledEnvFile(entries: readonly PullPlanEntry[]): string {
  if (entries.length === 0) {
    return '';
  }

  return `${entries.map(renderPulledEnvEntry).join('\n')}\n`;
}

function renderPulledEnvEntry(entry: PullPlanEntry): string {
  if (entry.kind === 'secret') {
    return `${entry.key}= #varType:secret`;
  }

  return `${entry.key}=${renderEnvValue(entry.value)}`;
}

function renderEnvValue(value: string): string {
  return /^[^\s#'"`]*$/.test(value) ? value : JSON.stringify(value);
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
