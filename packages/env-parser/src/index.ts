export const packageName = '@envolix/env-parser';

export { parseEnvDocument } from './document.js';
export { parseEnvDocument as parseEnv } from './document.js';
export type {
  EnvBlankLine,
  EnvComment,
  EnvCommentSegment,
  EnvDiagnostic,
  EnvDiagnosticCode,
  EnvDiagnosticPhase,
  EnvDocument,
  EnvEntry,
  EnvFullLineComment,
  EnvLineEnding,
  EnvLineRange,
  EnvNode,
  EnvQuoteStyle,
  EnvUnknownLine,
} from './types.js';
