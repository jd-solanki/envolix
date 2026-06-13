#!/usr/bin/env node
import {
  parseEnvDocument,
  renderExampleEnvDocument,
  validateEnvDocumentForGeneration,
  type EnvDiagnostic,
} from '@envolix/env-parser';
import { Command } from 'commander';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import pc from 'picocolors';
import packageJson from '../package.json' with { type: 'json' };

interface GenOptions {
  readonly source: string;
  readonly target: string;
}

class CliError extends Error {
  constructor(
    message: string,
    readonly details: readonly string[] = [],
  ) {
    super(message);
    this.name = 'CliError';
  }
}

class CliDiagnosticError extends Error {
  constructor(
    readonly sourcePath: string,
    readonly diagnostics: readonly EnvDiagnostic[],
  ) {
    super('Source env file is not valid for generation.');
    this.name = 'CliDiagnosticError';
  }
}

const program = new Command('envolix')
  .description('Generate safe example env files from source env files.')
  .version(packageJson.version);

program
  .command('gen')
  .description('Generate an example env file with private values removed.')
  .option('-s, --source <path>', 'source env file', '.env')
  .option('-t, --target <path>', 'target env file', '.env.example')
  .action(async (options: GenOptions) => {
    try {
      await runGenCommand(options);
    } catch (error) {
      printError(error);
      process.exitCode = 1;
    }
  });

await program.parseAsync();

async function runGenCommand(options: GenOptions): Promise<void> {
  const sourcePath = resolve(process.cwd(), options.source);
  const targetPath = resolve(process.cwd(), options.target);

  if (sourcePath === targetPath) {
    throw new CliError('Source and target paths must be different.', [
      `Both resolved to ${sourcePath}`,
    ]);
  }

  const sourceStat = await statPath(sourcePath, 'source');
  if (sourceStat.isDirectory()) {
    throw new CliError('Source path must be a file, not a directory.', [sourcePath]);
  }

  const targetStat = await statOptional(targetPath);
  if (targetStat?.isDirectory() === true) {
    throw new CliError('Target path must be a file, not a directory.', [targetPath]);
  }

  if (
    targetStat !== undefined &&
    sourceStat.dev === targetStat.dev &&
    sourceStat.ino === targetStat.ino
  ) {
    throw new CliError('Source and target paths must be different.', [
      `Both paths refer to ${sourcePath}`,
    ]);
  }

  const targetParent = dirname(targetPath);
  const targetParentStat = await statPath(targetParent, 'target parent');
  if (!targetParentStat.isDirectory()) {
    throw new CliError('Target parent path must be a directory.', [targetParent]);
  }

  const source = await readFile(sourcePath, 'utf8');
  const document = parseEnvDocument(source);
  const diagnostics = validateEnvDocumentForGeneration(document);
  if (diagnostics.length > 0) {
    throw new CliDiagnosticError(sourcePath, diagnostics);
  }

  const output = renderExampleEnvDocument(document);
  await writeFileAtomically(targetPath, output);

  console.log(pc.green(`Generated ${options.target} from ${options.source}`));
}

async function statPath(path: string, label: string) {
  try {
    return await stat(path);
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      throw new CliError(`${capitalize(label)} path does not exist.`, [path]);
    }

    throw error;
  }
}

async function statOptional(path: string) {
  try {
    return await stat(path);
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return undefined;
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

function printError(error: unknown): void {
  if (error instanceof CliDiagnosticError) {
    console.error(pc.red('Error: ') + error.message);
    for (const diagnostic of error.diagnostics) {
      console.error(formatDiagnostic(error.sourcePath, diagnostic));
    }
    return;
  }

  if (error instanceof CliError) {
    console.error(pc.red('Error: ') + error.message);
    for (const detail of error.details) {
      console.error(pc.dim(detail));
    }
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error(pc.red('Error: ') + message);
}

function formatDiagnostic(sourcePath: string, diagnostic: EnvDiagnostic): string {
  return [
    pc.yellow(diagnostic.code),
    pc.dim(`${sourcePath}:${formatLineRange(diagnostic.lineRange)}`),
    diagnostic.message,
  ].join(' ');
}

function formatLineRange(lineRange: EnvDiagnostic['lineRange']): string {
  return lineRange.start === lineRange.end
    ? String(lineRange.start)
    : `${lineRange.start}-${lineRange.end}`;
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
