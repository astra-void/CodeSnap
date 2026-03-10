'use strict';

const assert = require('assert').strict;
const path = require('path');
const { pathToFileURL } = require('url');

describe('render-state', () => {
  it('turns zero rendered lines into an error placeholder state', async () => {
    const renderState = await import(
      pathToFileURL(path.resolve(__dirname, '../webview/src/render-state.mjs')).href
    );

    assert.deepStrictEqual(
      renderState.resolveRenderState(
        {
          kind: 'ready',
          canCapture: true,
          errorType: null,
          message: ''
        },
        0
      ),
      {
        kind: 'error',
        canCapture: false,
        errorType: 'captureUnavailable',
        message: 'CodeSnap 📸: No code content was rendered.'
      }
    );
  });
});
