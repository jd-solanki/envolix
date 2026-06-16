import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

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

export class GhAdapter {
  constructor(private readonly runGh: GhRunner = runGhCommand) {}

  async listSecrets(): Promise<readonly string[]> {
    const result = await this.run(['secret', 'list', '--json', 'name']);
    return parseGhNameList(result.stdout);
  }

  async listVariables(): Promise<readonly string[]> {
    const result = await this.run(['variable', 'list', '--json', 'name']);
    return parseGhNameList(result.stdout);
  }

  async setSecret(key: string, value: string): Promise<void> {
    await this.run(['secret', 'set', key, '--body', value]);
  }

  async setVariable(key: string, value: string): Promise<void> {
    await this.run(['variable', 'set', key, '--body', value]);
  }

  private async run(args: readonly string[]): Promise<GhRunResult> {
    try {
      return await this.runGh(args);
    } catch (error) {
      throw translateGhError(error);
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

function translateGhError(error: unknown): Error {
  if (isNodeError(error) && error.code === 'ENOENT') {
    return new GhNotFoundError();
  }

  const stderr = getStderr(error);
  if (isAuthenticationFailure(stderr)) {
    return new GhNotAuthenticatedError();
  }

  const message = stderr.trim() === '' ? getErrorMessage(error) : stderr.trim();
  return new GhCommandError(`GitHub CLI command failed: ${message}`, stderr);
}

function isAuthenticationFailure(stderr: string): boolean {
  return /gh auth login|not logged in|authentication required|could not authenticate/i.test(stderr);
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
