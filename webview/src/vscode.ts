import type { VsCodeWebviewApi } from '../../types/contracts';

const API_KEY = '__codesnapVsCodeApi';

const globalApiStore = globalThis as typeof globalThis &
  Record<typeof API_KEY, VsCodeWebviewApi | undefined>;

export const vscode = globalApiStore[API_KEY] || (globalApiStore[API_KEY] = acquireVsCodeApi());
