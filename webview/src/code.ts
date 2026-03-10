import type {
  ClipboardPayload,
  CodeSnapConfig,
  RenderLine,
  RenderToken
} from '../../types/contracts';

import { $, calcTextWidth, setVar } from './util.js';

const snippetNode = $<HTMLElement>('#snippet');
const pasteTargetNode = $<HTMLElement>('#clipboard-paste-target');

const applyTokenStyle = (node: HTMLSpanElement, token: RenderToken): void => {
  if (token.color) node.style.color = token.color;
  if (!token.fontStyle) return;

  if (token.fontStyle.includes('italic')) node.style.fontStyle = 'italic';
  if (token.fontStyle.includes('bold')) node.style.fontWeight = 'bold';

  const textDecorations: string[] = [];
  if (token.fontStyle.includes('underline')) textDecorations.push('underline');
  if (token.fontStyle.includes('strikethrough')) textDecorations.push('line-through');
  if (textDecorations.length) node.style.textDecoration = textDecorations.join(' ');
};

const createTokenLineNode = (config: CodeSnapConfig, line: RenderLine): HTMLDivElement => {
  const lineNode = document.createElement('div');
  lineNode.classList.add('line');

  if (config.showLineNumbers) {
    const lineNumberNode = document.createElement('div');
    lineNumberNode.classList.add('line-number');
    lineNumberNode.textContent = String(line.lineNumber);
    lineNode.appendChild(lineNumberNode);
  }

  const lineCodeNode = document.createElement('div');
  lineCodeNode.classList.add('line-code');

  if (!line.spans.length || line.spans.every((token) => token.text.length === 0)) {
    const tokenNode = document.createElement('span');
    tokenNode.textContent = ' ';
    lineCodeNode.appendChild(tokenNode);
  } else {
    line.spans.forEach((token) => {
      const tokenNode = document.createElement('span');
      tokenNode.textContent = token.text;
      applyTokenStyle(tokenNode, token);
      lineCodeNode.appendChild(tokenNode);
    });
  }

  lineNode.appendChild(lineCodeNode);
  return lineNode;
};

const setupLines = (node: HTMLElement, config: CodeSnapConfig): void => {
  Array.from(node.querySelectorAll(':scope > br')).forEach((row) => {
    row.outerHTML = '<div>&nbsp;</div>';
  });

  const rows = Array.from(node.querySelectorAll<HTMLElement>(':scope > div'));
  setVar('line-number-width', calcTextWidth(rows.length + config.startLine));

  rows.forEach((row, idx) => {
    const newRow = document.createElement('div');
    newRow.classList.add('line');
    row.replaceWith(newRow);

    if (config.showLineNumbers) {
      const lineNum = document.createElement('div');
      lineNum.classList.add('line-number');
      lineNum.textContent = String(idx + 1 + config.startLine);
      newRow.appendChild(lineNum);
    }

    const lineCodeDiv = document.createElement('div');
    lineCodeDiv.classList.add('line-code');

    if (!row.innerHTML.trim()) {
      const span = document.createElement('span');
      span.textContent = ' ';
      lineCodeDiv.appendChild(span);
    } else {
      const lineCode = document.createElement('span');
      lineCode.innerHTML = row.innerHTML;
      lineCodeDiv.appendChild(lineCode);
    }

    newRow.appendChild(lineCodeDiv);
  });
};

const stripInitialIndent = (node: HTMLElement): void => {
  const regIndent = /^\s+/u;
  const initialSpans = Array.from(
    node.querySelectorAll<HTMLSpanElement>(':scope > div > span:first-child')
  );
  if (!initialSpans.length) return;

  const matches = initialSpans.map((span) => (span.textContent ?? '').match(regIndent));
  if (matches.some((match) => !match)) return;

  const minIndent = Math.min(...matches.map((match) => match![0].length));
  initialSpans.forEach((span) => {
    span.textContent = (span.textContent ?? '').slice(minIndent);
  });
};

const escapePlainText = (text: string): string => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

