import { describe, expect, it } from 'vite-plus/test';

import { renderCheckResult } from '../../src/commands/check';

const paths = { source: '.env', target: '.env.production' };

describe('renderCheckResult', () => {
  it('reports success with exit code 0 when there is no drift', () => {
    const report = renderCheckResult({ missingKeys: [], extraKeys: [] }, paths);

    expect(report.exitCode).toBe(0);
    expect(report.lines).toEqual(['✓ .env.production covers all keys in .env']);
  });

  it('lists missing keys under a heading with exit code 1', () => {
    const report = renderCheckResult(
      { missingKeys: ['DATABASE_URL', 'REDIS_URL'], extraKeys: [] },
      paths,
    );

    expect(report.exitCode).toBe(1);
    expect(report.lines).toEqual([
      '✗ .env.production is missing keys from .env:',
      '  - DATABASE_URL',
      '  - REDIS_URL',
    ]);
  });

  it('lists extra keys under their own heading', () => {
    const report = renderCheckResult({ missingKeys: [], extraKeys: ['LEGACY_FLAG'] }, paths);

    expect(report.exitCode).toBe(1);
    expect(report.lines).toEqual([
      '✗ .env.production has keys absent from .env:',
      '  - LEGACY_FLAG',
    ]);
  });

  it('lists missing and extra keys together when both drift', () => {
    const report = renderCheckResult({ missingKeys: ['A'], extraKeys: ['B'] }, paths);

    expect(report.exitCode).toBe(1);
    expect(report.lines).toEqual([
      '✗ .env.production is missing keys from .env:',
      '  - A',
      '✗ .env.production has keys absent from .env:',
      '  - B',
    ]);
  });
});
