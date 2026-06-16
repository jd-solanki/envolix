import { describe, expect, it } from 'vite-plus/test';

import * as parserExports from '../src/index';
import { packageName, parseEnvDocument } from '../src/index';

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

  it('parses valid Node-compatible entry fixtures through the public API', () => {
    const document = parseEnvDocument(
      [
        'EMPTY=',
        'LOWER_CASE=value',
        '_LEADING_UNDERSCORE=ok',
        'NUMBER_2=two',
        'SPACED = trimmed value   ',
        "SINGLE='quoted value'",
        'DOUBLE="quoted value"',
        'URL=https://example.test/#fragment',
      ].join('\n'),
    );

    expect(document.diagnostics).toEqual([]);
    expect(
      document.nodes.map((node) =>
        node.type === 'entry'
          ? {
              key: node.key,
              value: node.value,
              rawValue: node.rawValue,
              quoteStyle: node.quoteStyle,
              lineRange: node.lineRange,
            }
          : node.type,
      ),
    ).toEqual([
      {
        key: 'EMPTY',
        value: '',
        rawValue: '',
        quoteStyle: 'none',
        lineRange: { start: 1, end: 1 },
      },
      {
        key: 'LOWER_CASE',
        value: 'value',
        rawValue: 'value',
        quoteStyle: 'none',
        lineRange: { start: 2, end: 2 },
      },
      {
        key: '_LEADING_UNDERSCORE',
        value: 'ok',
        rawValue: 'ok',
        quoteStyle: 'none',
        lineRange: { start: 3, end: 3 },
      },
      {
        key: 'NUMBER_2',
        value: 'two',
        rawValue: 'two',
        quoteStyle: 'none',
        lineRange: { start: 4, end: 4 },
      },
      {
        key: 'SPACED',
        value: 'trimmed value',
        rawValue: ' trimmed value   ',
        quoteStyle: 'none',
        lineRange: { start: 5, end: 5 },
      },
      {
        key: 'SINGLE',
        value: 'quoted value',
        rawValue: "'quoted value'",
        quoteStyle: 'single',
        lineRange: { start: 6, end: 6 },
      },
      {
        key: 'DOUBLE',
        value: 'quoted value',
        rawValue: '"quoted value"',
        quoteStyle: 'double',
        lineRange: { start: 7, end: 7 },
      },
      {
        key: 'URL',
        value: 'https://example.test/#fragment',
        rawValue: 'https://example.test/#fragment',
        quoteStyle: 'none',
        lineRange: { start: 8, end: 8 },
      },
    ]);
  });

  it('rejects trailing tokens after quoted values while preserving valid inline comments', () => {
    const document = parseEnvDocument(
      ['DOUBLE="value" junk', "SINGLE='value' junk", 'VALID="value" # guidance'].join('\n'),
    );

    expect(document.nodes).toEqual([
      expect.objectContaining({
        type: 'unknown',
        raw: 'DOUBLE="value" junk',
        lineRange: { start: 1, end: 1 },
        diagnostic: expect.objectContaining({
          phase: 'parse',
          code: 'UnknownLine',
          lineRange: { start: 1, end: 1 },
        }),
      }),
      expect.objectContaining({
        type: 'unknown',
        raw: "SINGLE='value' junk",
        lineRange: { start: 2, end: 2 },
        diagnostic: expect.objectContaining({
          phase: 'parse',
          code: 'UnknownLine',
          lineRange: { start: 2, end: 2 },
        }),
      }),
      expect.objectContaining({
        type: 'entry',
        raw: 'VALID="value" # guidance',
        key: 'VALID',
        value: 'value',
        rawValue: '"value"',
        quoteStyle: 'double',
        inlineComment: {
          raw: '# guidance',
          segments: [{ raw: '# guidance', text: 'guidance' }],
        },
      }),
    ]);
    expect(document.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'UnknownLine',
      'UnknownLine',
    ]);
  });

  it('treats only export followed by whitespace as an export prefix', () => {
    const document = parseEnvDocument(
      ['export FOO=bar', 'export\tTOKEN=value', 'exportFOO=baz', 'export FOO'].join('\n'),
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
    expect(document.nodes[3]).toMatchObject({
      type: 'unknown',
      raw: 'export FOO',
      diagnostic: expect.objectContaining({ code: 'InvalidExport' }),
    });
  });

  it('preserves duplicate entries and exposes duplicate-aware lookup helpers', () => {
    const document = parseEnvDocument(['A=one', 'B=two', 'A=three'].join('\n'));

    expect(document.findEntry('A')?.value).toBe('one');
    expect(document.findEntries('A').map((entry) => entry.value)).toEqual(['one', 'three']);
    expect(document.keyIndex.A?.map((entry) => entry.lineRange.start)).toEqual([1, 3]);
    expect(document.findEntry('MISSING')).toBeUndefined();
    expect(document.findEntries('MISSING')).toEqual([]);
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

  it('reports each settled parse diagnostic fixture with stable codes', () => {
    const fixtures = [
      {
        name: 'invalid key',
        source: 'BAD-KEY=value',
        code: 'InvalidKey',
        raw: 'BAD-KEY=value',
        lineRange: { start: 1, end: 1 },
      },
      {
        name: 'unsupported quote',
        source: 'SECRET=`not supported`',
        code: 'UnsupportedQuote',
        raw: 'SECRET=`not supported`',
        lineRange: { start: 1, end: 1 },
      },
      {
        name: 'unterminated quote',
        source: ['CERT="-----BEGIN-----', 'body'].join('\n'),
        code: 'UnterminatedQuote',
        raw: 'CERT="-----BEGIN-----\nbody',
        lineRange: { start: 1, end: 2 },
      },
      {
        name: 'invalid export assignment',
        source: 'export BAD-KEY=value',
        code: 'InvalidExport',
        raw: 'export BAD-KEY=value',
        lineRange: { start: 1, end: 1 },
      },
      {
        name: 'assignment-free export',
        source: 'export FOO',
        code: 'InvalidExport',
        raw: 'export FOO',
        lineRange: { start: 1, end: 1 },
      },
      {
        name: 'unknown line',
        source: 'not valid syntax',
        code: 'UnknownLine',
        raw: 'not valid syntax',
        lineRange: { start: 1, end: 1 },
      },
    ] as const;

    for (const fixture of fixtures) {
      const document = parseEnvDocument(fixture.source);

      expect(document.nodes, fixture.name).toEqual([
        expect.objectContaining({
          type: 'unknown',
          raw: fixture.raw,
          lineRange: fixture.lineRange,
          diagnostic: expect.objectContaining({
            phase: 'parse',
            code: fixture.code,
            lineRange: fixture.lineRange,
          }),
        }),
      ]);
      expect(document.diagnostics, fixture.name).toEqual([
        expect.objectContaining({
          phase: 'parse',
          code: fixture.code,
          lineRange: fixture.lineRange,
        }),
      ]);
    }
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

  it('does not expose target generation helpers from the parser package', () => {
    expect(Object.keys(parserExports)).not.toContain('validateEnvDocumentForGeneration');
    expect(Object.keys(parserExports)).not.toContain('assertEnvDocumentValidForGeneration');
    expect(Object.keys(parserExports)).not.toContain('renderExampleEnvDocument');
    expect(Object.keys(parserExports)).not.toContain('EnvValidationError');
    expect(Object.keys(parserExports)).not.toContain('renderUnsafeExampleEnvDocument');
    expect(Object.keys(parserExports)).not.toContain('unsafeRenderExampleEnvDocument');
  });
});
