import { defineConfig, Plugin } from 'vitest/config';
import * as path from 'path';

/**
 * Vitest plugin to handle .hbs file imports the same way webpack's file-loader does:
 * return the file path as the default export.
 */
function hbsPlugin(): Plugin {
  return {
    name: 'hbs-loader',
    transform(_code: string, id: string) {
      if (id.endsWith('.hbs')) {
        return {
          code: `export default ${JSON.stringify(path.basename(id))};`,
          map: null,
        };
      }
    },
  };
}

export default defineConfig({
  plugins: [hbsPlugin()],
  test: {
    root: path.resolve(__dirname),
    include: ['src/**/__test__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/__test__/**', 'src/templates/**', 'src/config.ts'],
      reporter: ['text', 'text-summary'],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
    alias: {
      vscode: path.resolve(__dirname, 'src/__test__/__mocks__/vscode.ts'),
    },
  },
});
