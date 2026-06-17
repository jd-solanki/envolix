import { describe, expect, it } from 'vite-plus/test';

import { formatErrorRows } from '../../src/commands/push';
import type { PushResultEntry } from '../../src/lib/push/workflow';

const entry = (overrides: Partial<PushResultEntry>): PushResultEntry => ({
  key: 'KEY',
  kind: 'secret',
  action: 'create',
  status: 'failure',
  ...overrides,
});

describe('formatErrorRows', () => {
  it('returns nothing when no entry carries an error', () => {
    const rows = formatErrorRows([
      entry({ key: 'A', status: 'success' }),
      entry({ key: 'B', status: 'success' }),
    ]);

    expect(rows).toEqual([]);
  });

  it('includes only failed entries, skipping successes', () => {
    const rows = formatErrorRows([
      entry({ key: 'OK', status: 'success' }),
      entry({ key: 'BAD', error: 'boom' }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.message).toBe('boom');
  });

  it('collapses a multi-line provider error onto a single row', () => {
    const rows = formatErrorRows([
      entry({ key: 'TOKEN', error: 'HTTP 422\n  Validation failed:\n   - already exists' }),
    ]);

    expect(rows[0]?.message).toBe('HTTP 422 Validation failed: - already exists');
  });

  it('pads every key to the widest key so messages align', () => {
    const rows = formatErrorRows([
      entry({ key: 'SHORT', error: 'a' }),
      entry({ key: 'A_MUCH_LONGER_KEY', error: 'b' }),
    ]);

    const widths = rows.map((row) => row.key.length);
    expect(widths[0]).toBe(widths[1]);
    expect(rows[0]?.key).toBe('SHORT'.padEnd('A_MUCH_LONGER_KEY'.length));
  });
});
