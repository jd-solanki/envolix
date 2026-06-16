import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ProviderTarget, RemoteVariable } from './index.js';

const execFileAsync = promisify(execFile);

export interface GhRunResult {
  readonly stdout: string;
  readonly stderr: string;
}

export type GhRunner = (args: readonly string[]) => Promise<GhRunResult>;

export class GhNotFoundError extends Error {
  constructor() {
    super('GitHub CLI `gh` is not installed or is not available on PATH.');
    this.name = 'GhNotFoundError';
  }
}

export class GhNotAuthenticatedError extends Error {
  constructor() {
    super('GitHub CLI `gh` is not authenticated. Run `gh auth login` and try again.');
    this.name = 'GhNotAuthenticatedError';
  }
}

export class GhCommandError extends Error {
  constructor(
    message: string,
    readonly stderr: string,
  ) {
    super(message);
    this.name = 'GhCommandError';
  }
}

export class GhEnvironmentNotFoundError extends Error {
  constructor(readonly environment: string) {
    super(`GitHub Environment "${environment}" does not exist.`);
    this.name = 'GhEnvironmentNotFoundError';
  }
}

export class GhAdapter {
  constructor(private readonly runGh: GhRunner = runGhCommand) {}

  async listSecrets(target: ProviderTarget = {}): Promise<readonly string[]> {
    const result = await this.run(withTarget(['secret', 'list', '--json', 'name'], target), target);
    return parseGhNameList(result.stdout);
  }

  async listVariables(target: ProviderTarget = {}): Promise<readonly RemoteVariable[]> {
    const result = await this.run(
      withTarget(['variable', 'list', '--json', 'name,value'], target),
      target,
    );
    return parseGhVariableList(result.stdout);
  }

  async setSecret(key: string, value: string, target: ProviderTarget = {}): Promise<void> {
    await this.run(withTarget(['secret', 'set', key, '--body', value], target), target);
  }

  async setVariable(key: string, value: string, target: ProviderTarget = {}): Promise<void> {
    await this.run(withTarget(['variable', 'set', key, '--body', value], target), target);
  }

  private async run(args: readonly string[], target: ProviderTarget): Promise<GhRunResult> {
    try {
      return await this.runGh(args);
    } catch (error) {
      throw translateGhError(error, target);
    }
  }
}

async function runGhCommand(args: readonly string[]): Promise<GhRunResult> {
  return execFileAsync('gh', [...args]);
}

function parseGhNameList(stdout: string): readonly string[] {
  const parsed = JSON.parse(stdout === '' ? '[]' : stdout) as unknown;
  if (!Array.isArray(parsed)) {
    throw new GhCommandError('GitHub CLI returned an unexpected response.', stdout);
  }

  return Object.freeze(
    parsed
      .map((entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        'name' in entry &&
        typeof entry.name === 'string'
          ? entry.name
          : undefined,
      )
      .filter((name): name is string => name !== undefined),
  );
}

function parseGhVariableList(stdout: string): readonly RemoteVariable[] {
  const parsed = JSON.parse(stdout === '' ? '[]' : stdout) as unknown;
  if (!Array.isArray(parsed)) {
    throw new GhCommandError('GitHub CLI returned an unexpected response.', stdout);
  }

  return Object.freeze(
    parsed
      .map((entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        'name' in entry &&
        'value' in entry &&
        typeof entry.name === 'string' &&
        typeof entry.value === 'string'
          ? { key: entry.name, value: entry.value }
          : undefined,
      )
      .filter((variable): variable is RemoteVariable => variable !== undefined),
  );
}

function withTarget(args: readonly string[], target: ProviderTarget): readonly string[] {
  return target.environment === undefined ? args : [...args, '--env', target.environment];
}

function translateGhError(error: unknown, target: ProviderTarget): Error {
  if (isNodeError(error) && error.code === 'ENOENT') {
    return new GhNotFoundError();
  }

  const stderr = getStderr(error);
  if (target.environment !== undefined && isEnvironmentNotFound(stderr, target.environment)) {
    return new GhEnvironmentNotFoundError(target.environment);
  }

  if (isAuthenticationFailure(stderr)) {
    return new GhNotAuthenticatedError();
  }

  const message = stderr.trim() === '' ? getErrorMessage(error) : stderr.trim();
  return new GhCommandError(`GitHub CLI command failed: ${message}`, stderr);
}

function isAuthenticationFailure(stderr: string): boolean {
  return /gh auth login|not logged in|authentication required|could not authenticate/i.test(stderr);
}

function isEnvironmentNotFound(stderr: string, environment: string): boolean {
  return (
    /HTTP 404|not found/i.test(stderr) &&
    stderr.toLowerCase().includes(`/environments/${environment.toLowerCase()}`)
  );
}

function getStderr(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'stderr' in error) {
    const stderr = (error as { readonly stderr?: unknown }).stderr;
    return typeof stderr === 'string' ? stderr : '';
  }

  return '';
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
