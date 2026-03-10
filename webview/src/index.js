import { $, setVar } from './util.js';
import { readClipboardCode, renderClipboardCode, renderCode } from './code.js';
import { takeSnap, cameraFlashAnimation } from './snap.js';
import { vscode } from './vscode.js';
import {
  getBootTimeoutState,
  getInitialRenderState,
  getUnavailableState,
  getWebviewErrorState,
  resolveRenderState
} from './render-state.mjs';

const BOOT_TIMEOUT_MS = 4000;

const setCaptureEnabled = (button, isEnabled) => {
  button.classList.toggle('is-disabled', !isEnabled);
  button.setAttribute('aria-disabled', String(!isEnabled));
};

export const bootstrap = () => {
  const navbarNode = $('#navbar');
  const windowControlsNode = $('#window-controls');
  const windowTitleNode = $('#window-title');
  const statusNode = $('#status');
  const btnSave = $('#save');

  let config;
  let hasContent = false;
  let renderState = getInitialRenderState();
  let readySent = false;
  let bootTimeout = null;
  let lastReportedError = '';
  let latestRequestId = 0;

  const applyWindowConfig = (nextConfig, windowTitle) => {
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

  const renderFallbackPreview = (fallback, message) => {
    const renderedLineCount = renderCode(fallback.config, fallback.lines);
    hasContent = renderedLineCount > 0;

    const fallbackState =
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

  const renderClipboardPreview = async ({
    requestId,
    config: nextConfig,
    windowTitle,
    selectionText,
    fallback
  }) => {
    latestRequestId = requestId;
    applyWindowConfig(nextConfig, windowTitle);

    try {
      const clipboardPayload = await readClipboardCode(selectionText);
      if (requestId !== latestRequestId) return;

      const renderedLineCount = renderClipboardCode(nextConfig, clipboardPayload);
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
      if (requestId !== latestRequestId) return;
      renderFallbackPreview(
        fallback,
        `CodeSnap 📸: ${
          error && error.message
            ? error.message
            : 'Failed to use VS Code rich preview. Showing fallback rendering.'
        }`
      );
    }
  };

  const reportWebviewError = (message) => {
    if (!message || message === lastReportedError) return;
    lastReportedError = message;
    vscode.postMessage({ type: 'webviewError', message });
  };

  const applyStatus = (nextState) => {
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

  const blockCapture = (message) => {
    applyStatus(getUnavailableState(message || renderState.message));
  };

  const canCapture = () => Boolean(config && hasContent && renderState.canCapture);

  const handleUnexpectedError = (errorLike, prefix) => {
    const detail =
      (errorLike && errorLike.message) ||
      (typeof errorLike === 'string' ? errorLike : '') ||
      'Unknown webview error.';
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

    takeSnap(config);
  });

  document.addEventListener('copy', (event) => {
    if (!config) return;

    if (!canCapture()) {
      event.preventDefault();
      blockCapture('CodeSnap 📸: Preview is not ready yet, so there is nothing to copy.');
      return;
    }

    event.preventDefault();
    takeSnap({ ...config, shutterAction: 'copy' });
  });

  window.addEventListener('message', ({ data }) => {
    const { type } = data;

    if (type === 'renderClipboard') {
      window.clearTimeout(bootTimeout);
      void renderClipboardPreview(data);
      return;
    }

    if (type === 'render') {
      window.clearTimeout(bootTimeout);

      const { config: nextConfig, windowTitle, lines, renderStatus } = data;
      applyWindowConfig(nextConfig, windowTitle);

      const renderedLineCount = renderCode(nextConfig, lines);
      const nextState = resolveRenderState(renderStatus, renderedLineCount);
      hasContent = renderedLineCount > 0;
      applyStatus(nextState);
      return;
    }

    if (type === 'flash') {
      cameraFlashAnimation();
    }
  });

  window.addEventListener('error', (event) =>
    handleUnexpectedError(event.error || event.message, 'Preview failed.')
  );
  window.addEventListener('unhandledrejection', (event) =>
    handleUnexpectedError(event.reason, 'Preview failed.')
  );

  applyStatus(renderState);

  if (!readySent) {
    readySent = true;
    vscode.postMessage({ type: 'ready' });
  }
};
