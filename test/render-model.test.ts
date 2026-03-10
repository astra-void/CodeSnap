import { strict as assert } from 'node:assert';

const { buildPlainLines, buildTokenizedLine, splitLines, stripCommonIndent } =
  require('../src/render-model') as {
    buildPlainLines: (
      lines: readonly string[],
      startLine?: number
    ) => Array<{ lineNumber: number }>;
    buildTokenizedLine: (
      lineText: string,
      tokens: ArrayLike<number>,
      colorMap: readonly string[],
      lineNumber: number
    ) => {
      lineNumber: number;
      spans: Array<{ text: string; color: string | null; fontStyle: string }>;
    };
    splitLines: (text: string) => string[];
    stripCommonIndent: (lines: readonly string[]) => string[];
  };

describe('render-model', () => {
  it('splits selections into lines and preserves trailing blanks', () => {
    assert.deepStrictEqual(splitLines('one\r\ntwo\n'), ['one', 'two', '']);
  });

  it('strips shared indentation from non-empty lines', () => {
    assert.deepStrictEqual(stripCommonIndent(['    alpha', '      beta', '']), [
      'alpha',
      '  beta',
      ''
    ]);
  });

  it('keeps indentation when any non-empty line is flush-left', () => {
    assert.deepStrictEqual(stripCommonIndent(['alpha', '  beta']), ['alpha', '  beta']);
  });

  it('builds plain lines with the configured starting line', () => {
    assert.deepStrictEqual(
      buildPlainLines(['alpha', 'beta'], 9).map((line: { lineNumber: number }) => line.lineNumber),
      [10, 11]
    );
  });

  it('decodes token metadata and merges adjacent spans with the same style', () => {
    const italicBold = 3 << 11;
    const underline = 4 << 11;
    const green = 2 << 15;
    const blue = 3 << 15;
    const tokens = Uint32Array.from([
      0,
      italicBold | green,
      2,
      italicBold | green,
      4,
      underline | blue
    ]);

    assert.deepStrictEqual(
      buildTokenizedLine('abcdef', tokens, ['', '', '#00ff00', '#0000ff'], 4),
      {
        lineNumber: 4,
        spans: [
          { text: 'abcd', color: '#00ff00', fontStyle: 'italic bold' },
          { text: 'ef', color: '#0000ff', fontStyle: 'underline' }
        ]
      }
    );
  });
});
