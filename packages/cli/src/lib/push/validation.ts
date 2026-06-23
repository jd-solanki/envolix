import type { EnvDiagnostic, EnvDocument, EnvLineRange } from '@envolix/env-parser';
import { getEntryVarType } from '../var-type';

export type PushValidationDiagnosticCode = 'DuplicateKey' | 'MissingVarTypeAnnotation';

export interface PushValidationDiagnostic {
  readonly phase: 'push';
  readonly code: PushValidationDiagnosticCode;
  readonly message: string;
  readonly lineRange: EnvLineRange;
}

export type PushValidationDiagnosticSet = EnvDiagnostic | PushValidationDiagnostic;

export function validateEnvDocumentForPush(
  document: EnvDocument,
): readonly PushValidationDiagnosticSet[] {
  const diagnostics: PushValidationDiagnosticSet[] = [...document.diagnostics];

  for (const [key, entries] of Object.entries(document.keyIndex)) {
    if (entries.length <= 1) {
      continue;
    }

    diagnostics.push(
      createPushDiagnostic({
        phase: 'push',
        code: 'DuplicateKey',
        message: `Source env document contains duplicate key "${key}".`,
        lineRange: {
          start: entries[0]?.lineRange.start ?? 1,
          end: entries.at(-1)?.lineRange.end ?? entries[0]?.lineRange.end ?? 1,
        },
      }),
    );
  }

  for (const node of document.nodes) {
    if (node.type !== 'entry' || getEntryVarType(node) !== undefined) {
      continue;
    }

    diagnostics.push(
      createPushDiagnostic({
        phase: 'push',
        code: 'MissingVarTypeAnnotation',
        message: `Env entry "${node.key}" must include inline #varType:secret or #varType:plain before it can be pushed.`,
        lineRange: node.lineRange,
      }),
    );
  }

  return Object.freeze(diagnostics);
}

function createPushDiagnostic(diagnostic: PushValidationDiagnostic): PushValidationDiagnostic {
  Object.freeze(diagnostic.lineRange);
  return Object.freeze(diagnostic);
}
