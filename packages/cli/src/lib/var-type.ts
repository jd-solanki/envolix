import type { EnvEntry } from '@envolix/env-parser';
import type { RemoteEntryKind } from './provider/index';

/**
 * Interpret the `varType` comment annotation on an env entry's inline comment.
 *
 * Returns the declared kind (`'secret'` or `'variable'`) when the entry carries
 * an exact `#varType:secret` / `#varType:plain` inline annotation, or `undefined`
 * when the annotation is absent or unrecognised. Only the entry's own inline
 * comment is consulted; a preceding full-line comment never applies.
 *
 * This is the single shared definition of an entry's kind. Both push (which
 * decides remote secret vs variable) and gen value preservation (which only
 * preserves `plain` values) depend on it agreeing, so a key can never read as
 * plain in one workflow and secret in the other.
 */
export function getEntryVarType(entry: EnvEntry): RemoteEntryKind | undefined {
  const varTypeSegment = entry.inlineComment?.segments.find((segment) =>
    segment.text.startsWith('varType:'),
  );

  if (varTypeSegment?.text === 'varType:secret') {
    return 'secret';
  }

  if (varTypeSegment?.text === 'varType:plain') {
    return 'variable';
  }

  return undefined;
}
