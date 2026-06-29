import type { EnvLineRange } from '@envolix/env-parser';
import pc from 'picocolors';

// The minimal shape every parser/workflow diagnostic shares. Accepting this
// structural type lets one formatter serve gen, check, and push without coupling
// to any one command's diagnostic union.
interface FormattableDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly lineRange: EnvLineRange;
}

/** Render a diagnostic as a single `CODE path:line message` line for the terminal. */
export function formatDiagnostic(sourcePath: string, diagnostic: FormattableDiagnostic): string {
  return [
    pc.yellow(diagnostic.code),
    pc.dim(`${sourcePath}:${formatLineRange(diagnostic.lineRange)}`),
    diagnostic.message,
  ].join(' ');
}

function formatLineRange(lineRange: EnvLineRange): string {
  return lineRange.start === lineRange.end
    ? String(lineRange.start)
    : `${lineRange.start}-${lineRange.end}`;
}
