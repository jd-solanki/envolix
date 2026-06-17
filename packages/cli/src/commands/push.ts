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
import { renderTable } from '../utils/table.js';

interface PushOptions {
  readonly source: string;
  readonly provider: 'github';
  readonly repo?: string;
  readonly environment?: string;
  readonly dryRun: boolean;
  readonly yes: boolean;
}

export const pushCommand = new Command('push')
  .description('Push source env values to a provider.')
  .option('-s, --source <path>', 'source env file', '.env')
  .requiredOption('-p, --provider <name>', 'provider to push to (github)', parseProvider)
  .option('--repo <owner/name>', 'GitHub repository to push to')
  .option('-e, --environment <name>', 'GitHub Environment to push to')
  .option('--dry-run', 'print the plan without writing remote values', false)
  .option('-y, --yes', 'skip confirmation prompt', false)
  .action(async (options: PushOptions) => {
    try {
      const provider = createProvider(options.provider);
      const plan = await planPush({
        cwd: process.cwd(),
        source: options.source,
        provider,
        ...(options.repo === undefined ? {} : { repo: options.repo }),
        ...(options.environment === undefined ? {} : { environment: options.environment }),
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
  console.log(`  ${formatTarget(plan)}`);

  if (plan.entries.length === 0) {
    console.log(pc.dim('  No entries to push.'));
    return;
  }

  const rows = plan.entries.map((entry) => [entry.key, colorAction(entry.action), entry.kind]);
  console.log();
  console.log(indent(renderTable(['Key', 'Action', 'Kind'], rows)));
}

function printResult(result: PushResult): void {
  console.log('Push result:');
  console.log(`  ${formatTarget(result)}`);

  const rows = result.entries.map((entry) => [entry.key, colorStatus(entry.status)]);
  const table = renderTable(['Key', 'Status'], rows);
  if (table.length > 0) {
    console.log();
    console.log(indent(table));
  }

  printErrors(result.entries);
}

function printErrors(entries: PushResult['entries']): void {
  const failures = entries.filter((entry) => entry.error !== undefined);
  if (failures.length === 0) {
    return;
  }

  const keyWidth = Math.max(...failures.map((failure) => failure.key.length));
  console.log();
  console.log('Errors:');
  for (const failure of failures) {
    // Provider errors (e.g. GitHub's multi-line HTTP 422) span several lines;
    // collapse them so each failure stays on one aligned row beneath its key.
    const message = (failure.error ?? '').replace(/\s+/g, ' ').trim();
    console.log(`  ${failure.key.padEnd(keyWidth)}  ${pc.dim(message)}`);
  }
}

function colorAction(action: PushPlan['entries'][number]['action']): string {
  return action === 'create' ? pc.green(action) : pc.yellow(action);
}

function colorStatus(status: PushResult['entries'][number]['status']): string {
  return status === 'success' ? pc.green(status) : pc.red(status);
}

function indent(block: string): string {
  return block
    .split('\n')
    .map((line) => (line.length > 0 ? `  ${line}` : line))
    .join('\n');
}

function formatTarget(targeted: Pick<PushPlan, 'target'>): string {
  const scope =
    targeted.target.environment === undefined
      ? 'GitHub Actions repository scope'
      : `GitHub Environment: ${targeted.target.environment}`;
  return targeted.target.repo === undefined ? scope : `${scope} in ${targeted.target.repo}`;
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
