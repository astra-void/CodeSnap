import { homedir } from 'node:os';
import * as path from 'node:path';

import * as vscode from 'vscode';

import type {
  CaptureTarget,
  CodeSnapConfig,
  ExtensionToWebviewMessage,
  FontLigaturesSetting,
  RenderPayload,
  ShutterAction,
  TabSizeSetting,
  WebviewToExtensionMessage
} from '../types/contracts';

import { buildPlainLines, splitLines, stripCommonIndent } from './render-model';
import { createRenderPayload } from './render-payload';
import { buildRenderPayload, invalidateTheme } from './textmate';
import { getSettings, getWebviewHtml } from './util';

interface EditorSettings {
  fontLigatures: FontLigaturesSetting;
  tabSize: TabSizeSetting;
}

interface ExtensionSettings {
  backgroundColor: string;
  boxShadow: string;
  containerPadding: string;
  realLineNumbers: boolean;
  roundedCorners: boolean;
  showLineNumbers: boolean;
  showWindowControls: boolean;
  showWindowTitle: boolean;
  shutterAction: ShutterAction;
  target: CaptureTarget;
  transparentBackground: boolean;
}

const EDITOR_SETTING_KEYS = ['fontLigatures', 'tabSize'] as const;
const EXTENSION_SETTING_KEYS = [
  'backgroundColor',
  'boxShadow',
  'containerPadding',
  'roundedCorners',
  'showWindowControls',
  'showWindowTitle',
  'showLineNumbers',
  'realLineNumbers',
  'transparentBackground',
  'target',
  'shutterAction'
] as const;

const hasOneSelection = (
  selections: readonly vscode.Selection[] | undefined
): selections is readonly [vscode.Selection] =>
  Array.isArray(selections) && selections.length === 1 && !selections[0].isEmpty;

const getWorkspaceName = (uri: vscode.Uri | undefined): string => {
  const workspaceFolder = uri && vscode.workspace.getWorkspaceFolder(uri);
  return workspaceFolder ? workspaceFolder.name : '';
};

const getWindowTitle = (
  editor: vscode.TextEditor | undefined,
  showWindowTitle: boolean
): string => {
  if (!editor || !showWindowTitle) return '';

  const activeFileName = path.basename(editor.document.uri.fsPath || editor.document.fileName);
  const workspaceName = getWorkspaceName(editor.document.uri);

  return workspaceName ? `${workspaceName} - ${activeFileName}` : activeFileName;
};

const getConfig = (
  editor: vscode.TextEditor | undefined = vscode.window.activeTextEditor
): CodeSnapConfig => {
  const editorSettings = getSettings<EditorSettings, typeof EDITOR_SETTING_KEYS>(
    'editor',
    EDITOR_SETTING_KEYS,
    editor
  );
  if (editor && typeof editor.options.tabSize === 'number') {
    editorSettings.tabSize = editor.options.tabSize;
  }

  const extensionSettings = getSettings<ExtensionSettings, typeof EXTENSION_SETTING_KEYS>(
    'codesnap',
    EXTENSION_SETTING_KEYS,
    editor
  );

  const selection = editor?.selection;
  const startLine = extensionSettings.realLineNumbers ? (selection ? selection.start.line : 0) : 0;

  const windowTitle =
    editor && extensionSettings.showWindowTitle
      ? getWindowTitle(editor, extensionSettings.showWindowTitle)
      : '';

  return {
    ...editorSettings,
    ...extensionSettings,
    startLine,
    windowTitle
  };
};

const createPanel = (context: vscode.ExtensionContext): vscode.WebviewPanel =>
  vscode.window.createWebviewPanel(
    'codesnap',
    'CodeSnap 📸',
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(context.extensionUri, 'webview'),
        vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview'),
        vscode.Uri.joinPath(context.extensionUri, 'node_modules', 'dom-to-image-even-more', 'dist')
      ]
    }
  );

let lastUsedImageUri = vscode.Uri.file(path.resolve(homedir(), 'Desktop/code.png'));

const saveImage = async (data: string): Promise<boolean> => {
  const uri = await vscode.window.showSaveDialog({
    filters: { Images: ['png'] },
    defaultUri: lastUsedImageUri
  });
  if (!uri) return false;

  lastUsedImageUri = uri;
  await vscode.workspace.fs.writeFile(uri, Buffer.from(data, 'base64'));
  return true;
};

const affectsPreview = (
  event: vscode.ConfigurationChangeEvent,
  editor: vscode.TextEditor | undefined
): boolean =>
  event.affectsConfiguration('workbench.colorTheme') ||
  event.affectsConfiguration('codesnap', editor?.document.uri) ||
  event.affectsConfiguration('editor.fontLigatures', editor?.document.uri) ||
  event.affectsConfiguration('editor.tabSize', editor?.document.uri);

const ensureEditorIsReadyForCopy = async (
  editor: vscode.TextEditor
): Promise<vscode.TextEditor> => {
  const targetEditor = await vscode.window.showTextDocument(editor.document, {
    ...(editor.viewColumn ? { viewColumn: editor.viewColumn } : {}),
    preserveFocus: false,
    selection: editor.selection,
    preview: false
  });

  if (targetEditor) {
    targetEditor.selections = editor.selections;
  }

  return targetEditor || editor;
};

const copySelectionWithSyntaxHighlighting = async (editor: vscode.TextEditor): Promise<boolean> => {
  try {
    await ensureEditorIsReadyForCopy(editor);
    await vscode.commands.executeCommand('editor.action.clipboardCopyWithSyntaxHighlightingAction');
    return true;
  } catch (error) {
    console.error('CodeSnap 📸: Failed to copy syntax-highlighted HTML.', error);
    return false;
  }
};

