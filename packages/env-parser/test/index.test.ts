import { describe, expect, it } from 'vite-plus/test';

import { packageName } from '../src/index.js';

describe('@envolix/env-parser', () => {
  it('exposes the package boundary', () => {
    expect(packageName).toBe('@envolix/env-parser');
  });
});
