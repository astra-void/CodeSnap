import type { RenderStatus } from '../../types/contracts';

const READY_MESSAGE = '';
const PREPARING_MESSAGE = 'CodeSnap 📸: Preparing preview...';
const EMPTY_MESSAGE = 'CodeSnap 📸: No code content was rendered.';
const TIMEOUT_MESSAGE = 'CodeSnap 📸: Preview failed to initialize.';

export const getInitialRenderState = (): RenderStatus => ({
  kind: 'booting',
  canCapture: false,
  errorType: null,
  message: PREPARING_MESSAGE
});

export const getBootTimeoutState = (): RenderStatus => ({
  kind: 'error',
  canCapture: false,
  errorType: 'webviewBootstrapTimeout',
  message: TIMEOUT_MESSAGE
});

export const getUnavailableState = (message = EMPTY_MESSAGE): RenderStatus => ({
  kind: 'error',
  canCapture: false,
  errorType: 'captureUnavailable',
  message
});

export const getWebviewErrorState = (message: string): RenderStatus => ({
  kind: 'error',
  canCapture: false,
  errorType: 'webviewError',
  message: message || TIMEOUT_MESSAGE
});

export const resolveRenderState = (
  renderStatus: RenderStatus | null | undefined,
  renderedLineCount: number
): RenderStatus => {
  if (renderedLineCount < 1) {
    return getUnavailableState(renderStatus?.message || EMPTY_MESSAGE);
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
