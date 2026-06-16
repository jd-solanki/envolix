import { describe, expect, it } from 'vite-plus/test';

import {
  createProvider,
  formatProviderTarget,
  formatSupportedProviderNames,
  parseProviderName,
} from '../../src/lib/provider/catalog';
import { GitHubProvider } from '../../src/lib/provider/github';

describe('provider catalog', () => {
  it('parses supported provider names and rejects unsupported names', () => {
    expect(parseProviderName('github')).toBe('github');
    expect(parseProviderName('vercel')).toBeUndefined();
    expect(formatSupportedProviderNames()).toBe('github');
  });

  it('creates provider adapters from supported provider names', () => {
    expect(createProvider('github')).toBeInstanceOf(GitHubProvider);
  });

  it('formats GitHub target labels for commands', () => {
    expect(formatProviderTarget('github', { target: {} })).toBe('GitHub Actions repository scope');
    expect(formatProviderTarget('github', { target: { environment: 'production' } })).toBe(
      'GitHub Environment: production',
    );
    expect(
      formatProviderTarget('github', {
        target: { repo: 'acme/app', environment: 'production' },
      }),
    ).toBe('GitHub Environment: production in acme/app');
  });
});
