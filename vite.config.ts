import { defineConfig } from 'vite-plus';

export default defineConfig({
  fmt: {
    ignorePatterns: ['.ai/**', 'coverage/**', 'dist/**'],
    semi: true,
    singleQuote: true,
    sortPackageJson: true,
  },
  lint: {
    ignorePatterns: ['.ai/**', 'coverage/**', 'dist/**'],
    plugins: ['typescript'],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    overrides: [
      {
        files: ['**/*.test.ts'],
        plugins: ['typescript', 'vitest'],
      },
    ],
  },
  pack: {
    clean: true,
    dts: true,
    entry: ['src/index.ts'],
    format: ['esm'],
    sourcemap: true,
  },
  run: {
    cache: {
      scripts: true,
      tasks: true,
    },
  },
  staged: {
    '*.{json,md,ts,yml,yaml}': 'vp check --fix',
  },
  test: {
    include: ['packages/*/test/**/*.test.ts'],
  },
});