const getClipboardHtml = ({ html, text }: ClipboardPayload): string => {
  if (html) return html;

  const code = text
    .split('\n')
    .map((line) => `<div>${escapePlainText(line)}</div>`)
    .join('');
  return `<div>${code}</div>`;
};

const parseClipboardHtml = (clipboardPayload: ClipboardPayload): HTMLElement => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(getClipboardHtml(clipboardPayload), 'text/html');
  return doc.body.querySelector('div') ?? doc.body;
};

const normalizeText = (text: string): string => text.replace(/\r\n?/gu, '\n');

const readClipboardFromNavigator = async (): Promise<ClipboardPayload | null> => {
  if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') return null;

  const items = await navigator.clipboard.read();
  let html = '';
  let text = '';

  for (const item of items) {
    if (!html && item.types.includes('text/html')) {
      html = await (await item.getType('text/html')).text();
    }

    if (!text && item.types.includes('text/plain')) {
      text = await (await item.getType('text/plain')).text();
    }
  }

  if (!html && navigator.clipboard.readText) {
    text = text || (await navigator.clipboard.readText());
  }

  return html || text ? { html, text } : null;
};

const readClipboardFromLegacyPaste = (): Promise<ClipboardPayload> =>
  new Promise((resolve, reject) => {
    if (!document.queryCommandSupported || !document.queryCommandSupported('paste')) {
      reject(new Error('Clipboard paste is not supported in this webview.'));
      return;
    }

    let timeoutId = 0;
    const cleanup = () => {
      document.removeEventListener('paste', onPaste, true);
      window.clearTimeout(timeoutId);
      pasteTargetNode.blur();
      pasteTargetNode.textContent = '';
    };

    const onPaste = (event: ClipboardEvent) => {
      cleanup();
      resolve({
        html: event.clipboardData?.getData('text/html') ?? '',
        text: event.clipboardData?.getData('text/plain') ?? ''
      });
    };

    document.addEventListener('paste', onPaste, true);
    timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error('Clipboard paste timed out.'));
    }, 250);

    pasteTargetNode.textContent = '';
    pasteTargetNode.focus();

    if (!document.execCommand('paste')) {
      cleanup();
      reject(new Error('Clipboard paste was blocked.'));
    }
  });

export const readClipboardCode = async (expectedText: string): Promise<ClipboardPayload> => {
  const expected = normalizeText(expectedText);

  for (let attempt = 0; attempt < 3; attempt++) {
    const payload =
      (await readClipboardFromNavigator().catch(() => null)) ||
      (await readClipboardFromLegacyPaste().catch(() => null));

    if (!payload) continue;

    if (!expected || !payload.text || normalizeText(payload.text) === expected) {
      return payload;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 25));
  }

  throw new Error('Failed to read the latest syntax-highlighted clipboard preview.');
};

export const renderClipboardCode = (
  config: CodeSnapConfig,
  clipboardPayload: ClipboardPayload
): number => {
  const code = parseClipboardHtml(clipboardPayload);

  snippetNode.style.fontSize = code.style.fontSize || '';
  snippetNode.style.lineHeight = code.style.lineHeight || '';
  snippetNode.style.fontFamily = code.style.fontFamily || '';
  snippetNode.style.fontWeight = code.style.fontWeight || '';

  snippetNode.innerHTML = code.innerHTML;
  stripInitialIndent(snippetNode);
  setupLines(snippetNode, config);
  return snippetNode.querySelectorAll('.line').length;
};

export const renderCode = (config: CodeSnapConfig, lines: readonly RenderLine[]): number => {
  snippetNode.style.fontSize = '';
  snippetNode.style.lineHeight = '';
  snippetNode.style.fontFamily = '';
  snippetNode.style.fontWeight = '';
  setVar('line-number-width', calcTextWidth(lines.length + config.startLine));

  const fragment = document.createDocumentFragment();
  lines.forEach((line) => fragment.appendChild(createTokenLineNode(config, line)));
  snippetNode.replaceChildren(fragment);
  return snippetNode.querySelectorAll('.line').length;
};
