import { describe, expect, it } from 'vite-plus/test';

import { parseEnvDocument } from '../../../env-parser/src/index.js';
import { validateEnvDocumentForPush } from '../../src/lib/push/validation.js';

describe('push validation', () => {
  it('requires each entry to have a valid inline varType annotation', () => {
    const document = parseEnvDocument(
      [
        '# section-level annotations do not apply #varType:secret',
        'SECRET=value #varType:secret',
        'PLAIN=value #varType:plain',
        'MISSING=value',
        'INVALID=value #varType:encrypted',
      ].join('\n'),
    );

    const diagnostics = validateEnvDocumentForPush(document);

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'MissingVarTypeAnnotation',
      'MissingVarTypeAnnotation',
    ]);
    expect(diagnostics.map((diagnostic) => diagnostic.lineRange)).toEqual([
      { start: 4, end: 4 },
      { start: 5, end: 5 },
    ]);
  });

  it('blocks parser diagnostics and duplicate keys, but not mixed line endings', () => {
    const document = parseEnvDocument(
      ['DUP=one #varType:plain\r\n', 'DUP=two #varType:plain\n', 'not valid syntax\n'].join(''),
    );

    expect(validateEnvDocumentForPush(document).map((diagnostic) => diagnostic.code)).toEqual([
      'UnknownLine',
      'DuplicateKey',
    ]);
  });
});
