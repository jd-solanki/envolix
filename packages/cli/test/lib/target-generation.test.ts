import { describe, expect, it } from 'vite-plus/test';

import { parseEnvDocument } from '../../../env-parser/src/index';
import {
  TargetGenerationError,
  assertEnvDocumentValidForTargetGeneration,
  renderTargetEnvDocument,
  validateEnvDocumentForTargetGeneration,
} from '../../src/lib/target-generation';

describe('target generation', () => {
  it('returns all generation blockers at once and throws a typed validation error', () => {
    const document = parseEnvDocument(
      ['A=one\r', 'BAD-KEY=value', 'not valid syntax', 'A=two'].join('\n'),
    );
    const diagnostics = validateEnvDocumentForTargetGeneration(document);

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'InvalidKey',
      'UnknownLine',
      'MixedLineEndings',
      'DuplicateKey',
    ]);
    expect(diagnostics.map((diagnostic) => diagnostic.phase)).toEqual([
      'parse',
      'parse',
      'generation',
      'generation',
    ]);

    expect(() => assertEnvDocumentValidForTargetGeneration(document)).toThrow(
      TargetGenerationError,
    );

    try {
      assertEnvDocumentValidForTargetGeneration(document);
    } catch (error) {
      expect(error).toBeInstanceOf(TargetGenerationError);
      expect((error as TargetGenerationError).diagnostics).toEqual(diagnostics);
    }
  });

  it('rejects duplicates, unknown lines, and mixed line endings during generation validation', () => {
    const fixtures = [
      {
        name: 'duplicate keys',
        source: ['DUPLICATE=one', 'OTHER=two', 'DUPLICATE=three'].join('\n'),
        codes: ['DuplicateKey'],
      },
      {
        name: 'unknown line',
        source: ['GOOD=value', 'not valid syntax'].join('\n'),
        codes: ['UnknownLine'],
      },
      {
        name: 'mixed line endings',
        source: 'LF=one\nCRLF=two\r\n',
        codes: ['MixedLineEndings'],
      },
    ] as const;

    for (const fixture of fixtures) {
      const document = parseEnvDocument(fixture.source);

      expect(
        validateEnvDocumentForTargetGeneration(document).map((diagnostic) => diagnostic.code),
        fixture.name,
      ).toEqual(fixture.codes);
      expect(() => renderTargetEnvDocument(document), fixture.name).toThrow(TargetGenerationError);
    }
  });

  it('renders target env content only after validation passes', () => {
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

    expect(renderTargetEnvDocument(document)).toBe(
      [
        '  # database #varType:secret',
        'DATABASE_URL= # connection #owner:platform',
        '',
        'export API_KEY=',
        'PRIVATE_KEY=',
      ].join('\n'),
    );
  });

  it('renders fixture documents with generated target syntax normalization', () => {
    const fixtures = [
      {
        name: 'lf without final newline',
        source: [
          '# heading #varType:secret',
          'A = one',
          'B=two # human text #varType:secret',
          '   ',
          'export TOKEN="secret"',
          "PRIVATE_KEY='line one",
          "line two'",
        ].join('\n'),
        expected: [
          '# heading #varType:secret',
          'A=',
          'B= # human text #varType:secret',
          '',
          'export TOKEN=',
          'PRIVATE_KEY=',
        ].join('\n'),
      },
      {
        name: 'lf with final newline',
        source: ['A=one', 'B=two # guide', ''].join('\n'),
        expected: ['A=', 'B= # guide', ''].join('\n'),
      },
      {
        name: 'crlf with final newline',
        source: 'A=one\r\nB=two # guide\r\n',
        expected: 'A=\r\nB= # guide\r\n',
      },
    ] as const;

    for (const fixture of fixtures) {
      expect(renderTargetEnvDocument(parseEnvDocument(fixture.source)), fixture.name).toBe(
        fixture.expected,
      );
    }
  });

  it('preserves source order, comments, annotations, and blank lines without a generated banner', () => {
    const document = parseEnvDocument(
      [
        '  # database #varType:secret',
        'DATABASE_URL=postgres://local # connection #owner:platform',
        '',
        'API_KEY=secret',
        '# trailing section',
      ].join('\n'),
    );
    const rendered = renderTargetEnvDocument(document);

    expect(document.nodes.map((node) => (node.type === 'entry' ? node.key : node.type))).toEqual([
      'comment',
      'DATABASE_URL',
      'blank',
      'API_KEY',
      'comment',
    ]);
    expect(rendered).toBe(
      [
        '  # database #varType:secret',
        'DATABASE_URL= # connection #owner:platform',
        '',
        'API_KEY=',
        '# trailing section',
      ].join('\n'),
    );
    expect(rendered.startsWith('# Generated')).toBe(false);
    expect(rendered.startsWith('# This file')).toBe(false);
  });

  it('preserves CRLF line endings and final newline presence while rendering', () => {
    const document = parseEnvDocument('A=one\r\nB=two # guide\r\n');

    expect(renderTargetEnvDocument(document)).toBe('A=\r\nB= # guide\r\n');
  });

  it('splices preserved values while keeping all structure and annotations from the source', () => {
    const document = parseEnvDocument(
      [
        'DEV_URL=internal # varType:plain',
        'API_KEY=secret # varType:secret',
        'UNTOUCHED=value',
      ].join('\n'),
    );

    const rendered = renderTargetEnvDocument(document, {
      preservedValues: new Map([['DEV_URL', 'http://localhost:3000']]),
    });

    expect(rendered).toBe(
      [
        'DEV_URL=http://localhost:3000 # varType:plain',
        'API_KEY= # varType:secret',
        'UNTOUCHED=',
      ].join('\n'),
    );
  });

  it('rejects invalid documents during rendering instead of exposing an unsafe renderer', () => {
    const document = parseEnvDocument(['A=one', 'A=two'].join('\n'));

    expect(() => renderTargetEnvDocument(document)).toThrow(TargetGenerationError);
  });
});
