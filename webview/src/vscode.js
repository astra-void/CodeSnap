const API_KEY = '__codesnapVsCodeApi';

export const vscode =
  globalThis[API_KEY] || (globalThis[API_KEY] = acquireVsCodeApi());
