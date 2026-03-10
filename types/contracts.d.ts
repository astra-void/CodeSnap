export type FontLigaturesSetting = boolean | string;
export type TabSizeSetting = number | string;
export type CaptureTarget = 'container' | 'window';
export type ShutterAction = 'save' | 'copy';
export type RenderStatusKind = 'booting' | 'ready' | 'fallback' | 'error';
export type RenderErrorType =
  | 'empty'
  | 'tokenizeFailed'
  | 'renderFailed'
  | 'clipboardPreviewFailed'
  | 'captureUnavailable'
  | 'webviewBootstrapTimeout'
  | 'webviewError';

export interface CodeSnapConfig {
  backgroundColor: string;
  boxShadow: string;
  containerPadding: string;
  fontLigatures: FontLigaturesSetting;
  realLineNumbers: boolean;
  roundedCorners: boolean;
  showLineNumbers: boolean;
  showWindowControls: boolean;
  showWindowTitle: boolean;
  shutterAction: ShutterAction;
  startLine: number;
  tabSize: TabSizeSetting;
  target: CaptureTarget;
  transparentBackground: boolean;
  windowTitle: string;
}

export interface RenderToken {
  text: string;
  color: string | null;
  fontStyle: string;
}

export interface RenderLine {
  lineNumber: number;
  spans: RenderToken[];
}

export interface RenderStatus {
  kind: RenderStatusKind;
  canCapture: boolean;
  errorType: RenderErrorType | null;
  message: string;
}

export interface RenderPayload {
  config: CodeSnapConfig;
  windowTitle: string;
  startLine: number;
  lines: RenderLine[];
  renderStatus: RenderStatus;
}

export interface ClipboardPayload {
  html: string;
  text: string;
}

export interface ThemeSetting {
  name?: string;
  scope?: string | string[];
  settings: {
    fontStyle?: string;
    foreground?: string;
    background?: string;
    fontFamily?: string;
    fontSize?: number;
    lineHeight?: number;
  };
}

export interface RawTheme {
  name?: string;
  settings: ThemeSetting[];
}

export interface ThemeDocument {
  name?: string;
  include?: string;
  settings?: ThemeSetting[];
  tokenColors?: string | ThemeSetting[];
}

export interface RenderMessage {
  type: 'render';
  config: CodeSnapConfig;
  windowTitle: string;
  lines: RenderLine[];
  renderStatus: RenderStatus;
}

export interface RenderClipboardMessage {
  type: 'renderClipboard';
  requestId: number;
  config: CodeSnapConfig;
  windowTitle: string;
  selectionText: string;
  fallback: RenderPayload;
}

export interface FlashMessage {
  type: 'flash';
}

export type ExtensionToWebviewMessage = RenderMessage | RenderClipboardMessage | FlashMessage;

export interface ReadyMessage {
  type: 'ready';
}

export interface SaveMessage {
  type: 'save';
  data: string;
}

export interface CopyFailedMessage {
  type: 'copyFailed';
  data: string;
  message: string;
}

export interface SaveUnavailableMessage {
  type: 'saveUnavailable';
  message: string;
  data: null;
  action: ShutterAction | null;
}

export interface WebviewErrorMessage {
  type: 'webviewError';
  message: string;
}

export type WebviewToExtensionMessage =
  | ReadyMessage
  | SaveMessage
  | CopyFailedMessage
  | SaveUnavailableMessage
  | WebviewErrorMessage;

export interface VsCodeWebviewApi<State = unknown> {
  getState(): State | undefined;
  postMessage(message: unknown): void;
  setState(state: State): State;
}

export interface DomToImageApi {
  toPng(
    node: Node,
    options?: {
      bgColor?: string;
      scale?: number;
      postProcess?: (node: Node) => void;
    }
  ): Promise<string>;
}

declare global {
  function acquireVsCodeApi<State = unknown>(): VsCodeWebviewApi<State>;
  var domtoimage: DomToImageApi | undefined;
}
