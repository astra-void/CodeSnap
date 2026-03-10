'use strict';

const hasRenderableLines = (lines) => Array.isArray(lines) && lines.length > 0;

const createRenderStatus = (lines, errorType = null) => {
  if (!hasRenderableLines(lines)) {
    return {
      kind: 'error',
      canCapture: false,
      errorType: errorType || 'empty',
      message: 'CodeSnap 📸: No code content was rendered.'
    };
  }

  if (errorType) {
    return {
      kind: 'fallback',
      canCapture: true,
      errorType,
      message: 'CodeSnap 📸: Syntax highlighting failed. Showing plain text instead.'
    };
  }

  return {
    kind: 'ready',
    canCapture: true,
    errorType: null,
    message: ''
  };
};

const createRenderPayload = ({ config, windowTitle, startLine, lines, errorType = null }) => ({
  config,
  windowTitle,
  startLine,
  lines,
  renderStatus: createRenderStatus(lines, errorType)
});

module.exports = {
  createRenderPayload,
  createRenderStatus,
  hasRenderableLines
};
