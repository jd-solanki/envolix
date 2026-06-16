import type { EnvDiagnostic } from '@envolix/env-parser';
import { confirm } from '@inquirer/prompts';
import { Command, InvalidArgumentError } from 'commander';
import pc from 'picocolors';
import { GitHubProvider } from '../lib/provider/github.js';
import type { Provider, PushPlan } from '../lib/provider/index.js';
import {
  PushWorkflowDiagnosticError,
  PushWorkflowError,
  executePush,
  planPush,
  type PushResult,
} from '../lib/push/workflow.js';
import type { PushValidationDiagnostic } from '../lib/push/validation.js';

interface PushOptions {
  readonly source: string;
  readonly provider: 'github';
  readonly dryRun: boolean;
  readonly yes: boolean;
}

export const pushCommand = new Command('push')
  .description('Push source env values to a provider.')
  .option('-s, --source <path>', 'source env file', '.env')
  .requiredOption('-p, --provider <name>', 'provider to push to (github)', parseProvider)
  .option('--dry-run', 'print the plan without writing remote values', false)
  .option('-y, --yes', 'skip confirmation prompt', false)
  .action(async (options: PushOptions) => {
    try {
      const provider = createProvider(options.provider);
      const plan = await planPush({
        cwd: process.cwd(),
        source: options.source,
        provider,
      });

      printPlan(plan);

      if (options.dryRun) {
        console.log(pc.yellow('Dry run: no remote values were changed.'));
        return;
      }

      if (!options.yes && !(await confirm({ message: 'Apply this push plan?' }))) {
        console.log(pc.yellow('Push cancelled.'));
        return;
      }

      const result = await executePush(plan, provider);
      printResult(result);
      if (!result.ok) {
        process.exitCode = 1;
      }
    } catch (error) {
      printError(error);
      process.exitCode = 1;
    }
  });

function parseProvider(value: string): PushOptions['provider'] {
  if (value === 'github') {
    return value;
  }

  throw new InvalidArgumentError(`Unsupported provider "${value}". Supported providers: github.`);
}

function createProvider(provider: PushOptions['provider']): Provider {
  switch (provider) {
    case 'github':
      return new GitHubProvider();
  }
}

function printPlan(plan: PushPlan): void {
  console.log('Push plan:');

  if (plan.entries.length === 0) {
    console.log(pc.dim('  No entries to push.'));
    return;
  }

  for (const entry of plan.entries) {
    console.log(`  ${entry.key} ${pc.dim(entry.action)} ${entry.kind}`);
  }
}

function printResult(result: PushResult): void {
  console.log('Push result:');

  for (const entry of result.entries) {
    const status = entry.status === 'success' ? pc.green('success') : pc.red('failure');
    const error = entry.error === undefined ? '' : ` ${pc.dim(entry.error)}`;
    console.log(`  ${entry.key} ${status}${error}`);
  }
}

function printError(error: unknown): void {
  if (error instanceof PushWorkflowDiagnosticError) {
    console.error(pc.red('Error: ') + error.message);
    for (const diagnostic of error.diagnostics) {
      console.error(formatDiagnostic(error.sourcePath, diagnostic));
    }
    return;
  }

  if (error instanceof PushWorkflowError) {
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
  diagnostic: EnvDiagnostic | PushValidationDiagnostic,
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
