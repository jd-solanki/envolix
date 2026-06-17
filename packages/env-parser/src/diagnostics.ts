import type { EnvDiagnostic } from './types';

export function createUnknownLineDiagnostic(line: string, lineNumber: number): EnvDiagnostic {
  return createDiagnostic({
    phase: 'parse',
    code: 'UnknownLine',
    message: `Line ${lineNumber} is not a supported env entry, comment, or blank line.`,
    lineRange: { start: lineNumber, end: lineNumber },
  });
}

export function createDiagnostic(input: EnvDiagnostic): EnvDiagnostic {
  Object.freeze(input.lineRange);
  return Object.freeze(input);
}
