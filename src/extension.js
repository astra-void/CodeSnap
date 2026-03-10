'use strict';

const vscode = require('vscode');
const path = require('path');
const { homedir } = require('os');
const {
  buildPlainLines,
  splitLines,
  stripCommonIndent
} = require('./render-model');
const { createRenderPayload } = require('./render-payload');
const { buildRenderPayload, invalidateTheme } = require('./textmate');
const { getWebviewHtml, getSettings } = require('./util');

const hasOneSelection = (selections) =>
  selections && selections.length === 1 && !selections[0].isEmpty;

const getWorkspaceName = (uri) => {
  const workspaceFolder = uri && vscode.workspace.getWorkspaceFolder(uri);
  return workspaceFolder ? workspaceFolder.name : '';
};

const getWindowTitle = (editor, showWindowTitle) => {
  if (!editor || !showWindowTitle) return '';

  const activeFileName = path.basename(editor.document.uri.fsPath || editor.document.fileName);
  const workspaceName = getWorkspaceName(editor.document.uri);

  return workspaceName ? `${workspaceName} - ${activeFileName}` : activeFileName;
};

const getConfig = (editor = vscode.window.activeTextEditor) => {
  const editorSettings = getSettings('editor', ['fontLigatures', 'tabSize'], editor);
  if (editor && typeof editor.options.tabSize === 'number') {
    editorSettings.tabSize = editor.options.tabSize;
  }

  const extensionSettings = getSettings(
    'codesnap',
    [
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
    ],
    editor
  );

  const selection = editor && editor.selection;
  const startLine = extensionSettings.realLineNumbers ? (selection ? selection.start.line : 0) : 0;

  let windowTitle = '';
  if (editor && extensionSettings.showWindowTitle) {
    windowTitle = getWindowTitle(editor, extensionSettings.showWindowTitle);
  }

  return {
    ...editorSettings,
    ...extensionSettings,
    startLine,
    windowTitle
  };
};

const createPanel = (context) => {
  return vscode.window.createWebviewPanel(
    'codesnap',
    'CodeSnap 📸',
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(context.extensionUri, 'webview'),
        vscode.Uri.joinPath(context.extensionUri, 'node_modules', 'dom-to-image-even-more', 'dist')
      ]
    }
  );
};

let lastUsedImageUri = vscode.Uri.file(path.resolve(homedir(), 'Desktop/code.png'));
const saveImage = async (data) => {
  const uri = await vscode.window.showSaveDialog({
    filters: { Images: ['png'] },
    defaultUri: lastUsedImageUri
  });
  if (!uri) return false;

  lastUsedImageUri = uri;
  await vscode.workspace.fs.writeFile(uri, Buffer.from(data, 'base64'));
  return true;
};

const affectsPreview = (event, editor) =>
  event.affectsConfiguration('workbench.colorTheme') ||
  event.affectsConfiguration('codesnap', editor && editor.document.uri) ||
  event.affectsConfiguration('editor.fontLigatures', editor && editor.document.uri) ||
  event.affectsConfiguration('editor.tabSize', editor && editor.document.uri);

const ensureEditorIsReadyForCopy = async (editor) => {
  const targetEditor = await vscode.window.showTextDocument(editor.document, {
    viewColumn: editor.viewColumn,
    preserveFocus: false,
    selection: editor.selection,
    preview: false
  });

  if (targetEditor) {
    targetEditor.selections = editor.selections;
  }

  return targetEditor || editor;
};

const copySelectionWithSyntaxHighlighting = async (editor) => {
  try {
    await ensureEditorIsReadyForCopy(editor);
    await vscode.commands.executeCommand('editor.action.clipboardCopyWithSyntaxHighlightingAction');
    return true;
  } catch (error) {
    console.error('CodeSnap 📸: Failed to copy syntax-highlighted HTML.', error);
    return false;
  }
};

