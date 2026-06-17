import { describe, expect, it } from 'vite-plus/test';

import { renderTable } from '../../src/utils/table.js';

// Colored cells carry ANSI escape codes; strip them so assertions reason about
// the visible text the user actually sees rather than the raw control bytes.
const stripAnsi = (value: string): string => value.replace(/\[[0-9;]*m/g, '');

describe('renderTable', () => {
  it('renders nothing when there are no rows', () => {
    expect(renderTable(['Key', 'Status'], [])).toBe('');
  });

  it('keeps columns aligned and preserves cell color across differing widths', () => {
    const green = (value: string): string => `[32m${value}[39m`;
    const table = renderTable(
      ['Key', 'Status'],
      [
        ['SHORT', green('success')],
        ['A_MUCH_LONGER_KEY', 'failure'],
      ],
    );
    const visibleLines = stripAnsi(table).split('\n');

    // The status column starts at the same offset on every row despite the
    // differing key widths and the color codes embedded in one of the cells.
    expect(visibleLines[1]?.indexOf('success')).toBe(visibleLines[2]?.indexOf('failure'));
    // Caller-applied color survives rendering.
    expect(table).toContain('[32m');
  });
});
