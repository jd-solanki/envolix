import { describe, expect, it } from 'vite-plus/test';

import { parseEnvDocument } from '../../../env-parser/src/index';
import { resolveValuePreservation } from '../../src/lib/value-preservation';

describe('value preservation', () => {
  it('preserves a plain-annotated value the user filled into the existing target', () => {
    const source = parseEnvDocument('DEV_URL=internal # varType:plain');
    const target = parseEnvDocument('DEV_URL=http://localhost:3000');

    const { values, warnings } = resolveValuePreservation(source, target);

    expect(values.get('DEV_URL')).toBe('http://localhost:3000');
    expect(warnings).toEqual([]);
  });

  it('never preserves secret or unannotated source keys, even with a target value present', () => {
    const source = parseEnvDocument(
      ['API_KEY=real # varType:secret', 'PLAIN_LOOKING=real'].join('\n'),
    );
    const target = parseEnvDocument(['API_KEY=leaked', 'PLAIN_LOOKING=filled'].join('\n'));

    const { values, warnings } = resolveValuePreservation(source, target);

    expect(values.size).toBe(0);
    expect(warnings).toEqual([]);
  });

  it('skips keys absent from the target or blank in the target', () => {
    const source = parseEnvDocument(
      [
        'NEW_KEY=x # varType:plain',
        'EMPTY=x # varType:plain',
        'QUOTED_EMPTY=x # varType:plain',
      ].join('\n'),
    );
    const target = parseEnvDocument(['EMPTY=', 'QUOTED_EMPTY=""'].join('\n'));

    const { values, warnings } = resolveValuePreservation(source, target);

    expect(values.size).toBe(0);
    expect(warnings).toEqual([]);
  });

  it('keeps the author quote style verbatim and drops only assignment whitespace', () => {
    const source = parseEnvDocument(
      ['SPACED=x # varType:plain', 'DOUBLE=x # varType:plain', 'SINGLE=x # varType:plain'].join(
        '\n',
      ),
    );
    const target = parseEnvDocument(
      ['SPACED =  bare value  ', 'DOUBLE="has #hash and spaces"', "SINGLE='single'"].join('\n'),
    );

    const { values } = resolveValuePreservation(source, target);

    expect(values.get('SPACED')).toBe('bare value');
    expect(values.get('DOUBLE')).toBe('"has #hash and spaces"');
    expect(values.get('SINGLE')).toBe("'single'");
  });

  it('warns and skips a plain key that is duplicated in the existing target', () => {
    const source = parseEnvDocument('API_URL=x # varType:plain');
    const target = parseEnvDocument(['API_URL=one', 'API_URL=two'].join('\n'));

    const { values, warnings } = resolveValuePreservation(source, target);

    expect(values.has('API_URL')).toBe(false);
    expect(warnings).toEqual([
      'Skipped preserving "API_URL": it appears more than once in the existing target env file.',
    ]);
  });
});
