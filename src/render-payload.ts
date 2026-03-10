import type {
  CodeSnapConfig,
  RenderErrorType,
  RenderLine,
  RenderPayload,
  RenderStatus
} from '../types/contracts';

export const hasRenderableLines = (lines: readonly RenderLine[]): boolean =>
  Array.isArray(lines) && lines.length > 0;

export const createRenderStatus = (
  lines: readonly RenderLine[],
  errorType: RenderErrorType | null = null
): RenderStatus => {
  if (!hasRenderableLines(lines)) {
    return {
      kind: 'error',
      canCapture: false,
      errorType: errorType ?? 'empty',
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

export const createRenderPayload = ({
  config,
  windowTitle,
  startLine,
  lines,
  errorType = null
}: {
  config: CodeSnapConfig;
  windowTitle: string;
  startLine: number;
  lines: RenderLine[];
  errorType?: RenderErrorType | null;
}): RenderPayload => ({
  config,
  windowTitle,
  startLine,
  lines,
  renderStatus: createRenderStatus(lines, errorType)
});
