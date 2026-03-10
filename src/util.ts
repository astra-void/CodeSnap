import * as vscode from 'vscode';

import { buildWebviewHtml } from './webview-html';

type SettingValue = boolean | number | string;

export const getSettings = <T extends object, K extends readonly (keyof T & string)[]>(
  group: string,
  keys: K,
  editor: vscode.TextEditor | undefined = vscode.window.activeTextEditor
): Pick<T, K[number]> => {
  const settings = vscode.workspace.getConfiguration(group, null);
  const language = editor?.document.languageId;
  const languageSettings = language
    ? vscode.workspace
        .getConfiguration()
        .get<Record<string, SettingValue | undefined>>(`[${language}]`)
    : undefined;

  return keys.reduce<Pick<T, K[number]>>(
    (acc, key) => {
      const languageValue = languageSettings?.[`${group}.${key}`];
      const fallbackValue = settings.get<T[typeof key]>(key);
      acc[key] = (languageValue ?? fallbackValue) as Pick<T, K[number]>[typeof key];
      return acc;
    },
    {} as Pick<T, K[number]>
  );
};

const getNonce = (): string =>
  Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

const getUri = (
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  ...pathSegments: string[]
): vscode.Uri => webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...pathSegments));

export const getWebviewHtml = (webview: vscode.Webview, extensionUri: vscode.Uri): string => {
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
  const scriptUri = getUri(webview, extensionUri, 'dist', 'webview', 'src', 'index.js');

  return buildWebviewHtml({
    cspSource: webview.cspSource,
    nonce,
    styleUri,
    domToImageUri,
    scriptUri
  });
};
