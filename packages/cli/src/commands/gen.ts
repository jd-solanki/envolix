import type { EnvDiagnostic } from '@envolix/env-parser';
import { Command } from 'commander';
import pc from 'picocolors';
import {
  GenWorkflowDiagnosticError,
  GenWorkflowError,
  runGenWorkflow,
} from '../lib/gen-workflow.js';
import type { TargetGenerationDiagnostic } from '../lib/target-generation.js';

interface GenOptions {
  readonly source: string;
  readonly target: string;
}

export const genCommand = new Command('gen')
  .description('Generate an example env file with private values removed.')
  .option('-s, --source <path>', 'source env file', '.env')
  .option('-t, --target <path>', 'target env file', '.env.example')
  .action(async (options: GenOptions) => {
    try {
      await runGenWorkflow({
        cwd: process.cwd(),
        source: options.source,
        target: options.target,
      });
      console.log(pc.green(`Generated ${options.target} from ${options.source}`));
    } catch (error) {
      printError(error);
      process.exitCode = 1;
    }
  });

function printError(error: unknown): void {
  if (error instanceof GenWorkflowDiagnosticError) {
    console.error(pc.red('Error: ') + error.message);
    for (const diagnostic of error.diagnostics) {
      console.error(formatDiagnostic(error.sourcePath, diagnostic));
    }
    return;
  }

  if (error instanceof GenWorkflowError) {
    console.error(pc.red('Error: ') + error.message);
    for (const detail of error.details) {
      console.error(pc.dim(detail));
    }
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error(pc.red('Error: ') + message);
}

function formatDiagnostic(
  sourcePath: string,
  diagnostic: EnvDiagnostic | TargetGenerationDiagnostic,
): string {
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
