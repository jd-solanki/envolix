import { beforeAll, describe, expect, it } from 'vite-plus/test';

import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
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

async function runCliWithEnv(args: readonly string[], cwd: string, env: NodeJS.ProcessEnv) {
  return execFileAsync(process.execPath, [binPath, ...args], {
    cwd,
    env: {
      ...colorEnabledEnv,
      ...env,
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
    expect(stdout).toContain('push');
    expect(stdout).toContain('pull');
    expect(stdout).toContain('Generate an example env file');
    expect(dirname(packageBinPath ?? '')).toBe('./dist');
  });

  it('packages ESM output and declarations for both public packages', async () => {
    const cliPackageJson = JSON.parse(
      await readFile(resolve(packageRoot, 'package.json'), 'utf8'),
    ) as {
      bin?: { envolix?: string };
      exports?: Record<string, unknown>;
      type?: string;
    };
    const parserPackageRoot = resolve(workspaceRoot, 'packages/env-parser');
    const parserPackageJson = JSON.parse(
      await readFile(resolve(parserPackageRoot, 'package.json'), 'utf8'),
    ) as {
      exports?: { '.'?: { types?: string; default?: string } };
      type?: string;
    };

    expect(cliPackageJson.type).toBe('module');
    expect(cliPackageJson.bin?.envolix).toBe('./dist/index.mjs');
    expect(cliPackageJson.exports).toEqual({});
    await expect(readFile(resolve(packageRoot, 'dist/index.mjs'), 'utf8')).resolves.toContain(
      '#!/usr/bin/env node',
    );
    await expect(readFile(resolve(packageRoot, 'dist/index.d.mts'), 'utf8')).resolves.toBeDefined();

    expect(parserPackageJson.type).toBe('module');
    expect(parserPackageJson.exports?.['.']).toEqual({
      types: './dist/index.d.mts',
      default: './dist/index.mjs',
    });
    await expect(
      readFile(resolve(parserPackageRoot, 'dist/index.d.mts'), 'utf8'),
    ).resolves.toContain('parseEnvDocument');

    const parserModule = (await import(
      pathToFileURL(resolve(parserPackageRoot, 'dist/index.mjs')).href
    )) as Record<string, unknown>;
    expect(typeof parserModule.parseEnvDocument).toBe('function');
    expect(parserModule.renderExampleEnvDocument).toBeUndefined();
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

  it('documents push options and requires an explicit provider', async () => {
    const { stdout, stderr } = await runCli(['push', '--help'], packageRoot);
    const missingProvider = await runCliFailure(['push', '--dry-run'], packageRoot);

    expect(stderr).toBe('');
    expect(stdout).toContain('Usage: envolix push [options]');
    expect(stdout).toContain('-s, --source <path>');
    expect(stdout).toContain('-p, --provider <name>');
    expect(stdout).toContain('--repo <owner/name>');
    expect(stdout).toContain('-e, --environment <name>');
    expect(stdout).toContain('--dry-run');
    expect(stdout).toContain('-y, --yes');
    expect(missingProvider.stderr).toContain(
      "required option '-p, --provider <name>' not specified",
    );
  });

  it('documents pull options and requires an explicit provider', async () => {
    const { stdout, stderr } = await runCli(['pull', '--help'], packageRoot);
    const missingProvider = await runCliFailure(['pull'], packageRoot);

    expect(stderr).toBe('');
    expect(stdout).toContain('Usage: envolix pull [options]');
    expect(stdout).toContain('-p, --provider <name>');
    expect(stdout).toContain('--repo <owner/name>');
    expect(stdout).toContain('-e, --environment <name>');
    expect(missingProvider.stderr).toContain(
      "required option '-p, --provider <name>' not specified",
    );
  });

  it('pulls variables and lists blank secrets with a fake GitHub CLI', async () => {
    await withTempProject(async (cwd) => {
      const binDir = join(cwd, 'bin');
      await mkdir(binDir);
      await writeFile(
        join(binDir, 'gh'),
        [
          '#!/usr/bin/env node',
          'const args = process.argv.slice(2);',
          'const expectedRepo = args.at(-2) === "--repo" && args.at(-1) === "acme/app";',
          'if (!expectedRepo) { console.error("missing repo flag"); process.exit(2); }',
          'if (args[0] === "secret" && args[1] === "list") console.log(JSON.stringify([{ name: "TOKEN" }]));',
          'else if (args[0] === "variable" && args[1] === "list") console.log(JSON.stringify([{ name: "PUBLIC_URL", value: "https://example.test" }]));',
          'else { console.error("unexpected command"); process.exit(2); }',
        ].join('\n'),
      );
      await chmod(join(binDir, 'gh'), 0o755);

      const { stdout, stderr } = await runCliWithEnv(
        ['pull', '--provider', 'github', '--repo', 'acme/app'],
        cwd,
        {
          PATH: `${binDir}:${process.env.PATH ?? ''}`,
        },
      );
      const pulledFiles = (await readdir(cwd)).filter((fileName) =>
        fileName.startsWith('.env.pull.github.repo.'),
      );

      expect(pulledFiles).toHaveLength(1);
      await expect(readFile(join(cwd, pulledFiles[0] ?? ''), 'utf8')).resolves.toBe(
        ['TOKEN= #varType:secret', 'PUBLIC_URL=https://example.test', ''].join('\n'),
      );
      expect(stdout).toContain('Pulled GitHub Actions repository scope');
      expect(stdout).toContain('Blank remote secrets:');
      expect(stdout).toContain('TOKEN');
      expect(stderr).toContain('is not gitignored');
    });
  });

  it('prints a push dry-run plan without writing remote values', async () => {
    await withTempProject(async (cwd) => {
      const binDir = join(cwd, 'bin');
      await mkdir(binDir);
      await writeFile(
        join(binDir, 'gh'),
        [
          '#!/usr/bin/env node',
          'const args = process.argv.slice(2);',
          'if (args[0] === "secret" && args[1] === "list") console.log(JSON.stringify([{ name: "TOKEN" }]));',
          'else if (args[0] === "variable" && args[1] === "list") console.log(JSON.stringify([]));',
          'else { console.error("unexpected write"); process.exit(2); }',
        ].join('\n'),
      );
      await chmod(join(binDir, 'gh'), 0o755);
      await writeFile(
        join(cwd, '.env'),
        ['TOKEN=secret #varType:secret', 'PUBLIC_URL=https://example.test #varType:plain'].join(
          '\n',
        ),
      );

      const { stdout, stderr } = await runCliWithEnv(
        ['push', '--provider', 'github', '--dry-run'],
        cwd,
        {
          PATH: `${binDir}:${process.env.PATH ?? ''}`,
        },
      );

      expect(stderr).toBe('');
      expect(stdout).toContain('Push plan:');
      expect(stdout).toContain('TOKEN');
      expect(stdout).toContain('update');
      expect(stdout).toContain('secret');
      expect(stdout).toContain('PUBLIC_URL');
      expect(stdout).toContain('create');
      expect(stdout).toContain('variable');
      expect(stdout).toContain('Dry run: no remote values were changed.');
    });
  });

  it('pushes secret values to gh through stdin', async () => {
    await withTempProject(async (cwd) => {
      const binDir = join(cwd, 'bin');
      await mkdir(binDir);
      await writeFile(
        join(binDir, 'gh'),
        [
          '#!/usr/bin/env node',
          'const args = process.argv.slice(2);',
          'if (args.includes("super-secret")) { console.error("secret leaked into argv"); process.exit(2); }',
          'if (args[0] === "secret" && args[1] === "list") console.log(JSON.stringify([]));',
          'else if (args[0] === "variable" && args[1] === "list") console.log(JSON.stringify([]));',
          'else if (args[0] === "secret" && args[1] === "set" && args[2] === "TOKEN") {',
          '  if (args.includes("--body")) { console.error("secret used --body"); process.exit(2); }',
          '  let body = "";',
          '  process.stdin.setEncoding("utf8");',
          '  process.stdin.on("data", (chunk) => { body += chunk; });',
          '  process.stdin.on("end", () => {',
          '    if (body !== "super-secret") { console.error("missing stdin secret"); process.exit(2); }',
          '  });',
          '}',
          'else if (args[0] === "variable" && args[1] === "set" && args[2] === "PUBLIC_URL") process.exit(0);',
          'else { console.error("unexpected command"); process.exit(2); }',
        ].join('\n'),
      );
      await chmod(join(binDir, 'gh'), 0o755);
      await writeFile(
        join(cwd, '.env'),
        [
          'TOKEN=super-secret #varType:secret',
          'PUBLIC_URL=https://example.test #varType:plain',
        ].join('\n'),
      );

      const { stdout, stderr } = await runCliWithEnv(
        ['push', '--provider', 'github', '--yes'],
        cwd,
        {
          PATH: `${binDir}:${process.env.PATH ?? ''}`,
        },
      );

      expect(stderr).toBe('');
      expect(stdout).toContain('TOKEN');
      expect(stdout).toContain('success');
      expect(stdout).toContain('PUBLIC_URL');
    });
  });

  it('prints an environment-scoped push dry-run plan', async () => {
    await withTempProject(async (cwd) => {
      const binDir = join(cwd, 'bin');
      await mkdir(binDir);
      await writeFile(
        join(binDir, 'gh'),
        [
          '#!/usr/bin/env node',
          'const args = process.argv.slice(2);',
          'const expectedRepo = args.at(-4) === "--repo" && args.at(-3) === "acme/app";',
          'const expectedEnv = args.at(-2) === "--env" && args.at(-1) === "production";',
          'if (!expectedRepo) { console.error("missing repo flag"); process.exit(2); }',
          'if (!expectedEnv) { console.error("missing environment flag"); process.exit(2); }',
          'if (args[0] === "secret" && args[1] === "list") console.log(JSON.stringify([]));',
          'else if (args[0] === "variable" && args[1] === "list") console.log(JSON.stringify([{ name: "PUBLIC_URL", value: "https://example.test" }]));',
          'else { console.error("unexpected write"); process.exit(2); }',
        ].join('\n'),
      );
      await chmod(join(binDir, 'gh'), 0o755);
      await writeFile(
        join(cwd, '.env'),
        ['TOKEN=secret #varType:secret', 'PUBLIC_URL=https://example.test #varType:plain'].join(
          '\n',
        ),
      );

      const { stdout, stderr } = await runCliWithEnv(
        [
          'push',
          '--provider',
          'github',
          '--repo',
          'acme/app',
          '--environment',
          'production',
          '--dry-run',
        ],
        cwd,
        {
          PATH: `${binDir}:${process.env.PATH ?? ''}`,
        },
      );

      expect(stderr).toBe('');
      expect(stdout).toContain('GitHub Environment: production');
      expect(stdout).toContain('TOKEN');
      expect(stdout).toContain('create');
      expect(stdout).toContain('PUBLIC_URL');
      expect(stdout).toContain('update');
    });
  });

  it('refuses push validation failures before calling gh', async () => {
    await withTempProject(async (cwd) => {
      const binDir = join(cwd, 'bin');
      await mkdir(binDir);
      await writeFile(
        join(binDir, 'gh'),
        [
          '#!/usr/bin/env node',
          'console.error("gh should not be called");',
          'process.exit(9);',
        ].join('\n'),
      );
      await chmod(join(binDir, 'gh'), 0o755);
      await writeFile(join(cwd, '.env'), 'TOKEN=secret\n');

      const result = await runCliFailure(['push', '--provider', 'github', '--dry-run'], cwd);

      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('MissingVarTypeAnnotation');
      expect(result.stderr).toContain(`${join(cwd, '.env')}:1`);
      expect(result.stderr).not.toContain('gh should not be called');
    });
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
