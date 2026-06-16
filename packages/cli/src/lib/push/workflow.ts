import { parseEnvDocument, type EnvDiagnostic } from '@envolix/env-parser';
import { stat, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type {
  Provider,
  ProviderTarget,
  PushPlan,
  PushPlanEntry,
  RemoteEntry,
} from '../provider/index.js';
import {
  getEntryVarType,
  validateEnvDocumentForPush,
  type PushValidationDiagnostic,
} from './validation.js';

export interface PlanPushOptions {
  readonly cwd: string;
  readonly source: string;
  readonly provider: Provider;
  readonly environment?: string;
}

export interface PushResultEntry {
  readonly key: string;
  readonly kind: PushPlanEntry['kind'];
  readonly action: PushPlanEntry['action'];
  readonly status: 'success' | 'failure';
  readonly error?: string;
}

export interface PushResult {
  readonly ok: boolean;
  readonly target: ProviderTarget;
  readonly entries: readonly PushResultEntry[];
}

export class PushWorkflowError extends Error {
  constructor(
    message: string,
    readonly details: readonly string[] = [],
  ) {
    super(message);
    this.name = 'PushWorkflowError';
  }
}

export class PushWorkflowDiagnosticError extends Error {
  constructor(
    readonly sourcePath: string,
    readonly diagnostics: readonly (EnvDiagnostic | PushValidationDiagnostic)[],
  ) {
    super('Source env file is not valid for push.');
    this.name = 'PushWorkflowDiagnosticError';
  }
}

export async function planPush(options: PlanPushOptions): Promise<PushPlan> {
  const sourcePath = resolve(options.cwd, options.source);
  const sourceStat = await statPath(sourcePath, 'source');
  if (sourceStat.isDirectory()) {
    throw new PushWorkflowError('Source path must be a file, not a directory.', [sourcePath]);
  }

  const source = await readFile(sourcePath, 'utf8');
  const document = parseEnvDocument(source);
  const diagnostics = validateEnvDocumentForPush(document);
  if (diagnostics.length > 0) {
    throw new PushWorkflowDiagnosticError(sourcePath, diagnostics);
  }

  const target: ProviderTarget =
    options.environment === undefined
      ? Object.freeze({})
      : Object.freeze({ environment: options.environment });
  const remoteEntries = await options.provider.listRemoteEntries(target);
  const remoteEntryKeys = new Set(remoteEntries.map(remoteEntryKey));
  const entries = document.nodes
    .filter(
      (node): node is Extract<(typeof document.nodes)[number], { type: 'entry' }> =>
        node.type === 'entry',
    )
    .map((entry): PushPlanEntry => {
      const kind = getEntryVarType(entry);
      if (kind === undefined) {
        throw new PushWorkflowDiagnosticError(sourcePath, []);
      }

      return {
        key: entry.key,
        value: entry.value,
        kind,
        action: remoteEntryKeys.has(remoteEntryKey({ key: entry.key, kind })) ? 'update' : 'create',
      };
    });

  return Object.freeze({ target, entries: Object.freeze(entries) });
}

export async function executePush(plan: PushPlan, provider: Provider): Promise<PushResult> {
  const entries: PushResultEntry[] = [];

  for (const entry of plan.entries) {
    try {
      if (entry.kind === 'secret') {
        await provider.setSecret(entry.key, entry.value, plan.target);
      } else {
        await provider.setVariable(entry.key, entry.value, plan.target);
      }

      entries.push({
        key: entry.key,
        kind: entry.kind,
        action: entry.action,
        status: 'success',
      });
    } catch (error) {
      entries.push({
        key: entry.key,
        kind: entry.kind,
        action: entry.action,
        status: 'failure',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return Object.freeze({
    ok: entries.every((entry) => entry.status === 'success'),
    target: plan.target,
    entries: Object.freeze(entries),
  });
}

function remoteEntryKey(entry: Pick<RemoteEntry, 'key' | 'kind'>): string {
  return `${entry.kind}:${entry.key}`;
}

async function statPath(path: string, label: string) {
  try {
    return await stat(path);
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      throw new PushWorkflowError(`${capitalize(label)} path does not exist.`, [path]);
    }

    throw error;
  }
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
