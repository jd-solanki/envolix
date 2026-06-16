import { describe, expect, it } from 'vite-plus/test';

import {
  GhAdapter,
  GhCommandError,
  GhEnvironmentNotFoundError,
  GhNotAuthenticatedError,
  GhNotFoundError,
} from '../../src/lib/provider/gh.js';

describe('gh adapter', () => {
  it('builds repo-level gh argv for listing and setting Actions secrets and variables', async () => {
    const calls: readonly string[][] = [];
    const mutableCalls: string[][] = [];
    const adapter = new GhAdapter(async (args) => {
      mutableCalls.push([...args]);
      if (args[0] === 'secret' && args[1] === 'list') {
        return { stdout: JSON.stringify([{ name: 'SECRET' }]), stderr: '' };
      }
      if (args[0] === 'variable' && args[1] === 'list') {
        return { stdout: JSON.stringify([{ name: 'PLAIN' }]), stderr: '' };
      }
      return { stdout: '', stderr: '' };
    });
    Object.assign(calls, mutableCalls);

    expect(await adapter.listSecrets()).toEqual(['SECRET']);
    expect(await adapter.listVariables()).toEqual(['PLAIN']);
    await adapter.setSecret('SECRET', 's1');
    await adapter.setVariable('PLAIN', 'v1');

    expect(mutableCalls).toEqual([
      ['secret', 'list', '--json', 'name'],
      ['variable', 'list', '--json', 'name'],
      ['secret', 'set', 'SECRET', '--body', 's1'],
      ['variable', 'set', 'PLAIN', '--body', 'v1'],
    ]);
  });

  it('adds environment scoping to gh argv when a GitHub Environment is targeted', async () => {
    const calls: string[][] = [];
    const adapter = new GhAdapter(async (args) => {
      calls.push([...args]);
      if (args[0] === 'secret' && args[1] === 'list') {
        return { stdout: JSON.stringify([{ name: 'TOKEN' }]), stderr: '' };
      }
      if (args[0] === 'variable' && args[1] === 'list') {
        return { stdout: JSON.stringify([{ name: 'PUBLIC_URL' }]), stderr: '' };
      }
      return { stdout: '', stderr: '' };
    });
    const target = { environment: 'production' };

    expect(await adapter.listSecrets(target)).toEqual(['TOKEN']);
    expect(await adapter.listVariables(target)).toEqual(['PUBLIC_URL']);
    await adapter.setSecret('TOKEN', 's1', target);
    await adapter.setVariable('PUBLIC_URL', 'https://example.test', target);

    expect(calls).toEqual([
      ['secret', 'list', '--json', 'name', '--env', 'production'],
      ['variable', 'list', '--json', 'name', '--env', 'production'],
      ['secret', 'set', 'TOKEN', '--body', 's1', '--env', 'production'],
      ['variable', 'set', 'PUBLIC_URL', '--body', 'https://example.test', '--env', 'production'],
    ]);
  });

  it('translates missing, unauthenticated, and failed gh invocations into domain errors', async () => {
    await expect(
      new GhAdapter(async () => {
        const error = new Error('spawn gh ENOENT') as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        throw error;
      }).listSecrets(),
    ).rejects.toBeInstanceOf(GhNotFoundError);

    await expect(
      new GhAdapter(async () => {
        throw Object.assign(new Error('not logged in'), {
          stderr: 'To authenticate, run: gh auth login',
          exitCode: 1,
        });
      }).listSecrets(),
    ).rejects.toBeInstanceOf(GhNotAuthenticatedError);

    await expect(
      new GhAdapter(async () => {
        throw Object.assign(new Error('boom'), { stderr: 'api failed', exitCode: 1 });
      }).setVariable('PLAIN', 'v1'),
    ).rejects.toBeInstanceOf(GhCommandError);
  });

  it('translates missing GitHub Environments into a clear domain error before writes', async () => {
    const calls: string[][] = [];
    const adapter = new GhAdapter(async (args) => {
      calls.push([...args]);
      throw Object.assign(new Error('not found'), {
        stderr:
          'HTTP 404: Not Found (https://api.github.com/repos/acme/app/environments/production/secrets)',
        exitCode: 1,
      });
    });

    await expect(adapter.listSecrets({ environment: 'production' })).rejects.toMatchObject({
      message: 'GitHub Environment "production" does not exist.',
    } satisfies Partial<GhEnvironmentNotFoundError>);
    expect(calls).toEqual([['secret', 'list', '--json', 'name', '--env', 'production']]);
  });
});
