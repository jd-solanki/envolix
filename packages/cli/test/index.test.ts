import { beforeAll, describe, expect, it } from 'vite-plus/test';

import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const packageRoot = resolve(import.meta.dirname, '..');
const workspaceRoot = resolve(packageRoot, '..', '..');
const binPath = resolve(packageRoot, 'dist/index.mjs');
const { NO_COLOR: _noColor, ...colorEnabledEnv } = process.env;

async function runCli(args: readonly string[], cwd: string) {
  return execFileAsync(process.execPath, [binPath, ...args], {
    cwd,
    env: {
      ...colorEnabledEnv,
      FORCE_COLOR: '1',
    },
  });
}

async function runCliFailure(args: readonly string[], cwd: string) {
  try {
    await runCli(args, cwd);
  } catch (error) {
    return error as { readonly stdout: string; readonly stderr: string; readonly code: number };
  }

  throw new Error(`Expected envolix ${args.join(' ')} to fail.`);
}

async function withTempProject<T>(callback: (cwd: string) => Promise<T>): Promise<T> {
  const cwd = await mkdtemp(join(tmpdir(), 'envolix-cli-'));

  try {
    return await callback(cwd);
  } finally {
    await rm(cwd, { force: true, recursive: true });
  }
}

describe('@envolix/cli', () => {
  beforeAll(async () => {
    await execFileAsync('pnpm', ['--filter', '@envolix/env-parser', 'run', 'pack'], {
      cwd: workspaceRoot,
    });
    await execFileAsync('pnpm', ['--filter', '@envolix/cli', 'run', 'pack'], {
      cwd: workspaceRoot,
    });
  });

  it('publishes an envolix binary with top-level help', async () => {
    const packageJson = JSON.parse(
      await readFile(resolve(packageRoot, 'package.json'), 'utf8'),
    ) as { bin?: { envolix?: string } };
    const packageBinPath = packageJson.bin?.envolix;

    expect(packageBinPath).toBe('./dist/index.mjs');

    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [resolve(packageRoot, packageBinPath ?? ''), '--help'],
      {
        cwd: packageRoot,
      },
    );

    expect(stderr).toBe('');
    expect(stdout).toContain('Usage: envolix [options] [command]');
    expect(stdout).toContain('Generate safe example env files');
    expect(stdout).toContain('gen');
    expect(stdout).toContain('Generate an example env file');
    expect(dirname(packageBinPath ?? '')).toBe('./dist');
  });

  it('documents gen options and defaults in command help', async () => {
    const { stdout, stderr } = await runCli(['gen', '--help'], packageRoot);

    expect(stderr).toBe('');
    expect(stdout).toContain('Usage: envolix gen [options]');
    expect(stdout).toContain('-s, --source <path>');
    expect(stdout).toContain('-t, --target <path>');
    expect(stdout).toContain('(default: ".env")');
    expect(stdout).toContain('(default: ".env.example")');
  });

  it('generates .env.example from .env by default', async () => {
    await withTempProject(async (cwd) => {
      await writeFile(
        join(cwd, '.env'),
        [
          '# service',
          'export API_KEY=secret # keep this #varType:secret',
          '',
          'PORT=3000',
          '',
        ].join('\n'),
      );

      const { stdout, stderr } = await runCli(['gen'], cwd);

      await expect(readFile(join(cwd, '.env.example'), 'utf8')).resolves.toBe(
        ['# service', 'export API_KEY= # keep this #varType:secret', '', 'PORT=', ''].join('\n'),
      );
      expect(stderr).toBe('');
      expect(stdout).toContain('Generated .env.example from .env');
      expect(stdout).toContain('\u001B[32m');
    });
  });

  it('uses the default source with a custom target', async () => {
    await withTempProject(async (cwd) => {
      await writeFile(join(cwd, '.env'), 'TOKEN=secret\n');

      await runCli(['gen', '--target', '.env.sample'], cwd);

      await expect(readFile(join(cwd, '.env.sample'), 'utf8')).resolves.toBe('TOKEN=\n');
    });
  });

  it('uses custom source and target paths', async () => {
    await withTempProject(async (cwd) => {
      await writeFile(join(cwd, '.env.prod'), 'PROD_TOKEN=secret\n');

      await runCli(['gen', '--source', '.env.prod', '--target', '.env.staging'], cwd);

      await expect(readFile(join(cwd, '.env.staging'), 'utf8')).resolves.toBe('PROD_TOKEN=\n');
    });
  });

  it('supports source and target aliases', async () => {
    await withTempProject(async (cwd) => {
      await writeFile(join(cwd, '.env.prod'), 'ALIAS_TOKEN=secret\n');

      await runCli(['gen', '-s', '.env.prod', '-t', '.env.alias'], cwd);

      await expect(readFile(join(cwd, '.env.alias'), 'utf8')).resolves.toBe('ALIAS_TOKEN=\n');
    });
  });

  it('resolves relative paths from the current working directory', async () => {
    await withTempProject(async (cwd) => {
      await writeFile(join(cwd, '.env'), 'ROOT_TOKEN=secret\n');

      await runCli(['gen', '--target', 'nested.env'], cwd);

      await expect(readFile(join(cwd, 'nested.env'), 'utf8')).resolves.toBe('ROOT_TOKEN=\n');
    });
  });

  it('overwrites existing targets without validating or merging target content', async () => {
    await withTempProject(async (cwd) => {
      await writeFile(join(cwd, '.env'), 'SOURCE=value\n');
      await writeFile(join(cwd, '.env.example'), 'not valid env content');

      await runCli(['gen'], cwd);

      await expect(readFile(join(cwd, '.env.example'), 'utf8')).resolves.toBe('SOURCE=\n');
    });
  });

  it('creates the target when it is missing and the parent directory exists', async () => {
    await withTempProject(async (cwd) => {
      await writeFile(join(cwd, '.env'), 'CREATED=value\n');

      await runCli(['gen', '--target', 'created.env'], cwd);

      await expect(readFile(join(cwd, 'created.env'), 'utf8')).resolves.toBe('CREATED=\n');
    });
  });

  it('rejects source and target paths that resolve to the same file before writing', async () => {
    await withTempProject(async (cwd) => {
      await writeFile(join(cwd, '.env'), 'SECRET=value\n');

      const result = await runCliFailure(['gen', '--target', '.env'], cwd);

      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('\u001B[31mError: \u001B[39m');
      expect(result.stderr).toContain('Source and target paths must be different.');
      await expect(readFile(join(cwd, '.env'), 'utf8')).resolves.toBe('SECRET=value\n');
    });
  });

  it('fails on a missing source without creating or modifying the target', async () => {
    await withTempProject(async (cwd) => {
      await writeFile(join(cwd, '.env.example'), 'KEEP=this\n');

      const result = await runCliFailure(['gen', '--source', '.env.missing'], cwd);

      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('Source path does not exist.');
      await expect(readFile(join(cwd, '.env.example'), 'utf8')).resolves.toBe('KEEP=this\n');
    });
  });

  it('fails when the target parent directory is missing', async () => {
    await withTempProject(async (cwd) => {
      await writeFile(join(cwd, '.env'), 'TOKEN=value\n');

      const result = await runCliFailure(['gen', '--target', 'missing/.env.example'], cwd);

      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('Target parent path does not exist.');
      await expect(readFile(join(cwd, 'missing/.env.example'), 'utf8')).rejects.toThrow();
    });
  });

  it('rejects directory paths for source and target', async () => {
    await withTempProject(async (cwd) => {
      await mkdir(join(cwd, 'source-dir'));
      await mkdir(join(cwd, 'target-dir'));
      await writeFile(join(cwd, '.env'), 'TOKEN=value\n');
      await writeFile(join(cwd, '.env.example'), 'KEEP=this\n');

      const sourceResult = await runCliFailure(['gen', '--source', 'source-dir'], cwd);
      const targetResult = await runCliFailure(['gen', '--target', 'target-dir'], cwd);

      expect(sourceResult.stdout).toBe('');
      expect(sourceResult.stderr).toContain('Source path must be a file, not a directory.');
      expect(targetResult.stdout).toBe('');
      expect(targetResult.stderr).toContain('Target path must be a file, not a directory.');
      await expect(readFile(join(cwd, '.env.example'), 'utf8')).resolves.toBe('KEEP=this\n');
    });
  });

  it('overwrites targets through a temporary sibling rename without preserving permissions', async () => {
    await withTempProject(async (cwd) => {
      const targetPath = join(cwd, '.env.example');
      await writeFile(join(cwd, '.env'), 'TOKEN=value\n');
      await writeFile(targetPath, 'OLD=value\n');
      await chmod(targetPath, 0o777);
      const before = await stat(targetPath);

      await runCli(['gen'], cwd);

      const after = await stat(targetPath);
      await expect(readFile(targetPath, 'utf8')).resolves.toBe('TOKEN=\n');
      expect(after.ino).not.toBe(before.ino);
      expect(after.mode & 0o777).not.toBe(0o777);
    });
  });

  it('prints source diagnostics with source paths and 1-based line numbers to stderr', async () => {
    await withTempProject(async (cwd) => {
      await writeFile(
        join(cwd, '.env'),
        [
          'DUP=first\r\n',
          'DUP=second\n',
          '1BAD=value\n',
          'BACK=`tick`\n',
          'export FOO\n',
          'unknown line\n',
        ].join(''),
      );

      const result = await runCliFailure(['gen'], cwd);
      const sourcePath = join(cwd, '.env');

      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('\u001B[31mError: \u001B[39m');
      expect(result.stderr).toContain('\u001B[33mInvalidKey\u001B[39m');
      expect(result.stderr).toContain('UnsupportedQuote');
      expect(result.stderr).toContain('InvalidExport');
      expect(result.stderr).toContain('UnknownLine');
      expect(result.stderr).toContain('MixedLineEndings');
      expect(result.stderr).toContain('DuplicateKey');
      expect(result.stderr).toContain(`${sourcePath}:3`);
      expect(result.stderr).toContain(`${sourcePath}:1-2`);
      expect(result.stderr).toContain(`${sourcePath}:1-6`);
      await expect(readFile(join(cwd, '.env.example'), 'utf8')).rejects.toThrow();
    });
  });

  it('surfaces unterminated quote diagnostics without writing the target', async () => {
    await withTempProject(async (cwd) => {
      await writeFile(join(cwd, '.env'), 'SECRET="unterminated\n');

      const result = await runCliFailure(['gen'], cwd);

      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('UnterminatedQuote');
      expect(result.stderr).toContain(`${join(cwd, '.env')}:1`);
      await expect(readFile(join(cwd, '.env.example'), 'utf8')).rejects.toThrow();
    });
  });
});
