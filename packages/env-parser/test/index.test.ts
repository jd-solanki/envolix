import { describe, expect, it } from 'vite-plus/test';

import { packageName, parseEnvDocument } from '../src/index.js';

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
    const document = parseEnvDocument(['export FOO=bar', 'exportFOO=baz'].join('\n'));

    expect(document.findEntry('FOO')).toMatchObject({
      key: 'FOO',
      value: 'bar',
      exportPrefix: 'export ',
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
      {
        type: 'unknown',
        raw: 'SECRET=`not supported`',
        lineRange: { start: 1, end: 1 },
      },
    ]);
    expect(document.findEntry('SECRET')).toBeUndefined();
  });
});
