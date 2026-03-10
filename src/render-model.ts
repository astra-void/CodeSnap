import type { RenderLine, RenderToken } from '../types/contracts';

const FONT_STYLE_MASK = 0x7800;
const FONT_STYLE_OFFSET = 11;
const FOREGROUND_MASK = 0xff8000;
const FOREGROUND_OFFSET = 15;

export const splitLines = (text: string): string[] => text.split(/\r\n|\r|\n/u);

export const stripCommonIndent = (lines: readonly string[]): string[] => {
  const indents: number[] = [];

  for (const line of lines) {
    if (line.length === 0) continue;
    const match = line.match(/^[\t ]+/u);
    if (!match) return [...lines];
    indents.push(match[0].length);
  }

  if (!indents.length) return [...lines];

  const minIndent = Math.min(...indents);
  return lines.map((line) => (line.length === 0 ? line : line.slice(minIndent)));
};

const toFontStyle = (metadata: number): string => {
  const fontStyle = (metadata & FONT_STYLE_MASK) >>> FONT_STYLE_OFFSET;
  const styles: string[] = [];

  if (fontStyle & 1) styles.push('italic');
  if (fontStyle & 2) styles.push('bold');
  if (fontStyle & 4) styles.push('underline');
  if (fontStyle & 8) styles.push('strikethrough');

  return styles.join(' ');
};

const toForeground = (metadata: number, colorMap: readonly string[]): string | null => {
  const foregroundId = (metadata & FOREGROUND_MASK) >>> FOREGROUND_OFFSET;
  return colorMap[foregroundId] ?? null;
};

const mergeSpans = (spans: ReadonlyArray<RenderToken>): RenderToken[] => {
  if (!spans.length) return [{ text: '', color: null, fontStyle: '' }];

  return spans.reduce<RenderToken[]>((merged, span) => {
    const previous = merged[merged.length - 1];
    if (previous && previous.color === span.color && previous.fontStyle === span.fontStyle) {
      previous.text += span.text;
      return merged;
    }

    merged.push({ ...span });
    return merged;
  }, []);
};

export const buildTokenizedLine = (
  lineText: string,
  tokens: ArrayLike<number>,
  colorMap: readonly string[],
  lineNumber: number
): RenderLine => {
  const spans: RenderToken[] = [];

  for (let i = 0; i < tokens.length; i += 2) {
    const startIndex = tokens[i];
    const metadata = tokens[i + 1];

    if (typeof startIndex !== 'number' || typeof metadata !== 'number') continue;

    const nextToken = tokens[i + 2];
    const endIndex = typeof nextToken === 'number' ? nextToken : lineText.length;
    const text = lineText.slice(startIndex, endIndex);

    if (!text && lineText.length > 0) continue;

    spans.push({
      text,
      color: toForeground(metadata, colorMap),
      fontStyle: toFontStyle(metadata)
    });
  }

  return {
    lineNumber,
    spans: mergeSpans(spans)
  };
};

const buildPlainLine = (lineText: string, lineNumber: number): RenderLine => ({
  lineNumber,
  spans: [{ text: lineText, color: null, fontStyle: '' }]
});

export const buildPlainLines = (lines: readonly string[], startLine = 0): RenderLine[] =>
  lines.map((lineText, index) => buildPlainLine(lineText, startLine + index + 1));
