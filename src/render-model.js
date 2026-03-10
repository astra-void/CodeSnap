'use strict';

const FONT_STYLE_MASK = 0x7800;
const FONT_STYLE_OFFSET = 11;
const FOREGROUND_MASK = 0xff8000;
const FOREGROUND_OFFSET = 15;

const splitLines = (text) => text.split(/\r\n|\r|\n/u);

const stripCommonIndent = (lines) => {
  const indents = [];

  for (const line of lines) {
    if (line.length === 0) continue;
    const match = line.match(/^[\t ]+/u);
    if (!match) return lines.slice();
    indents.push(match[0].length);
  }

  if (!indents.length) return lines.slice();

  const minIndent = Math.min(...indents);
  return lines.map((line) => (line.length === 0 ? line : line.slice(minIndent)));
};

const toFontStyle = (metadata) => {
  const fontStyle = (metadata & FONT_STYLE_MASK) >>> FONT_STYLE_OFFSET;
  const styles = [];

  if (fontStyle & 1) styles.push('italic');
  if (fontStyle & 2) styles.push('bold');
  if (fontStyle & 4) styles.push('underline');
  if (fontStyle & 8) styles.push('strikethrough');

  return styles.join(' ');
};

const toForeground = (metadata, colorMap) => {
  const foregroundId = (metadata & FOREGROUND_MASK) >>> FOREGROUND_OFFSET;
  return colorMap[foregroundId] || null;
};

const mergeSpans = (spans) => {
  if (!spans.length) return [{ text: '' }];

  return spans.reduce((merged, span) => {
    const previous = merged[merged.length - 1];
    if (previous && previous.color === span.color && previous.fontStyle === span.fontStyle) {
      previous.text += span.text;
      return merged;
    }

    merged.push({ ...span });
    return merged;
  }, []);
};

const buildTokenizedLine = (lineText, tokens, colorMap, lineNumber) => {
  const spans = [];

  for (let i = 0; i < tokens.length; i += 2) {
    const startIndex = tokens[i];
    const metadata = tokens[i + 1];
    const endIndex = i + 2 < tokens.length ? tokens[i + 2] : lineText.length;
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

const buildPlainLine = (lineText, lineNumber) => ({
  lineNumber,
  spans: [{ text: lineText, color: null, fontStyle: '' }]
});

const buildPlainLines = (lines, startLine = 0) =>
  lines.map((lineText, index) => buildPlainLine(lineText, startLine + index + 1));

module.exports = {
  buildPlainLines,
  buildTokenizedLine,
  splitLines,
  stripCommonIndent
};
