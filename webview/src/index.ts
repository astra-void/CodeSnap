import type {
  CodeSnapConfig,
  ExtensionToWebviewMessage,
  ReadyMessage,
  RenderPayload,
  RenderStatus,
  WebviewErrorMessage
} from '../../types/contracts';

import { readClipboardCode, renderClipboardCode, renderCode } from './code.js';
import {
  getBootTimeoutState,
  getInitialRenderState,
  getUnavailableState,
  getWebviewErrorState,
  resolveRenderState
} from './render-state.js';
import { cameraFlashAnimation, takeSnap } from './snap.js';
import { $, setVar } from './util.js';
import { vscode } from './vscode.js';

const BOOT_TIMEOUT_MS = 4000;

const setCaptureEnabled = (button: Element, isEnabled: boolean): void => {
  button.classList.toggle('is-disabled', !isEnabled);
  button.setAttribute('aria-disabled', String(!isEnabled));
};

export const bootstrap = (): void => {
  const navbarNode = $<HTMLElement>('#navbar');
  const windowControlsNode = $<HTMLElement>('#window-controls');
  const windowTitleNode = $<HTMLElement>('#window-title');
  const statusNode = $<HTMLElement>('#status');
  const btnSave = $<SVGElement>('#save');

  let config: CodeSnapConfig | null = null;
  let hasContent = false;
  let renderState: RenderStatus = getInitialRenderState();
  let readySent = false;
  let bootTimeout: number | null = null;
  let lastReportedError = '';
  let latestRequestId = 0;

  const applyWindowConfig = (nextConfig: CodeSnapConfig, windowTitle: string): void => {
    config = nextConfig;

    const {
      fontLigatures,
      tabSize,
      backgroundColor,
      boxShadow,
      containerPadding,
      roundedCorners,
      showWindowControls,
      showWindowTitle
    } = config;

    setVar('ligatures', fontLigatures ? 'normal' : 'none');
    setVar('font-features', typeof fontLigatures === 'string' ? fontLigatures : 'initial');
    setVar('tab-size', tabSize);
    setVar('container-background-color', backgroundColor);
    setVar('box-shadow', boxShadow);
    setVar('container-padding', containerPadding);
    setVar('window-border-radius', roundedCorners ? '4px' : 0);

    navbarNode.hidden = !showWindowControls && !showWindowTitle;
    windowControlsNode.hidden = !showWindowControls;
    windowTitleNode.hidden = !showWindowTitle;
    windowTitleNode.textContent = windowTitle;
  };

  const applyStatus = (nextState: RenderStatus): void => {
    renderState = nextState;
    statusNode.dataset.kind = nextState.kind || 'ready';

    if (nextState.message) {
      statusNode.hidden = false;
      statusNode.textContent = nextState.message;
    } else {
      statusNode.hidden = true;
      statusNode.textContent = '';
    }

    setCaptureEnabled(btnSave, Boolean(config && hasContent && nextState.canCapture));
  };

  const renderFallbackPreview = (fallback: RenderPayload, message: string): void => {
    const renderedLineCount = renderCode(fallback.config, fallback.lines);
    hasContent = renderedLineCount > 0;

    const fallbackState: RenderStatus =
      renderedLineCount > 0
        ? {
            kind: 'fallback',
            canCapture: true,
            errorType: 'clipboardPreviewFailed',
            message
          }
        : resolveRenderState(fallback.renderStatus, renderedLineCount);

    applyStatus(fallbackState);
  };

  const renderClipboardPreview = async (
    message: Extract<ExtensionToWebviewMessage, { type: 'renderClipboard' }>
  ): Promise<void> => {
    latestRequestId = message.requestId;
    applyWindowConfig(message.config, message.windowTitle);

    try {
      const clipboardPayload = await readClipboardCode(message.selectionText);
      if (message.requestId !== latestRequestId) return;

      const renderedLineCount = renderClipboardCode(message.config, clipboardPayload);
      const nextState = resolveRenderState(
        {
          kind: 'ready',
          canCapture: true,
          errorType: null,
          message: ''
        },
        renderedLineCount
      );
      hasContent = renderedLineCount > 0;
      applyStatus(nextState);
    } catch (error) {
      if (message.requestId !== latestRequestId) return;
      renderFallbackPreview(
        message.fallback,
        `CodeSnap 📸: ${
          error instanceof Error
            ? error.message
            : 'Failed to use VS Code rich preview. Showing fallback rendering.'
        }`
      );
    }
  };

  const reportWebviewError = (message: string): void => {
    if (!message || message === lastReportedError) return;
    lastReportedError = message;

    const payload: WebviewErrorMessage = { type: 'webviewError', message };
    vscode.postMessage(payload);
  };

  const blockCapture = (message: string): void => {
    applyStatus(getUnavailableState(message || renderState.message));
  };

  const canCapture = (): boolean => Boolean(config && hasContent && renderState.canCapture);

  const handleUnexpectedError = (errorLike: unknown, prefix: string): void => {
    const detail =
      errorLike instanceof Error
        ? errorLike.message
        : typeof errorLike === 'string'
          ? errorLike
          : 'Unknown webview error.';
    const state = getWebviewErrorState(`CodeSnap 📸: ${prefix} ${detail}`.trim());
    applyStatus(state);
    reportWebviewError(state.message);
  };

  bootTimeout = window.setTimeout(() => {
    const timeoutState = getBootTimeoutState();
    applyStatus(timeoutState);
    reportWebviewError(timeoutState.message);
  }, BOOT_TIMEOUT_MS);

  btnSave.addEventListener('click', () => {
    if (!canCapture()) {
      blockCapture('CodeSnap 📸: Preview is not ready yet, so there is nothing to save.');
      return;
    }

    void takeSnap(config);
  });

  document.addEventListener('copy', (event) => {
    if (!config) return;

    if (!canCapture()) {
      event.preventDefault();
      blockCapture('CodeSnap 📸: Preview is not ready yet, so there is nothing to copy.');
      return;
    }

    event.preventDefault();
    void takeSnap({ ...config, shutterAction: 'copy' });
  });

  window.addEventListener('message', ({ data }: MessageEvent<ExtensionToWebviewMessage>) => {
    if (bootTimeout !== null) {
      window.clearTimeout(bootTimeout);
    }

    if (data.type === 'renderClipboard') {
      void renderClipboardPreview(data);
      return;
    }

    if (data.type === 'render') {
      const { config: nextConfig, windowTitle, lines, renderStatus } = data;
      applyWindowConfig(nextConfig, windowTitle);

      const renderedLineCount = renderCode(nextConfig, lines);
      const nextState = resolveRenderState(renderStatus, renderedLineCount);
      hasContent = renderedLineCount > 0;
      applyStatus(nextState);
      return;
    }

    if (data.type === 'flash') {
      void cameraFlashAnimation();
    }
  });

  window.addEventListener('error', (event) => {
    handleUnexpectedError(event.error || event.message, 'Preview failed.');
  });
  window.addEventListener('unhandledrejection', (event) => {
    handleUnexpectedError(event.reason, 'Preview failed.');
  });

  applyStatus(renderState);

  if (!readySent) {
    readySent = true;
    const payload: ReadyMessage = { type: 'ready' };
    vscode.postMessage(payload);
  }
};
