export type RemoteEntryKind = 'secret' | 'variable';

export interface RemoteEntry {
  readonly key: string;
  readonly kind: RemoteEntryKind;
}

export interface ProviderTarget {
  readonly environment?: string;
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

// Providers expose remote state separately from writes so push can show a reviewable plan first.
export interface Provider {
  listRemoteEntries(target: ProviderTarget): Promise<readonly RemoteEntry[]>;
  setSecret(key: string, value: string, target: ProviderTarget): Promise<void>;
  setVariable(key: string, value: string, target: ProviderTarget): Promise<void>;
}
