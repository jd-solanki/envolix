import Table from 'cli-table3';
import pc from 'picocolors';

const BORDERLESS_CHARS = {
  top: '',
  'top-mid': '',
  'top-left': '',
  'top-right': '',
  bottom: '',
  'bottom-mid': '',
  'bottom-left': '',
  'bottom-right': '',
  left: '',
  'left-mid': '',
  mid: '',
  'mid-mid': '',
  right: '',
  'right-mid': '',
  middle: '',
} as const;

// Renders a borderless, GitHub-CLI-style table: no box-drawing characters, columns
// separated by whitespace, with a dim underlined header row. Data cell coloring is the
// caller's responsibility; this helper owns only the structural header styling.
// Returns an empty string when there are no rows so callers never emit a header-only table.
export function renderTable(head: readonly string[], rows: readonly (readonly string[])[]): string {
  if (rows.length === 0) {
    return '';
  }

  const table = new Table({
    head: head.map((title) => pc.dim(pc.underline(title.toUpperCase()))),
    chars: { ...BORDERLESS_CHARS },
    style: {
      head: [],
      border: [],
      'padding-left': 0,
      'padding-right': 2,
    },
  });

  for (const row of rows) {
    table.push([...row]);
  }

  return table.toString();
}
