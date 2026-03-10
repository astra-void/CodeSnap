'use strict';

const assert = require('assert').strict;
const {
  createRenderPayload,
  createRenderStatus
} = require('../src/render-payload');

describe('render-payload', () => {
  it('marks empty render payloads as capture-unavailable errors', () => {
    const payload = createRenderPayload({
      config: { startLine: 0 },
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
