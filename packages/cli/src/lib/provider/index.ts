export type RemoteEntryKind = 'secret' | 'variable';

export interface RemoteEntry {
  readonly key: string;
  readonly kind: RemoteEntryKind;
}

export interface RemoteVariable {
  readonly key: string;
  readonly value: string;
}

export interface ProviderTarget {
  readonly repo?: string;
  readonly environment?: string;
}

export interface ProviderTargetOptions {
  readonly repo?: string;
  readonly environment?: string;
}

export function createProviderTarget(options: ProviderTargetOptions): ProviderTarget {
  return Object.freeze({
    ...(options.repo === undefined ? {} : { repo: options.repo }),
    ...(options.environment === undefined ? {} : { environment: options.environment }),
  });
}

export interface PushPlanEntry {
  readonly key: string;
  readonly value: string;
  readonly kind: RemoteEntryKind;
  readonly action: 'create' | 'update';
}

export interface PushPlan {
  readonly target: ProviderTarget;
  readonly entries: readonly PushPlanEntry[];
}

export interface PushProvider {
  listRemoteEntries(target: ProviderTarget): Promise<readonly RemoteEntry[]>;
  setSecret(key: string, value: string, target: ProviderTarget): Promise<void>;
  setVariable(key: string, value: string, target: ProviderTarget): Promise<void>;
}

export interface PullProvider {
  listRemoteEntries(target: ProviderTarget): Promise<readonly RemoteEntry[]>;
  listRemoteVariables(target: ProviderTarget): Promise<readonly RemoteVariable[]>;
}

export interface Provider extends PushProvider, PullProvider {}
