import { describe, expect, it } from 'vite-plus/test';

import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  GenWorkflowDiagnosticError,
  GenWorkflowError,
  runGenWorkflow,
} from '../../src/lib/gen-workflow';

const execFileAsync = promisify(execFile);

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

  it('preserves a plain-annotated value already present in the existing target by default', async () => {
    await withTempProject(async (cwd) => {
      await writeFile(
        join(cwd, '.env'),
        ['DEV_URL=internal # varType:plain', 'API_KEY=secret # varType:secret'].join('\n'),
      );
      await writeFile(join(cwd, '.env.example'), 'DEV_URL=http://localhost:3000\n');

      const result = await runGenWorkflow({ cwd, source: '.env', target: '.env.example' });

      expect(result.warnings).toEqual([]);
      await expect(readFile(join(cwd, '.env.example'), 'utf8')).resolves.toBe(
        ['DEV_URL=http://localhost:3000 # varType:plain', 'API_KEY= # varType:secret'].join('\n'),
      );
    });
  });

  it('blanks every value when preservation is disabled', async () => {
    await withTempProject(async (cwd) => {
      await writeFile(join(cwd, '.env'), 'DEV_URL=internal # varType:plain\n');
      await writeFile(join(cwd, '.env.example'), 'DEV_URL=http://localhost:3000\n');

      await runGenWorkflow({ cwd, source: '.env', target: '.env.example', preserve: false });

      await expect(readFile(join(cwd, '.env.example'), 'utf8')).resolves.toBe(
        'DEV_URL= # varType:plain\n',
      );
    });
  });

  it('warns without failing when a plain key is duplicated in the existing target', async () => {
    await withTempProject(async (cwd) => {
      await writeFile(join(cwd, '.env'), 'API_URL=internal # varType:plain\n');
      await writeFile(join(cwd, '.env.example'), ['API_URL=one', 'API_URL=two'].join('\n'));

      const result = await runGenWorkflow({ cwd, source: '.env', target: '.env.example' });

      expect(result.warnings).toEqual([
        'Skipped preserving "API_URL": it appears more than once in the existing target env file.',
      ]);
      await expect(readFile(join(cwd, '.env.example'), 'utf8')).resolves.toBe(
        'API_URL= # varType:plain\n',
      );
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

  it('stages the generated file with git add when stage is true', async () => {
    await withTempProject(async (cwd) => {
      await execFileAsync('git', ['init'], { cwd });
      await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd });
      await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd });
      await writeFile(join(cwd, '.env'), 'TOKEN=secret\n');

      await runGenWorkflow({ cwd, source: '.env', target: '.env.example', stage: true });

      const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd });
      expect(stdout).toContain('A  .env.example');
    });
  });

  it('emits a warning and does not throw when stage is true outside a git repository', async () => {
    await withTempProject(async (cwd) => {
      await writeFile(join(cwd, '.env'), 'TOKEN=secret\n');

      const stderrChunks: string[] = [];
      const originalWrite = process.stderr.write.bind(process.stderr);
      process.stderr.write = (chunk: unknown, ...args: unknown[]) => {
        stderrChunks.push(String(chunk));
        return (originalWrite as (...a: unknown[]) => boolean)(chunk, ...args);
      };

      try {
        await runGenWorkflow({ cwd, source: '.env', target: '.env.example', stage: true });
      } finally {
        process.stderr.write = originalWrite;
      }

      await expect(readFile(join(cwd, '.env.example'), 'utf8')).resolves.toBe('TOKEN=\n');
      expect(stderrChunks.join('')).toContain('Warning: --stage skipped');
    });
  });
});
