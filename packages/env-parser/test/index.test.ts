import { describe, expect, it } from 'vite-plus/test';

import {
  EnvValidationError,
  assertEnvDocumentValidForGeneration,
  packageName,
  parseEnvDocument,
  renderExampleEnvDocument,
  validateEnvDocumentForGeneration,
} from '../src/index.js';

describe('@envolix/env-parser', () => {
  it('exposes the package boundary', () => {
    expect(packageName).toBe('@envolix/env-parser');
  });

  it('returns an ordered env document instead of a key/value object', () => {
    const document = parseEnvDocument(
      [
        '  # database #varType:secret',
        'DATABASE_URL = postgres://local # connection #owner:platform',
        '   ',
        'export API_KEY="secret value"',
        'DATABASE_URL=postgres://duplicate',
      ].join('\n'),
    );

    expect(document.type).toBe('document');
    expect(document.nodes.map((node) => node.type)).toEqual([
      'comment',
      'entry',
      'blank',
      'entry',
      'entry',
    ]);
    expect(document.lineEnding).toBe('lf');
    expect(document.finalNewline).toBe(false);
    expect(document.diagnostics).toEqual([]);

    const comment = document.nodes[0];
    expect(comment).toMatchObject({
      type: 'comment',
      raw: '  # database #varType:secret',
      lineRange: { start: 1, end: 1 },
      comment: {
        raw: '# database #varType:secret',
        segments: [
          { raw: '# database ', text: 'database' },
          { raw: '#varType:secret', text: 'varType:secret' },
        ],
      },
    });

    const firstEntry = document.nodes[1];
    expect(firstEntry).toMatchObject({
      type: 'entry',
      raw: 'DATABASE_URL = postgres://local # connection #owner:platform',
      lineRange: { start: 2, end: 2 },
      key: 'DATABASE_URL',
      value: 'postgres://local',
      rawValue: ' postgres://local ',
      quoteStyle: 'none',
      exportPrefix: undefined,
      inlineComment: {
        raw: '# connection #owner:platform',
        segments: [
          { raw: '# connection ', text: 'connection' },
          { raw: '#owner:platform', text: 'owner:platform' },
        ],
      },
    });

    expect(document.nodes[2]).toMatchObject({
      type: 'blank',
      raw: '   ',
      lineRange: { start: 3, end: 3 },
    });

    expect(document.nodes[3]).toMatchObject({
      type: 'entry',
      key: 'API_KEY',
      value: 'secret value',
      rawValue: '"secret value"',
      quoteStyle: 'double',
      exportPrefix: 'export ',
      inlineComment: undefined,
    });

    expect(Object.isFrozen(document)).toBe(true);
    expect(Object.isFrozen(document.nodes)).toBe(true);
    expect(Object.isFrozen(document.nodes[0])).toBe(true);
  });

  it('parses single-quoted and double-quoted multiline values', () => {
    const document = parseEnvDocument(
      [
        "PRIVATE_KEY='line one",
        "line two'",
        'CERT="-----BEGIN-----',
        'body',
        '-----END-----" # certificate',
      ].join('\r\n'),
    );

    expect(document.lineEnding).toBe('crlf');

    const privateKey = document.findEntry('PRIVATE_KEY');
    expect(privateKey).toMatchObject({
      type: 'entry',
      lineRange: { start: 1, end: 2 },
      value: 'line one\r\nline two',
      rawValue: "'line one\r\nline two'",
      quoteStyle: 'single',
    });

    const cert = document.findEntry('CERT');
    expect(cert).toMatchObject({
      type: 'entry',
      lineRange: { start: 3, end: 5 },
      value: '-----BEGIN-----\r\nbody\r\n-----END-----',
      rawValue: '"-----BEGIN-----\r\nbody\r\n-----END-----"',
      quoteStyle: 'double',
      inlineComment: {
        raw: '# certificate',
        segments: [{ raw: '# certificate', text: 'certificate' }],
      },
    });
  });

  it('trims unquoted semantic values while preserving the raw value text', () => {
    const document = parseEnvDocument('KEY=  value with space  # guide\n');
    const entry = document.findEntry('KEY');

    expect(document.finalNewline).toBe(true);
    expect(entry).toMatchObject({
      value: 'value with space',
      rawValue: '  value with space  ',
    });
  });

  it('treats only export followed by whitespace as an export prefix', () => {
    const document = parseEnvDocument(
      ['export FOO=bar', 'export\tTOKEN=value', 'exportFOO=baz'].join('\n'),
    );

    expect(document.findEntry('FOO')).toMatchObject({
      key: 'FOO',
      value: 'bar',
      exportPrefix: 'export ',
    });
    expect(document.findEntry('TOKEN')).toMatchObject({
      key: 'TOKEN',
      value: 'value',
      exportPrefix: 'export\t',
    });
    expect(document.findEntry('exportFOO')).toMatchObject({
      key: 'exportFOO',
      value: 'baz',
      exportPrefix: undefined,
    });
  });

  it('preserves duplicate entries and exposes duplicate-aware lookup helpers', () => {
    const document = parseEnvDocument(['A=one', 'B=two', 'A=three'].join('\n'));

    expect(document.findEntry('A')?.value).toBe('one');
    expect(document.findEntries('A').map((entry) => entry.value)).toEqual(['one', 'three']);
    expect(document.keyIndex.A?.map((entry) => entry.lineRange.start)).toEqual([1, 3]);
    expect(Object.isFrozen(document.keyIndex)).toBe(true);
    expect(Object.isFrozen(document.keyIndex.A)).toBe(true);
  });

  it('does not accept backtick-quoted values as valid entries', () => {
    const document = parseEnvDocument('SECRET=`not supported`');

    expect(document.nodes).toEqual([
      expect.objectContaining({
        type: 'unknown',
        raw: 'SECRET=`not supported`',
        lineRange: { start: 1, end: 1 },
        diagnostic: expect.objectContaining({
          phase: 'parse',
          code: 'UnsupportedQuote',
          lineRange: { start: 1, end: 1 },
        }),
      }),
    ]);
    expect(document.diagnostics).toEqual([
      expect.objectContaining({
        phase: 'parse',
        code: 'UnsupportedQuote',
        lineRange: { start: 1, end: 1 },
      }),
    ]);
    expect(document.findEntry('SECRET')).toBeUndefined();
  });

  it('preserves unknown lines and whitespace-only separator lines in document order', () => {
    const document = parseEnvDocument(
      ['GOOD=value', 'not valid syntax', '\t  ', 'NEXT=value'].join('\n'),
    );

    expect(document.nodes).toEqual([
      expect.objectContaining({
        type: 'entry',
        raw: 'GOOD=value',
        lineRange: { start: 1, end: 1 },
      }),
      expect.objectContaining({
        type: 'unknown',
        raw: 'not valid syntax',
        lineRange: { start: 2, end: 2 },
        diagnostic: expect.objectContaining({
          phase: 'parse',
          code: 'UnknownLine',
        }),
      }),
      {
        type: 'blank',
        raw: '\t  ',
        lineRange: { start: 3, end: 3 },
      },
      expect.objectContaining({
        type: 'entry',
        raw: 'NEXT=value',
        lineRange: { start: 4, end: 4 },
      }),
    ]);
  });

  it('attaches stable parse diagnostics for invalid keys, invalid exports, and unterminated quotes', () => {
    const document = parseEnvDocument(
      ['BAD-KEY=value', 'export FOO', 'CERT="-----BEGIN-----', 'body'].join('\n'),
    );

    expect(document.nodes).toEqual([
      expect.objectContaining({
        type: 'unknown',
        raw: 'BAD-KEY=value',
        lineRange: { start: 1, end: 1 },
        diagnostic: expect.objectContaining({ code: 'InvalidKey' }),
      }),
      expect.objectContaining({
        type: 'unknown',
        raw: 'export FOO',
        lineRange: { start: 2, end: 2 },
        diagnostic: expect.objectContaining({ code: 'InvalidExport' }),
      }),
      expect.objectContaining({
        type: 'unknown',
        raw: 'CERT="-----BEGIN-----\nbody',
        lineRange: { start: 3, end: 4 },
        diagnostic: expect.objectContaining({ code: 'UnterminatedQuote' }),
      }),
    ]);
    expect(document.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'InvalidKey',
      'InvalidExport',
      'UnterminatedQuote',
    ]);
    expect(document.diagnostics.every((diagnostic) => !('columnRange' in diagnostic))).toBe(true);
  });

  it('keeps hash characters inside values unless they begin an inline comment', () => {
    const document = parseEnvDocument('URL=https://example.test/#fragment # guidance #varType:url');

    expect(document.findEntry('URL')).toMatchObject({
      value: 'https://example.test/#fragment',
      rawValue: 'https://example.test/#fragment ',
      inlineComment: {
        raw: '# guidance #varType:url',
        segments: [
          { raw: '# guidance ', text: 'guidance' },
          { raw: '#varType:url', text: 'varType:url' },
        ],
      },
    });
  });

  it('reports no line ending style for empty documents', () => {
    const document = parseEnvDocument('');

    expect(document.nodes).toEqual([]);
    expect(document.lineEnding).toBe('none');
    expect(document.finalNewline).toBe(false);
  });

  it('returns all generation blockers at once and throws a typed validation error', () => {
    const document = parseEnvDocument(['A=one\r', 'BAD-KEY=value', 'A=two'].join('\n'));
    const diagnostics = validateEnvDocumentForGeneration(document);

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'InvalidKey',
      'MixedLineEndings',
      'DuplicateKey',
    ]);
    expect(diagnostics.map((diagnostic) => diagnostic.phase)).toEqual([
      'parse',
      'generation',
      'generation',
    ]);

    expect(() => assertEnvDocumentValidForGeneration(document)).toThrow(EnvValidationError);

    try {
      assertEnvDocumentValidForGeneration(document);
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      expect((error as EnvValidationError).diagnostics).toEqual(diagnostics);
    }
  });

  it('renders example env content only after validation passes', () => {
    const document = parseEnvDocument(
      [
        '  # database #varType:secret',
        'DATABASE_URL = postgres://local # connection #owner:platform',
        '   ',
        'export API_KEY="secret value"',
        "PRIVATE_KEY='line one",
        "line two'",
      ].join('\n'),
    );

    expect(renderExampleEnvDocument(document)).toBe(
      [
        '  # database #varType:secret',
        'DATABASE_URL= # connection #owner:platform',
        '',
        'export API_KEY=',
        'PRIVATE_KEY=',
      ].join('\n'),
    );
  });

  it('preserves CRLF line endings and final newline presence while rendering', () => {
    const document = parseEnvDocument('A=one\r\nB=two # guide\r\n');

    expect(renderExampleEnvDocument(document)).toBe('A=\r\nB= # guide\r\n');
  });

  it('rejects invalid documents during rendering instead of exposing an unsafe renderer', () => {
    const document = parseEnvDocument(['A=one', 'A=two'].join('\n'));

    expect(() => renderExampleEnvDocument(document)).toThrow(EnvValidationError);
  });
});
