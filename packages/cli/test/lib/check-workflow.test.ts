import { describe, expect, it } from 'vite-plus/test';

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CheckWorkflowDiagnosticError, runCheckWorkflow } from '../../src/lib/check-workflow';
import { SourceEnvFileError } from '../../src/lib/source-env-file';
import { TargetEnvFileError } from '../../src/lib/target-env-file';

async function withTempProject<T>(callback: (cwd: string) => Promise<T>): Promise<T> {
  const cwd = await mkdtemp(join(tmpdir(), 'envolix-check-workflow-'));

  try {
    return await callback(cwd);
  } finally {
    await rm(cwd, { force: true, recursive: true });
  }
}

async function writeEnv(cwd: string, name: string, lines: string[]): Promise<void> {
  await writeFile(join(cwd, name), lines.join('\n'));
}

describe('check workflow', () => {
  it('reports no drift when the target contains every source key', async () => {
    await withTempProject(async (cwd) => {
      await writeEnv(cwd, '.env', ['API_KEY=secret', 'PORT=3000']);
      await writeEnv(cwd, '.env.production', ['API_KEY=', 'PORT=']);

      const result = await runCheckWorkflow({ cwd, source: '.env', target: '.env.production' });

      expect(result).toEqual({ missingKeys: [], extraKeys: [] });
    });
  });

  it('reports source keys missing from the target, in source order', async () => {
    await withTempProject(async (cwd) => {
      await writeEnv(cwd, '.env', ['API_KEY=secret', 'PORT=3000', 'DATABASE_URL=postgres://']);
      await writeEnv(cwd, '.env.production', ['API_KEY=']);

      const result = await runCheckWorkflow({ cwd, source: '.env', target: '.env.production' });

      expect(result.missingKeys).toEqual(['PORT', 'DATABASE_URL']);
      expect(result.extraKeys).toEqual([]);
    });
  });

  it('ignores keys that exist only in the target by default', async () => {
    await withTempProject(async (cwd) => {
      await writeEnv(cwd, '.env', ['API_KEY=secret']);
      await writeEnv(cwd, '.env.production', ['API_KEY=', 'SENTRY_DSN=']);

      const result = await runCheckWorkflow({ cwd, source: '.env', target: '.env.production' });

      expect(result).toEqual({ missingKeys: [], extraKeys: [] });
    });
  });

  it('reports target-only keys as drift under strict mode', async () => {
    await withTempProject(async (cwd) => {
      await writeEnv(cwd, '.env', ['API_KEY=secret']);
      await writeEnv(cwd, '.env.production', ['API_KEY=', 'SENTRY_DSN=']);

      const result = await runCheckWorkflow({
        cwd,
        source: '.env',
        target: '.env.production',
        strict: true,
      });

      expect(result.missingKeys).toEqual([]);
      expect(result.extraKeys).toEqual(['SENTRY_DSN']);
    });
  });

  it('treats a duplicate key in the target as a single key, not drift', async () => {
    await withTempProject(async (cwd) => {
      await writeEnv(cwd, '.env', ['API_KEY=secret', 'PORT=3000']);
      await writeEnv(cwd, '.env.production', ['API_KEY=', 'API_KEY=', 'PORT=']);

      const result = await runCheckWorkflow({ cwd, source: '.env', target: '.env.production' });

      expect(result).toEqual({ missingKeys: [], extraKeys: [] });
    });
  });

  it('throws when the target file does not exist instead of reporting every key as missing', async () => {
    await withTempProject(async (cwd) => {
      await writeEnv(cwd, '.env', ['API_KEY=secret']);

      await expect(
        runCheckWorkflow({ cwd, source: '.env', target: '.env.production' }),
      ).rejects.toBeInstanceOf(TargetEnvFileError);
    });
  });

  it('throws when the source file does not exist', async () => {
    await withTempProject(async (cwd) => {
      await writeEnv(cwd, '.env.production', ['API_KEY=']);

      await expect(
        runCheckWorkflow({ cwd, source: '.env', target: '.env.production' }),
      ).rejects.toBeInstanceOf(SourceEnvFileError);
    });
  });

  it('rejects an invalid source with the same diagnostics as generation', async () => {
    await withTempProject(async (cwd) => {
      await writeEnv(cwd, '.env', ['API_KEY=one', 'API_KEY=two']);
      await writeEnv(cwd, '.env.production', ['API_KEY=']);

      await expect(
        runCheckWorkflow({ cwd, source: '.env', target: '.env.production' }),
      ).rejects.toBeInstanceOf(CheckWorkflowDiagnosticError);
    });
  });
});
