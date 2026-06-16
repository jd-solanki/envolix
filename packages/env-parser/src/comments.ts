import type { EnvComment, EnvCommentSegment } from './types';

export function parseComment(raw: string): EnvComment {
  const segments: EnvCommentSegment[] = [];
  const segmentPattern = /#[^#]*/g;
  let match: RegExpExecArray | null;

  while ((match = segmentPattern.exec(raw)) !== null) {
    const segment = match[0] ?? '';
    segments.push({
      raw: segment,
      text: segment.slice(1).trim(),
    });
  }

  return Object.freeze({
    raw,
    segments: Object.freeze(segments),
  });
}
