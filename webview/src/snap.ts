import type {
  CodeSnapConfig,
  CopyFailedMessage,
  SaveMessage,
  SaveUnavailableMessage
} from '../../types/contracts';

import { $$, $, once, redraw, setVar } from './util.js';
import { vscode } from './vscode.js';

const windowNode = $<HTMLElement>('#window');
const snippetContainerNode = $<HTMLElement>('#snippet-container');
const flashFx = $<HTMLElement>('#flash-fx');

const SNAP_SCALE = 2;

const postUnavailable = (config: CodeSnapConfig | null, message: string): void => {
  const payload: SaveUnavailableMessage = {
    type: 'saveUnavailable',
    message,
    data: null,
    action: config?.shutterAction ?? null
  };
  vscode.postMessage(payload);
};

export const cameraFlashAnimation = async (): Promise<void> => {
  flashFx.style.display = 'block';
  redraw(flashFx);
  flashFx.style.opacity = '0';
  await once(flashFx, 'transitionend');
  flashFx.style.display = 'none';
  flashFx.style.opacity = '1';
};

export const takeSnap = async (config: CodeSnapConfig | null): Promise<void> => {
  if (!config) {
    postUnavailable(null, 'CodeSnap 📸: Preview is not ready yet.');
    return;
  }

  const target = config.target === 'container' ? snippetContainerNode : windowNode;
  if (!target.querySelector('.line')) {
    postUnavailable(config, 'CodeSnap 📸: Preview is empty, so there is nothing to capture yet.');
    return;
  }

  const domToImage = globalThis.domtoimage;
  if (!domToImage || typeof domToImage.toPng !== 'function') {
    postUnavailable(config, 'CodeSnap 📸: Image rendering is not available in this webview.');
    return;
  }

  windowNode.style.resize = 'none';
  try {
    if (config.transparentBackground || config.target === 'window') {
      setVar('container-background-color', 'transparent');
    }

    const url = await domToImage.toPng(target, {
      bgColor: 'transparent',
      scale: SNAP_SCALE,
      postProcess: (node) => {
        const root = node as ParentNode;
        $$<HTMLElement>('#snippet-container, #snippet, .line, .line-code span', root).forEach(
          (span) => {
            span.style.width = 'unset';
          }
        );
        $$<HTMLElement>('.line-code', root).forEach((span) => {
          span.style.width = '100%';
        });
      }
    });

    const data = url.slice(url.indexOf(',') + 1);
    if (config.shutterAction === 'copy') {
      if (
        typeof ClipboardItem !== 'function' ||
        !navigator.clipboard ||
        typeof navigator.clipboard.write !== 'function'
      ) {
        const payload: CopyFailedMessage = {
          type: 'copyFailed',
          data,
          message: 'CodeSnap 📸: Clipboard image copy is not available in this webview.'
        };
        vscode.postMessage(payload);
        return;
      }

      try {
        const binary = atob(data);
        const array = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);

        const blob = new Blob([array], { type: 'image/png' });
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        await cameraFlashAnimation();
      } catch (error) {
        const payload: CopyFailedMessage = {
          type: 'copyFailed',
          data,
          message: `CodeSnap 📸: ${
            error instanceof Error ? error.message : 'Failed to copy image to the clipboard.'
          }`
        };
        vscode.postMessage(payload);
      }
    } else {
      const payload: SaveMessage = { type: 'save', data };
      vscode.postMessage(payload);
    }
  } catch (error) {
    postUnavailable(
      config,
      `CodeSnap 📸: ${
        error instanceof Error ? error.message : 'Failed to render the image preview.'
      }`
    );
  } finally {
    windowNode.style.resize = 'horizontal';
    setVar('container-background-color', config.backgroundColor);
  }
};
