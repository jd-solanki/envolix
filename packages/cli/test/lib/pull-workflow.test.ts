import { describe, expect, it } from 'vite-plus/test';

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  ProviderTarget,
  PullProvider,
  RemoteEntry,
  RemoteVariable,
} from '../../src/lib/provider/index.js';
import { executePull, planPull } from '../../src/lib/pull/workflow.js';

async function withTempProject<T>(callback: (cwd: string) => Promise<T>): Promise<T> {
  const cwd = await mkdtemp(join(tmpdir(), 'envolix-pull-workflow-'));

  try {
    return await callback(cwd);
  } finally {
    await rm(cwd, { force: true, recursive: true });
  }
}

class StubProvider implements PullProvider {
  readonly calls: string[] = [];

  constructor(
    private readonly remoteEntries: readonly RemoteEntry[],
    private readonly remoteVariables: readonly RemoteVariable[],
  ) {}

  async listRemoteEntries(target: ProviderTarget): Promise<readonly RemoteEntry[]> {
    this.calls.push(`entries:${formatTarget(target)}`);
    return this.remoteEntries;
  }

  async listRemoteVariables(target: ProviderTarget): Promise<readonly RemoteVariable[]> {
    this.calls.push(`variables:${formatTarget(target)}`);
    return this.remoteVariables;
  }
}

function formatTarget(target: ProviderTarget): string {
  if (target.repo !== undefined) {
    return [target.repo, target.environment].filter(Boolean).join(':');
  }

  return target.environment ?? 'repo';
}

describe('pull workflow', () => {
  it('writes repo-level variables and blank annotated secrets to a new pulled env file', async () => {
    await withTempProject(async (cwd) => {
      const provider = new StubProvider(
        [
          { key: 'TOKEN', kind: 'secret' },
          { key: 'PUBLIC_URL', kind: 'variable' },
        ],
        [{ key: 'PUBLIC_URL', value: 'https://example.test' }],
      );

      const plan = await planPull({ cwd, providerName: 'github', provider });
      const result = await executePull(plan);

      expect(provider.calls).toEqual(['entries:repo', 'variables:repo']);
      expect(result.fileName).toMatch(/^\.env\.pull\.github\.repo\.\d{8}T\d{6}Z$/);
      await expect(readFile(result.filePath, 'utf8')).resolves.toBe(
        ['TOKEN= #varType:secret', 'PUBLIC_URL=https://example.test', ''].join('\n'),
      );
      expect(result.blankSecretKeys).toEqual(['TOKEN']);
      expect(result.isGitIgnored).toBe(false);
    });
  });

  it('uses the GitHub Environment name in the pulled env filename', async () => {
    await withTempProject(async (cwd) => {
      const provider = new StubProvider([{ key: 'TOKEN', kind: 'secret' }], []);

      const plan = await planPull({
        cwd,
        providerName: 'github',
        provider,
        environment: 'production',
      });
      const result = await executePull(plan);

      expect(plan.target).toEqual({ environment: 'production' });
      expect(provider.calls).toEqual(['entries:production', 'variables:production']);
      expect(result.fileName).toMatch(/^\.env\.pull\.github\.production\.\d{8}T\d{6}Z$/);
    });
  });

  it('threads an explicit repository target through planning', async () => {
    await withTempProject(async (cwd) => {
      const provider = new StubProvider([{ key: 'TOKEN', kind: 'secret' }], []);

      const plan = await planPull({
        cwd,
        providerName: 'github',
        provider,
        repo: 'acme/app',
        environment: 'production',
      });

      expect(plan.target).toEqual({ repo: 'acme/app', environment: 'production' });
      expect(provider.calls).toEqual([
        'entries:acme/app:production',
        'variables:acme/app:production',
      ]);
      expect(plan.fileName).toMatch(/^\.env\.pull\.github\.production\.\d{8}T\d{6}Z$/);
    });
  });

  it('never overwrites an existing pulled env file name', async () => {
    await withTempProject(async (cwd) => {
      const provider = new StubProvider([], []);
      const existingName = '.env.pull.github.repo.20260102T030405Z';
      await writeFile(join(cwd, existingName), 'KEEP=this\n');

      const plan = await planPull({
        cwd,
        providerName: 'github',
        provider,
        now: new Date('2026-01-02T03:04:05Z'),
      });
      const result = await executePull(plan);

      expect(result.fileName).toBe('.env.pull.github.repo.20260102T030405Z.1');
      await expect(readFile(join(cwd, existingName), 'utf8')).resolves.toBe('KEEP=this\n');
    });
  });

  it('reports when the pulled file is gitignored', async () => {
    await withTempProject(async (cwd) => {
      await mkdir(join(cwd, '.git'));
      await writeFile(join(cwd, '.gitignore'), '.env.pull.*\n');
      const provider = new StubProvider([], []);

      const plan = await planPull({ cwd, providerName: 'github', provider });
      const result = await executePull(plan);

      expect(result.isGitIgnored).toBe(true);
      await expect(readFile(join(cwd, '.gitignore'), 'utf8')).resolves.toBe('.env.pull.*\n');
    });
  });
});
