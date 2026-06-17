import { describe, expect, it } from 'vite-plus/test';

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SourceEnvFileError, readSourceEnvFile } from '../../src/lib/source-env-file';

async function withTempProject<T>(callback: (cwd: string) => Promise<T>): Promise<T> {
  const cwd = await mkdtemp(join(tmpdir(), 'envolix-source-env-file-'));

  try {
    return await callback(cwd);
  } finally {
    await rm(cwd, { force: true, recursive: true });
  }
}

describe('source env file intake', () => {
  it('resolves, verifies, reads, and parses a Source env file', async () => {
    await withTempProject(async (cwd) => {
      await writeFile(join(cwd, '.env'), ['TOKEN=value', '# comment'].join('\n'));

      const sourceEnvFile = await readSourceEnvFile({ cwd, source: '.env' });

      expect(sourceEnvFile.path).toBe(join(cwd, '.env'));
      expect(sourceEnvFile.stats.isFile()).toBe(true);
      expect(sourceEnvFile.document.nodes.map((node) => node.type)).toEqual(['entry', 'comment']);
      expect(sourceEnvFile.document.findEntry('TOKEN')?.value).toBe('value');
    });
  });

  it('rejects missing Source env files with path detail', async () => {
    await withTempProject(async (cwd) => {
      const sourcePath = join(cwd, '.env.missing');

      await expect(readSourceEnvFile({ cwd, source: '.env.missing' })).rejects.toMatchObject({
        message: 'Source path does not exist.',
        details: [sourcePath],
      } satisfies Partial<SourceEnvFileError>);
    });
  });

  it('rejects directory paths before reading', async () => {
    await withTempProject(async (cwd) => {
      const sourcePath = join(cwd, 'source-dir');
      await mkdir(sourcePath);

      await expect(readSourceEnvFile({ cwd, source: 'source-dir' })).rejects.toMatchObject({
        message: 'Source path must be a file, not a directory.',
        details: [sourcePath],
      } satisfies Partial<SourceEnvFileError>);
    });
  });
});
