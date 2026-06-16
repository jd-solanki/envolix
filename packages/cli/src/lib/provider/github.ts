import type { Provider, ProviderTarget, RemoteEntry, RemoteVariable } from './index.js';
import { GhAdapter } from './gh.js';

export class GitHubProvider implements Provider {
  constructor(private readonly gh = new GhAdapter()) {}

  async listRemoteEntries(target: ProviderTarget): Promise<readonly RemoteEntry[]> {
    const [secrets, variables] = await Promise.all([
      this.gh.listSecrets(target),
      this.listRemoteVariables(target),
    ]);

    return Object.freeze([
      ...secrets.map((key): RemoteEntry => ({ key, kind: 'secret' })),
      ...variables.map((variable): RemoteEntry => ({ key: variable.key, kind: 'variable' })),
    ]);
  }

  async listRemoteVariables(target: ProviderTarget): Promise<readonly RemoteVariable[]> {
    return this.gh.listVariables(target);
  }

  async setSecret(key: string, value: string, target: ProviderTarget): Promise<void> {
    await this.gh.setSecret(key, value, target);
  }

  async setVariable(key: string, value: string, target: ProviderTarget): Promise<void> {
    await this.gh.setVariable(key, value, target);
  }
}
