import { describe, expect, it } from 'vite-plus/test';

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PulledEnvFileError,
  createPulledEnvFile,
  planPulledEnvFile,
} from '../../src/lib/pull/pulled-env-file';

async function withTempProject<T>(callback: (cwd: string) => Promise<T>): Promise<T> {
  const cwd = await mkdtemp(join(tmpdir(), 'envolix-pulled-env-file-'));

  try {
    return await callback(cwd);
  } finally {
    await rm(cwd, { force: true, recursive: true });
  }
}

describe('pulled env file', () => {
  it('plans a unique Pulled env file name and tracks blank remote secrets', async () => {
    await withTempProject(async (cwd) => {
      await writeFile(join(cwd, '.env.pull.github.prod-env.20260102T030405Z'), 'KEEP=this\n');

      const plan = await planPulledEnvFile({
        cwd,
        providerName: 'github',
        environment: 'prod/env',
        now: new Date('2026-01-02T03:04:05Z'),
        entries: [
          { key: 'TOKEN', value: '', kind: 'secret' },
          { key: 'PUBLIC_URL', value: 'https://example.test', kind: 'variable' },
        ],
      });

      expect(plan.fileName).toBe('.env.pull.github.prod-env.20260102T030405Z.1');
      expect(plan.filePath).toBe(join(cwd, plan.fileName));
      expect(plan.blankSecretKeys).toEqual(['TOKEN']);
    });
  });

  it('creates a Pulled env file with blank secrets and quoted variable values', async () => {
    await withTempProject(async (cwd) => {
      const plan = await planPulledEnvFile({
        cwd,
        providerName: 'github',
        now: new Date('2026-01-02T03:04:05Z'),
        entries: [
          { key: 'TOKEN', value: '', kind: 'secret' },
          { key: 'PUBLIC_URL', value: 'https://example.test/#fragment', kind: 'variable' },
          { key: 'DISPLAY_NAME', value: 'Example App', kind: 'variable' },
        ],
      });

      const result = await createPulledEnvFile(plan);

      await expect(readFile(result.filePath, 'utf8')).resolves.toBe(
        [
          'TOKEN= #varType:secret',
          'PUBLIC_URL="https://example.test/#fragment"',
          'DISPLAY_NAME="Example App"',
          '',
        ].join('\n'),
      );
      expect(result.isGitIgnored).toBe(false);
    });
  });

  it('reports whether the Pulled env file is ignored by gitignore', async () => {
    await withTempProject(async (cwd) => {
      await mkdir(join(cwd, '.git'));
      await writeFile(join(cwd, '.gitignore'), '.env.pull.*\n');
      const plan = await planPulledEnvFile({
        cwd,
        providerName: 'github',
        now: new Date('2026-01-02T03:04:05Z'),
        entries: [],
      });

      const result = await createPulledEnvFile(plan);

      expect(result.isGitIgnored).toBe(true);
    });
  });

  it('refuses to overwrite an existing Pulled env file', async () => {
    await withTempProject(async (cwd) => {
      const fileName = '.env.pull.github.repo.20260102T030405Z';
      const filePath = join(cwd, fileName);
      await writeFile(filePath, 'KEEP=this\n');

      await expect(
        createPulledEnvFile({
          fileName,
          filePath,
          entries: [],
          blankSecretKeys: [],
        }),
      ).rejects.toMatchObject({
        message: 'Pulled env file already exists.',
        details: [filePath],
      } satisfies Partial<PulledEnvFileError>);
    });
  });
});
