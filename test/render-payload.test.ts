import { strict as assert } from 'node:assert';

import type { CodeSnapConfig } from '../types/contracts';

const { createRenderPayload, createRenderStatus } = require('../src/render-payload') as {
  createRenderPayload: (options: {
    config: CodeSnapConfig;
    windowTitle: string;
    startLine: number;
    lines: Array<{ lineNumber: number; spans: unknown[] }>;
  }) => { renderStatus: unknown };
  createRenderStatus: (
    lines: Array<{ lineNumber: number; spans: unknown[] }>,
    errorType: string
  ) => unknown;
};

const baseConfig: CodeSnapConfig = {
  backgroundColor: '#000000',
  boxShadow: 'none',
  containerPadding: '1rem',
  fontLigatures: false,
  realLineNumbers: false,
  roundedCorners: true,
  showLineNumbers: true,
  showWindowControls: true,
  showWindowTitle: false,
  shutterAction: 'save',
  startLine: 0,
  tabSize: 2,
  target: 'container',
  transparentBackground: false,
  windowTitle: ''
};

describe('render-payload', () => {
  it('marks empty render payloads as capture-unavailable errors', () => {
    const payload = createRenderPayload({
      config: baseConfig,
      windowTitle: '',
      startLine: 0,
      lines: []
    });

    assert.deepStrictEqual(payload.renderStatus, {
      kind: 'error',
      canCapture: false,
      errorType: 'empty',
      message: 'CodeSnap 📸: No code content was rendered.'
    });
  });

  it('marks fallback payloads as capturable warnings', () => {
    assert.deepStrictEqual(createRenderStatus([{ lineNumber: 1, spans: [] }], 'tokenizeFailed'), {
      kind: 'fallback',
      canCapture: true,
      errorType: 'tokenizeFailed',
      message: 'CodeSnap 📸: Syntax highlighting failed. Showing plain text instead.'
    });
  });
});
