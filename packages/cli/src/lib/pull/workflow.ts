import { createProviderTarget, type ProviderTarget, type PullProvider } from '../provider/index.js';
import {
  createPulledEnvFile,
  planPulledEnvFile,
  type PulledEnvFileEntry,
  type PulledEnvFilePlan,
} from './pulled-env-file.js';

export interface PlanPullOptions {
  readonly cwd: string;
  readonly providerName: string;
  readonly provider: PullProvider;
  readonly repo?: string;
  readonly environment?: string;
  readonly now?: Date;
}

export interface PullPlan extends PulledEnvFilePlan {
  readonly target: ProviderTarget;
  readonly providerName: string;
}

export interface PullResult extends PullPlan {
  readonly isGitIgnored: boolean;
}

export async function planPull(options: PlanPullOptions): Promise<PullPlan> {
  const target = createProviderTarget(options);
  const [remoteEntries, remoteVariables] = await Promise.all([
    options.provider.listRemoteEntries(target),
    options.provider.listRemoteVariables(target),
  ]);
  const variableValues = new Map(remoteVariables.map((variable) => [variable.key, variable.value]));
  const entries = remoteEntries.map((entry): PulledEnvFileEntry => {
    if (entry.kind === 'secret') {
      return { key: entry.key, value: '', kind: 'secret' };
    }

    return { key: entry.key, value: variableValues.get(entry.key) ?? '', kind: 'variable' };
  });
  const pulledEnvFile = await planPulledEnvFile({
    cwd: options.cwd,
    providerName: options.providerName,
    entries,
    ...(options.environment === undefined ? {} : { environment: options.environment }),
    ...(options.now === undefined ? {} : { now: options.now }),
  });

  return Object.freeze({
    target,
    providerName: options.providerName,
    ...pulledEnvFile,
  });
}

export async function executePull(plan: PullPlan): Promise<PullResult> {
  const result = await createPulledEnvFile(plan);

  return Object.freeze({
    ...plan,
    isGitIgnored: result.isGitIgnored,
  });
}
