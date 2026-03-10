'use strict';

const assert = require('assert').strict;
const { mergeRawThemes, toRawTheme } = require('../src/theme-loader');

describe('theme-loader', () => {
  it('normalizes TextMate settings themes', () => {
    assert.deepStrictEqual(
      toRawTheme({
        name: 'Base',
        settings: [{ settings: { foreground: '#ffffff' } }]
      }),
      {
        name: 'Base',
        settings: [{ settings: { foreground: '#ffffff' } }]
      }
    );
  });

  it('normalizes VS Code tokenColors themes', () => {
    assert.deepStrictEqual(
      toRawTheme({
        name: 'Derived',
        tokenColors: [{ scope: 'keyword', settings: { foreground: '#ff00ff' } }]
      }),
      {
        name: 'Derived',
        settings: [{ scope: 'keyword', settings: { foreground: '#ff00ff' } }]
      }
    );
  });

  it('merges theme settings in order and keeps the latest name', () => {
    assert.deepStrictEqual(
      mergeRawThemes(
        { name: 'Base', settings: [{ scope: 'one', settings: { foreground: '#111111' } }] },
        { settings: [{ scope: 'two', settings: { foreground: '#222222' } }] },
        { name: 'Final', settings: [{ scope: 'three', settings: { foreground: '#333333' } }] }
      ),
      {
        name: 'Final',
        settings: [
          { scope: 'one', settings: { foreground: '#111111' } },
          { scope: 'two', settings: { foreground: '#222222' } },
          { scope: 'three', settings: { foreground: '#333333' } }
        ]
      }
    );
  });
});