const toIncomingMessage = (
  value: unknown
): Partial<WebviewToExtensionMessage> & {
  data?: string | null;
  message?: string;
  type?: string;
} => (typeof value === 'object' && value !== null ? value : {});

const runCommand = (context: vscode.ExtensionContext): void => {
  const initialEditor = vscode.window.activeTextEditor;
  if (!initialEditor || !hasOneSelection(initialEditor.selections)) {
    void vscode.window.showErrorMessage('CodeSnap 📸: Select code in the active editor first.');
    return;
  }

  const panel = createPanel(context);
  const disposables: vscode.Disposable[] = [];
  let previewEditor: vscode.TextEditor = initialEditor;
  let webviewReady = false;
  let renderVersion = 0;
  let lastWebviewError = '';
  let lastUnavailableMessage = '';

  const updatePreviewEditor = (editor: vscode.TextEditor | undefined): void => {
    if (editor && hasOneSelection(editor.selections)) {
      previewEditor = editor;
    }
  };

  const renderEditor = async (editor: vscode.TextEditor = previewEditor): Promise<void> => {
    if (!webviewReady || !editor || !hasOneSelection(editor.selections)) return;

    updatePreviewEditor(editor);
    const currentRender = ++renderVersion;
    const config = getConfig(editor);
    const selectionText = editor.document.getText(editor.selection);
    let payload: RenderPayload;

    try {
      payload = await buildRenderPayload(editor, config, config.windowTitle);
    } catch (error) {
      const rawText = editor.document.getText(editor.selection);
      const plainLines = buildPlainLines(stripCommonIndent(splitLines(rawText)), config.startLine);

      payload = createRenderPayload({
        config,
        windowTitle: config.windowTitle,
        startLine: config.startLine,
        lines: plainLines,
        errorType: 'renderFailed'
      });

      console.error('CodeSnap 📸: Failed to build preview payload.', error);
    }

    if (currentRender !== renderVersion) return;
    lastUnavailableMessage = '';

    const clipboardCopied = await copySelectionWithSyntaxHighlighting(editor);
    if (currentRender !== renderVersion) return;

    if (!clipboardCopied) {
      const message: Extract<ExtensionToWebviewMessage, { type: 'render' }> = {
        type: 'render',
        ...payload
      };
      await panel.webview.postMessage(message);
      return;
    }

    const clipboardMessage: Extract<ExtensionToWebviewMessage, { type: 'renderClipboard' }> = {
      type: 'renderClipboard',
      requestId: currentRender,
      config,
      windowTitle: config.windowTitle,
      selectionText,
      fallback: payload
    };
    await panel.webview.postMessage(clipboardMessage);
  };

  const flash = (): Thenable<boolean> =>
    panel.webview.postMessage({ type: 'flash' } satisfies Extract<
      ExtensionToWebviewMessage,
      { type: 'flash' }
    >);

  disposables.push(
    panel.webview.onDidReceiveMessage(async (rawMessage: unknown) => {
      const message = toIncomingMessage(rawMessage);

      if (message.type === 'ready') {
        webviewReady = true;
        await renderEditor(previewEditor);
        return;
      }

      if (message.type === 'save') {
        if (typeof message.data === 'string' && (await saveImage(message.data))) {
          await flash();
        }
        return;
      }

      if (message.type === 'copyFailed') {
        const action = await vscode.window.showErrorMessage(
          message.message || 'CodeSnap 📸: Failed to copy image to the clipboard.',
          'Save As...'
        );

        if (
          action === 'Save As...' &&
          typeof message.data === 'string' &&
          (await saveImage(message.data))
        ) {
          await flash();
        }
        return;
      }

      if (message.type === 'saveUnavailable') {
        const errorMessage =
          message.message || 'CodeSnap 📸: Preview is not ready, so there is nothing to save yet.';

        if (errorMessage !== lastUnavailableMessage) {
          lastUnavailableMessage = errorMessage;
          await vscode.window.showWarningMessage(errorMessage);
        }

        return;
      }

      if (message.type === 'webviewError') {
        const errorMessage =
          message.message || 'CodeSnap 📸: The preview webview failed to initialize.';
        console.error(errorMessage);

        if (errorMessage !== lastWebviewError) {
          lastWebviewError = errorMessage;
          await vscode.window.showErrorMessage(errorMessage);
        }

        return;
      }

      await vscode.window.showErrorMessage(
        `CodeSnap 📸: Unknown message "${message.type ?? 'unknown'}"`
      );
    }),
    vscode.window.onDidChangeTextEditorSelection((event) => {
      if (hasOneSelection(event.selections)) {
        updatePreviewEditor(event.textEditor);
        void renderEditor(event.textEditor);
      }
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && hasOneSelection(editor.selections)) {
        updatePreviewEditor(editor);
        void renderEditor(editor);
      }
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (
        previewEditor &&
        event.document === previewEditor.document &&
        hasOneSelection(previewEditor.selections)
      ) {
        void renderEditor(previewEditor);
      }
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('workbench.colorTheme')) invalidateTheme();
      if (
        previewEditor &&
        hasOneSelection(previewEditor.selections) &&
        affectsPreview(event, previewEditor)
      ) {
        void renderEditor(previewEditor);
      }
    })
  );

  panel.webview.html = getWebviewHtml(panel.webview, context.extensionUri);

  panel.onDidDispose(() => {
    while (disposables.length) {
      const disposable = disposables.pop();
      disposable?.dispose();
    }
  });
};

export const activate = (context: vscode.ExtensionContext): void => {
  context.subscriptions.push(
    vscode.commands.registerCommand('codesnap.start', () => runCommand(context))
  );
};
