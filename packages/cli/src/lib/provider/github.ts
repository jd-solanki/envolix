import type { Provider, RemoteEntry } from './index.js';
import { GhAdapter } from './gh.js';

export class GitHubProvider implements Provider {
  constructor(private readonly gh = new GhAdapter()) {}

  async listRemoteEntries(): Promise<readonly RemoteEntry[]> {
    const [secrets, variables] = await Promise.all([
      this.gh.listSecrets(),
      this.gh.listVariables(),
    ]);

    return Object.freeze([
      ...secrets.map((key): RemoteEntry => ({ key, kind: 'secret' })),
      ...variables.map((key): RemoteEntry => ({ key, kind: 'variable' })),
    ]);
  }

  async setSecret(key: string, value: string): Promise<void> {
    await this.gh.setSecret(key, value);
  }

  async setVariable(key: string, value: string): Promise<void> {
    await this.gh.setVariable(key, value);
  }
}
