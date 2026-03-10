import { strict as assert } from 'node:assert';

const { buildWebviewHtml } = require('../src/webview-html') as {
  buildWebviewHtml: (options: {
    cspSource: string;
    nonce: string;
    styleUri: string;
    domToImageUri: string;
    scriptUri: string;
  }) => string;
};

describe('webview-html', () => {
  it('allows nonce-based bootstrap and webview module imports in the CSP', () => {
    const html = buildWebviewHtml({
      cspSource: 'vscode-webview://test',
      nonce: 'abc123',
      styleUri: 'style-uri',
      domToImageUri: 'dom-uri',
      scriptUri: 'script-uri'
    });

    assert.match(html, /script-src 'nonce-abc123' vscode-webview:\/\/test;/);
    assert.match(html, /style-src 'unsafe-inline' vscode-webview:\/\/test;/);
    assert.match(html, /whenDomReady/);
    assert.match(html, /import\("script-uri"\)/);
    assert.match(html, /clipboard-paste-target/);
  });
});
