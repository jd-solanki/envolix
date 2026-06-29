import type { EnvDiagnostic } from '@envolix/env-parser';
import { Command } from 'commander';
import pc from 'picocolors';
import {
  CheckWorkflowDiagnosticError,
  runCheckWorkflow,
  type CheckResult,
} from '../lib/check-workflow';
import { SourceEnvFileError } from '../lib/source-env-file';
import { TargetEnvFileError } from '../lib/target-env-file';
import type { TargetGenerationDiagnosticSet } from '../lib/target-generation';

interface CheckOptions {
  readonly source: string;
  readonly target: string;
  readonly strict: boolean;
}

export const checkCommand = new Command('check')
  .description('Check that a target env file contains every key in its source.')
  .option('-s, --source <path>', 'source env file', '.env')
  .option('-t, --target <path>', 'target env file', '.env.example')
  .option('--strict', 'also report keys in the target that are absent from the source', false)
  .action(async (options: CheckOptions) => {
    try {
      const result = await runCheckWorkflow({
        cwd: process.cwd(),
        source: options.source,
        target: options.target,
        strict: options.strict,
      });
      reportCheckResult(result, options);
    } catch (error) {
      printError(error);
      process.exitCode = 1;
    }
  });

function reportCheckResult(result: CheckResult, options: CheckOptions): void {
  const report = renderCheckResult(result, { source: options.source, target: options.target });
  const paint = report.exitCode === EXIT_OK ? pc.green : pc.red;
  const write = report.exitCode === EXIT_OK ? console.log : console.error;

  for (const line of report.lines) {
    write(paint(line));
  }

  process.exitCode = report.exitCode;
}

export interface CheckReport {
  readonly lines: readonly string[];
  readonly exitCode: number;
}

interface CheckReportPaths {
  readonly source: string;
  readonly target: string;
}

const EXIT_OK = 0;
const EXIT_DRIFT = 1;

// Turns a check result into the lines to print and the process exit code. Kept
// pure — no color, no I/O — so the drift-reporting logic is unit-testable on its
// own; the command layer adds color and chooses the output stream.
export function renderCheckResult(result: CheckResult, paths: CheckReportPaths): CheckReport {
  if (result.missingKeys.length === 0 && result.extraKeys.length === 0) {
    return {
      lines: [`✓ ${paths.target} covers all keys in ${paths.source}`],
      exitCode: EXIT_OK,
    };
  }

  return {
    lines: [
      ...keyGroup(result.missingKeys, `✗ ${paths.target} is missing keys from ${paths.source}:`),
      ...keyGroup(result.extraKeys, `✗ ${paths.target} has keys absent from ${paths.source}:`),
    ],
    exitCode: EXIT_DRIFT,
  };
}

function keyGroup(keys: readonly string[], heading: string): string[] {
  if (keys.length === 0) {
    return [];
  }

  return [heading, ...keys.map((key) => `  - ${key}`)];
}

function printError(error: unknown): void {
  if (error instanceof CheckWorkflowDiagnosticError) {
    console.error(pc.red('Error: ') + error.message);
    for (const diagnostic of error.diagnostics) {
      console.error(formatDiagnostic(error.sourcePath, diagnostic));
    }
    return;
  }

  if (error instanceof SourceEnvFileError || error instanceof TargetEnvFileError) {
    console.error(pc.red('Error: ') + error.message);
    for (const detail of error.details) {
      console.error(pc.dim(detail));
    }
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error(pc.red('Error: ') + message);
}

function formatDiagnostic(sourcePath: string, diagnostic: TargetGenerationDiagnosticSet): string {
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
