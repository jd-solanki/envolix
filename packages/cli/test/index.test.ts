import { describe, expect, it } from 'vite-plus/test';

import { packageName } from '../src/index.js';

describe('@envolix/cli', () => {
  it('exposes the package boundary', () => {
    expect(packageName).toBe('@envolix/cli');
  });
});
