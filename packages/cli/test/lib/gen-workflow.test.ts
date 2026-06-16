import { describe, expect, it } from 'vite-plus/test';

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  GenWorkflowDiagnosticError,
  GenWorkflowError,
  runGenWorkflow,
} from '../../src/lib/gen-workflow';

async function withTempProject<T>(callback: (cwd: string) => Promise<T>): Promise<T> {
  const cwd = await mkdtemp(join(tmpdir(), 'envolix-gen-workflow-'));

  try {
    return await callback(cwd);
  } finally {
    await rm(cwd, { force: true, recursive: true });
  }
}

describe('gen workflow', () => {
  it('generates a target env file from a source env file', async () => {
    await withTempProject(async (cwd) => {
      await writeFile(
        join(cwd, '.env'),
        ['# service', 'export API_KEY=secret # keep this', '', 'PORT=3000', ''].join('\n'),
      );

      await runGenWorkflow({ cwd, source: '.env', target: '.env.example' });

      await expect(readFile(join(cwd, '.env.example'), 'utf8')).resolves.toBe(
        ['# service', 'export API_KEY= # keep this', '', 'PORT=', ''].join('\n'),
      );
    });
  });

  it('returns diagnostics and does not write when source content cannot generate a target', async () => {
    await withTempProject(async (cwd) => {
      await writeFile(join(cwd, '.env'), ['DUP=first', 'DUP=second'].join('\n'));

      await expect(
        runGenWorkflow({ cwd, source: '.env', target: '.env.example' }),
      ).rejects.toMatchObject({
        diagnostics: [expect.objectContaining({ code: 'DuplicateKey' })],
      } satisfies Partial<GenWorkflowDiagnosticError>);
      await expect(readFile(join(cwd, '.env.example'), 'utf8')).rejects.toThrow();
    });
  });

  it('rejects source and target paths that resolve to the same file before writing', async () => {
    await withTempProject(async (cwd) => {
      await writeFile(join(cwd, '.env'), 'TOKEN=value\n');

      await expect(runGenWorkflow({ cwd, source: '.env', target: '.env' })).rejects.toMatchObject({
        message: 'Source and target paths must be different.',
      } satisfies Partial<GenWorkflowError>);
      await expect(readFile(join(cwd, '.env'), 'utf8')).resolves.toBe('TOKEN=value\n');
    });
  });

  it('rejects a missing target parent before writing', async () => {
    await withTempProject(async (cwd) => {
      await writeFile(join(cwd, '.env'), 'TOKEN=value\n');
      await mkdir(join(cwd, 'existing'));

      await expect(
        runGenWorkflow({ cwd, source: '.env', target: 'missing/.env.example' }),
      ).rejects.toMatchObject({
        message: 'Target parent path does not exist.',
      } satisfies Partial<GenWorkflowError>);
      await expect(readFile(join(cwd, 'existing', '.env.example'), 'utf8')).rejects.toThrow();
    });
  });
});
