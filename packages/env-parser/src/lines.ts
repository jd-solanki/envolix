import type { EnvLineEnding } from './types.js';

export interface PhysicalLine {
  readonly text: string;
  readonly ending: '' | '\n' | '\r\n';
}

export function splitPhysicalLines(source: string): PhysicalLine[] {
  if (source === '') {
    return [];
  }

  const lines: PhysicalLine[] = [];
  const linePattern = /([^\r\n]*)(\r\n|\n|$)/g;
  let match: RegExpExecArray | null;

  while ((match = linePattern.exec(source)) !== null) {
    const text = match[1] ?? '';
    const ending = (match[2] ?? '') as PhysicalLine['ending'];

    if (text === '' && ending === '') {
      break;
    }

    lines.push({ text, ending });

    if (ending === '') {
      break;
    }
  }

  return lines;
}

export function detectLineEnding(lines: readonly PhysicalLine[]): EnvLineEnding {
  const endings = new Set(lines.map((line) => line.ending).filter(Boolean));
  if (endings.size === 0) {
    return 'none';
  }

  if (endings.size > 1) {
    return 'mixed';
  }

  return endings.has('\r\n') ? 'crlf' : 'lf';
}

export function joinRawLines(
  lines: readonly PhysicalLine[],
  startIndex: number,
  endIndex: number,
): string {
  let raw = '';

  for (let index = startIndex; index <= endIndex; index += 1) {
    const line = lines[index];
    if (line === undefined) {
      continue;
    }

    raw += line.text;
    if (index < endIndex) {
      raw += line.ending;
    }
  }

  return raw;
}
