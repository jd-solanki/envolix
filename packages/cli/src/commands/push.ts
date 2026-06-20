import type { EnvDiagnostic } from '@envolix/env-parser';
import { confirm } from '@inquirer/prompts';
import { Command, InvalidArgumentError } from 'commander';
import pc from 'picocolors';
import {
  createProvider,
  formatProviderTarget,
  formatSupportedProviderNames,
  parseProviderName,
  type ProviderName,
} from '../lib/provider/catalog';
import type { PushPlan } from '../lib/provider/index';
import {
  PushWorkflowDiagnosticError,
  executePush,
  planPush,
  type PushResult,
  type PushResultEntry,
} from '../lib/push/workflow';
import { SourceEnvFileError } from '../lib/source-env-file';
import type { PushValidationDiagnostic } from '../lib/push/validation';
import { renderTable } from '../utils/table';

interface PushOptions {
  readonly source: string;
  readonly provider: ProviderName;
  readonly repo?: string;
  readonly environment?: string;
  readonly dryRun: boolean;
  readonly yes: boolean;
}

export const pushCommand = new Command('push')
  .description('Push source env values to a provider.')
  .option('-s, --source <path>', 'source env file', '.env')
  .requiredOption(
    '-p, --provider <name>',
    `provider to push to (${formatSupportedProviderNames()})`,
    parseProvider,
  )
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

      printPlan(options.provider, plan);

      if (options.dryRun) {
        console.log(pc.yellow('Dry run: no remote values were changed.'));
        return;
      }

      if (!options.yes && !(await confirm({ message: 'Apply this push plan?' }))) {
        console.log(pc.yellow('Push cancelled.'));
        return;
      }

      const result = await executePush(plan, provider);
      printResult(options.provider, result);
      if (!result.ok) {
        process.exitCode = 1;
      }
    } catch (error) {
      printError(error);
      process.exitCode = 1;
    }
  });

function parseProvider(value: string): PushOptions['provider'] {
  const providerName = parseProviderName(value);
  if (providerName !== undefined) {
    return providerName;
  }

  throw new InvalidArgumentError(
    `Unsupported provider "${value}". Supported providers: ${formatSupportedProviderNames()}.`,
  );
}

function printPlan(providerName: ProviderName, plan: PushPlan): void {
  console.log('Push plan:');
  console.log(`  ${formatProviderTarget(providerName, plan)}`);

  if (plan.entries.length === 0) {
    console.log(pc.dim('  No entries to push.'));
    return;
  }

  const rows = plan.entries.map((entry) => [entry.key, colorAction(entry.action), entry.kind]);
  // Blank lines isolate the table from the target line above and the confirm prompt below.
  console.log();
  console.log(indent(renderTable(['Key', 'Action', 'Kind'], rows)));
  console.log();
}

function printResult(providerName: ProviderName, result: PushResult): void {
  console.log('Push result:');
  console.log(`  ${formatProviderTarget(providerName, result)}`);

  const rows = result.entries.map((entry) => [entry.key, colorStatus(entry.status)]);
  const table = renderTable(['Key', 'Status'], rows);
  if (table.length > 0) {
    // Blank lines isolate the table from the target line above and whatever follows (errors / next output).
    console.log();
    console.log(indent(table));
    console.log();
  }

  printErrors(result.entries);
}

function printErrors(entries: PushResult['entries']): void {
  const rows = formatErrorRows(entries);
  if (rows.length === 0) {
    return;
  }

  console.log('Errors:');
  for (const { key, message } of rows) {
    console.log(`  ${key}  ${pc.dim(message)}`);
  }
}

// One displayable error row: the key padded to the common width and its
// failure message collapsed to a single line. Successful entries are dropped.
export interface ErrorRow {
  readonly key: string;
  readonly message: string;
}

// Builds the aligned, single-line error rows shown beneath a push result.
// Provider errors (e.g. GitHub's multi-line HTTP 422) span several lines;
// whitespace is collapsed so each failure stays on one row, and keys are
// padded to the widest key so messages line up in a column.
export function formatErrorRows(entries: readonly PushResultEntry[]): ErrorRow[] {
  const failures = entries.filter((entry) => entry.error !== undefined);
  if (failures.length === 0) {
    return [];
  }

  const keyWidth = Math.max(...failures.map((failure) => failure.key.length));
  return failures.map((failure) => ({
    key: failure.key.padEnd(keyWidth),
    message: (failure.error ?? '').replace(/\s+/g, ' ').trim(),
  }));
}

type PushAction = PushPlan['entries'][number]['action'];
type PushStatus = PushResultEntry['status'];

function colorAction(action: PushAction): string {
  return action === 'create' ? pc.green(action) : pc.yellow(action);
}

function colorStatus(status: PushStatus): string {
  return status === 'success' ? pc.green(status) : pc.red(status);
}

function indent(block: string): string {
  return block
    .split('\n')
    .map((line) => (line.length > 0 ? `  ${line}` : line))
    .join('\n');
}

function printError(error: unknown): void {
  if (error instanceof PushWorkflowDiagnosticError) {
    console.error(pc.red('Error: ') + error.message);
    for (const diagnostic of error.diagnostics) {
      console.error(formatDiagnostic(error.sourcePath, diagnostic));
    }
    return;
  }

  if (error instanceof SourceEnvFileError) {
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
