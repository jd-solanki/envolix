import { describe, expect, it } from 'vite-plus/test';

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Provider, ProviderTarget, RemoteEntry } from '../../src/lib/provider/index.js';
import { PushWorkflowDiagnosticError, executePush, planPush } from '../../src/lib/push/workflow.js';

async function withTempProject<T>(callback: (cwd: string) => Promise<T>): Promise<T> {
  const cwd = await mkdtemp(join(tmpdir(), 'envolix-push-workflow-'));

  try {
    return await callback(cwd);
  } finally {
    await rm(cwd, { force: true, recursive: true });
  }
}

class StubProvider implements Provider {
  readonly calls: string[] = [];

  constructor(
    private readonly remoteEntries: readonly RemoteEntry[] = [],
    private readonly failKeys: ReadonlySet<string> = new Set(),
  ) {}

  async listRemoteEntries(target: ProviderTarget): Promise<readonly RemoteEntry[]> {
    this.calls.push(`list:${formatTarget(target)}`);
    return this.remoteEntries;
  }

  async setSecret(key: string, _value: string, target: ProviderTarget): Promise<void> {
    this.calls.push(`secret:${key}:${formatTarget(target)}`);
    this.failIfConfigured(key);
  }

  async setVariable(key: string, _value: string, target: ProviderTarget): Promise<void> {
    this.calls.push(`variable:${key}:${formatTarget(target)}`);
    this.failIfConfigured(key);
  }

  private failIfConfigured(key: string): void {
    if (this.failKeys.has(key)) {
      throw new Error(`failed ${key}`);
    }
  }
}

function formatTarget(target: ProviderTarget): string {
  return target.environment ?? 'repo';
}

describe('push workflow', () => {
  it('plans create and update actions from annotated env entries', async () => {
    await withTempProject(async (cwd) => {
      await writeFile(
        join(cwd, '.env'),
        ['NEW_SECRET=s1 #varType:secret', 'EXISTING_VAR=v1 #varType:plain'].join('\n'),
      );
      const provider = new StubProvider([{ key: 'EXISTING_VAR', kind: 'variable' }]);

      const plan = await planPush({ cwd, source: '.env', provider });

      expect(plan.entries).toEqual([
        { key: 'NEW_SECRET', value: 's1', kind: 'secret', action: 'create' },
        { key: 'EXISTING_VAR', value: 'v1', kind: 'variable', action: 'update' },
      ]);
      expect(plan.target).toEqual({});
      expect(provider.calls).toEqual(['list:repo']);
    });
  });

  it('threads an environment target through planning and execution', async () => {
    await withTempProject(async (cwd) => {
      await writeFile(
        join(cwd, '.env'),
        ['TOKEN=s1 #varType:secret', 'PUBLIC_URL=https://example.test #varType:plain'].join('\n'),
      );
      const provider = new StubProvider([{ key: 'TOKEN', kind: 'secret' }]);

      const plan = await planPush({
        cwd,
        source: '.env',
        provider,
        environment: 'production',
      });
      const result = await executePush(plan, provider);

      expect(plan.target).toEqual({ environment: 'production' });
      expect(provider.calls).toEqual([
        'list:production',
        'secret:TOKEN:production',
        'variable:PUBLIC_URL:production',
      ]);
      expect(result.target).toEqual({ environment: 'production' });
      expect(result.entries).toEqual([
        { key: 'TOKEN', kind: 'secret', action: 'update', status: 'success' },
        { key: 'PUBLIC_URL', kind: 'variable', action: 'create', status: 'success' },
      ]);
    });
  });

  it('refuses invalid source content before calling the provider', async () => {
    await withTempProject(async (cwd) => {
      await writeFile(join(cwd, '.env'), 'TOKEN=value\n');
      const provider = new StubProvider();

      await expect(planPush({ cwd, source: '.env', provider })).rejects.toMatchObject({
        diagnostics: [expect.objectContaining({ code: 'MissingVarTypeAnnotation' })],
      } satisfies Partial<PushWorkflowDiagnosticError>);
      expect(provider.calls).toEqual([]);
    });
  });

  it('executes every planned entry and reports partial failures', async () => {
    const provider = new StubProvider([], new Set(['BROKEN_VAR']));
    const result = await executePush(
      {
        target: {},
        entries: [
          { key: 'SECRET', value: 's1', kind: 'secret', action: 'create' },
          { key: 'BROKEN_VAR', value: 'v1', kind: 'variable', action: 'create' },
          { key: 'AFTER_FAILURE', value: 'v2', kind: 'variable', action: 'update' },
        ],
      },
      provider,
    );

    expect(provider.calls).toEqual([
      'secret:SECRET:repo',
      'variable:BROKEN_VAR:repo',
      'variable:AFTER_FAILURE:repo',
    ]);
    expect(result.ok).toBe(false);
    expect(result.entries).toEqual([
      { key: 'SECRET', kind: 'secret', action: 'create', status: 'success' },
      {
        key: 'BROKEN_VAR',
        kind: 'variable',
        action: 'create',
        status: 'failure',
        error: 'failed BROKEN_VAR',
      },
      { key: 'AFTER_FAILURE', kind: 'variable', action: 'update', status: 'success' },
    ]);
  });
});