const runCommand = (context) => {
  const initialEditor = vscode.window.activeTextEditor;
  if (!initialEditor || !hasOneSelection(initialEditor.selections)) {
    vscode.window.showErrorMessage('CodeSnap 📸: Select code in the active editor first.');
    return;
  }

  const panel = createPanel(context);
  const disposables = [];
  let previewEditor = initialEditor;
  let webviewReady = false;
  let renderVersion = 0;
  let lastWebviewError = '';
  let lastUnavailableMessage = '';

  const updatePreviewEditor = (editor) => {
    if (editor && hasOneSelection(editor.selections)) {
      previewEditor = editor;
    }
  };

  const renderEditor = async (editor = previewEditor) => {
    if (!webviewReady || !editor || !hasOneSelection(editor.selections)) return;

    updatePreviewEditor(editor);
    const currentRender = ++renderVersion;
    const config = getConfig(editor);
    const selectionText = editor.document.getText(editor.selection);
    let payload;

    try {
      payload = await buildRenderPayload(editor, config, config.windowTitle);
    } catch (error) {
      const rawText = editor.document.getText(editor.selection);
      const plainLines = buildPlainLines(
        stripCommonIndent(splitLines(rawText)),
        config.startLine
      );

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
      await panel.webview.postMessage({ type: 'render', ...payload });
      return;
    }

    await panel.webview.postMessage({
      type: 'renderClipboard',
      requestId: currentRender,
      config,
      windowTitle: config.windowTitle,
      selectionText,
      fallback: payload
    });
  };

  const flash = () => panel.webview.postMessage({ type: 'flash' });

  disposables.push(
    panel.webview.onDidReceiveMessage(async ({ type, data, message }) => {
      if (type === 'ready') {
        webviewReady = true;
        await renderEditor(previewEditor);
        return;
      }

      if (type === 'save') {
        if (await saveImage(data)) flash();
        return;
      }

      if (type === 'copyFailed') {
        const action = await vscode.window.showErrorMessage(
          message || 'CodeSnap 📸: Failed to copy image to the clipboard.',
          'Save As...'
        );

        if (action === 'Save As...' && data && (await saveImage(data))) flash();
        return;
      }

      if (type === 'saveUnavailable') {
        const errorMessage =
          message || 'CodeSnap 📸: Preview is not ready, so there is nothing to save yet.';

        if (errorMessage !== lastUnavailableMessage) {
          lastUnavailableMessage = errorMessage;
          await vscode.window.showWarningMessage(errorMessage);
        }

        return;
      }

      if (type === 'webviewError') {
        const errorMessage = message || 'CodeSnap 📸: The preview webview failed to initialize.';
        console.error(errorMessage);

        if (errorMessage !== lastWebviewError) {
          lastWebviewError = errorMessage;
          await vscode.window.showErrorMessage(errorMessage);
        }

        return;
      }

      vscode.window.showErrorMessage(`CodeSnap 📸: Unknown message "${type}"`);
    }),
    vscode.window.onDidChangeTextEditorSelection((event) => {
      if (hasOneSelection(event.selections)) {
        updatePreviewEditor(event.textEditor);
        renderEditor(event.textEditor);
      }
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && hasOneSelection(editor.selections)) {
        updatePreviewEditor(editor);
        renderEditor(editor);
      }
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (
        previewEditor &&
        event.document === previewEditor.document &&
        hasOneSelection(previewEditor.selections)
      ) {
        renderEditor(previewEditor);
      }
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('workbench.colorTheme')) invalidateTheme();
      if (
        previewEditor &&
        hasOneSelection(previewEditor.selections) &&
        affectsPreview(event, previewEditor)
      ) {
        renderEditor(previewEditor);
      }
    })
  );

  panel.webview.html = getWebviewHtml(panel.webview, context.extensionUri);

  panel.onDidDispose(() => {
    while (disposables.length) {
      const disposable = disposables.pop();
      disposable.dispose();
    }
  });
};

module.exports.activate = (context) =>
  context.subscriptions.push(
    vscode.commands.registerCommand('codesnap.start', () => runCommand(context))
  );
