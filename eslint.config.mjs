import { browserGlobals, mochaGlobals, nodeGlobals } from './eslint-globals.mjs';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

const typeScriptRules = {
  ...tsPlugin.configs.recommended.rules
};

export default [
  {
    ignores: ['dist/**', 'node_modules/**', '*.vsix']
  },
  {
    files: ['**/*.mjs'],

    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...nodeGlobals
      }
    }
  },
  {
    files: ['**/*.ts', '**/*.d.ts'],

    plugins: {
      '@typescript-eslint': tsPlugin
    },

    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module'
    },

    rules: typeScriptRules
  },
  {
    files: ['src/**/*.ts', 'types/**/*.d.ts'],

    languageOptions: {
      globals: {
        ...nodeGlobals
      }
    }
  },
  {
    files: ['webview/src/**/*.ts'],

    languageOptions: {
      globals: {
        ...browserGlobals,
        acquireVsCodeApi: 'readonly',
        domtoimage: 'readonly'
      }
    }
  },
  {
    files: ['test/**/*.ts'],

    languageOptions: {
      globals: {
        ...mochaGlobals,
        ...nodeGlobals
      }
    }
  }
];
