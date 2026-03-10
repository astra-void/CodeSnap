'use strict';

const vscode = require('vscode');
const { buildWebviewHtml } = require('./webview-html');

const getSettings = (group, keys, editor = vscode.window.activeTextEditor) => {
  const settings = vscode.workspace.getConfiguration(group, null);
  const language = editor && editor.document && editor.document.languageId;
  const languageSettings =
    language && vscode.workspace.getConfiguration(null, null).get(`[${language}]`);
  return keys.reduce((acc, k) => {
    acc[k] = languageSettings && languageSettings[`${group}.${k}`];
    if (acc[k] == null) acc[k] = settings.get(k);
    return acc;
  }, {});
};

const getNonce = () =>
  Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

const getUri = (webview, extensionUri, ...pathSegments) =>
  webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...pathSegments));

const getWebviewHtml = (webview, extensionUri) => {
  const nonce = getNonce();
  const styleUri = getUri(webview, extensionUri, 'webview', 'style.css');
  const domToImageUri = getUri(
    webview,
    extensionUri,
    'node_modules',
    'dom-to-image-even-more',
    'dist',
    'dom-to-image-more.min.js'
  );
  const scriptUri = getUri(webview, extensionUri, 'webview', 'src', 'index.js');

  return buildWebviewHtml({
    cspSource: webview.cspSource,
    nonce,
    styleUri,
    domToImageUri,
    scriptUri
  });
};

module.exports = { getSettings, getWebviewHtml };
