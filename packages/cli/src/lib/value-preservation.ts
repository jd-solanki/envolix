import type { EnvDocument } from '@envolix/env-parser';
import { getEntryVarType } from './var-type';

/**
 * The outcome of matching an existing target env file against its source.
 *
 * `values` maps each source key eligible for value preservation to the exact
 * text to splice after `KEY=` when rendering — copied verbatim from the target
 * entry (quotes included). `warnings` holds non-fatal messages for keys that
 * could have been preserved but were skipped because the existing target was
 * ambiguous; they never block generation.
 */
export interface ValuePreservation {
  readonly values: ReadonlyMap<string, string>;
  readonly warnings: readonly string[];
}

/**
 * Decide which existing target values survive a regeneration.
 *
 * Security-first: a value is preserved only when the matching *source* entry is
 * annotated `#varType:plain`. Secret-annotated and unannotated source keys are
 * never preserved, so a regenerated target can never silently re-emit a secret.
 *
 * The matched value is the target entry's raw value (trimmed of assignment
 * whitespace but keeping the author's quote style), so the round-trip is exact.
 * A key duplicated in the existing target is ambiguous and is skipped with a
 * warning rather than guessing which value the author meant.
 */
export function resolveValuePreservation(
  source: EnvDocument,
  target: EnvDocument,
): ValuePreservation {
  const values = new Map<string, string>();
  const warnings: string[] = [];

  for (const node of source.nodes) {
    if (node.type !== 'entry' || getEntryVarType(node) !== 'variable') {
      continue;
    }

    const targetEntries = target.findEntries(node.key);
    if (targetEntries.length > 1) {
      warnings.push(
        `Skipped preserving "${node.key}": it appears more than once in the existing target env file.`,
      );
      continue;
    }

    const targetEntry = targetEntries[0];
    if (targetEntry === undefined || targetEntry.value === '') {
      continue;
    }

    values.set(node.key, targetEntry.rawValue.trim());
  }

  return Object.freeze({ values, warnings: Object.freeze(warnings) });
}
