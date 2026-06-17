import type { EnvDiagnostic, EnvEntry } from '@envolix/env-parser';
import { createProviderTarget } from '../provider/index';
import type {
  ProviderTarget,
  PushProvider,
  PushPlan,
  PushPlanEntry,
  RemoteEntry,
} from '../provider/index';
import {
  getEntryVarType,
  validateEnvDocumentForPush,
  type PushValidationDiagnostic,
} from './validation';
import { readSourceEnvFile } from '../source-env-file';

export interface PlanPushOptions {
  readonly cwd: string;
  readonly source: string;
  readonly provider: PushProvider;
  readonly repo?: string;
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
  const sourceEnvFile = await readSourceEnvFile({ cwd: options.cwd, source: options.source });
  const diagnostics = validateEnvDocumentForPush(sourceEnvFile.document);
  if (diagnostics.length > 0) {
    throw new PushWorkflowDiagnosticError(sourceEnvFile.path, diagnostics);
  }

  const target = createProviderTarget(options);
  const remoteEntries = await options.provider.listRemoteEntries(target);
  const remoteEntryKeys = new Set(remoteEntries.map(remoteEntryKey));
  const entries = sourceEnvFile.document.nodes
    .filter((node): node is EnvEntry => node.type === 'entry')
    .map((entry): PushPlanEntry => {
      const kind = getEntryVarType(entry);
      if (kind === undefined) {
        throw new PushWorkflowDiagnosticError(sourceEnvFile.path, []);
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

export async function executePush(plan: PushPlan, provider: PushProvider): Promise<PushResult> {
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
