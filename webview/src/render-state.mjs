const READY_MESSAGE = '';
const PREPARING_MESSAGE = 'CodeSnap 📸: Preparing preview...';
const EMPTY_MESSAGE = 'CodeSnap 📸: No code content was rendered.';
const TIMEOUT_MESSAGE = 'CodeSnap 📸: Preview failed to initialize.';

export const getInitialRenderState = () => ({
  kind: 'booting',
  canCapture: false,
  errorType: null,
  message: PREPARING_MESSAGE
});

export const getBootTimeoutState = () => ({
  kind: 'error',
  canCapture: false,
  errorType: 'webviewBootstrapTimeout',
  message: TIMEOUT_MESSAGE
});

export const getUnavailableState = (message = EMPTY_MESSAGE) => ({
  kind: 'error',
  canCapture: false,
  errorType: 'captureUnavailable',
  message
});

export const getWebviewErrorState = (message) => ({
  kind: 'error',
  canCapture: false,
  errorType: 'webviewError',
  message: message || TIMEOUT_MESSAGE
});

export const resolveRenderState = (renderStatus, renderedLineCount) => {
  if (renderedLineCount < 1) {
    return getUnavailableState((renderStatus && renderStatus.message) || EMPTY_MESSAGE);
  }

  if (!renderStatus) {
    return {
      kind: 'ready',
      canCapture: true,
      errorType: null,
      message: READY_MESSAGE
    };
  }

  return {
    kind: renderStatus.kind === 'fallback' ? 'fallback' : 'ready',
    canCapture: renderStatus.canCapture !== false,
    errorType: renderStatus.errorType || null,
    message: renderStatus.message || READY_MESSAGE
  };
};
