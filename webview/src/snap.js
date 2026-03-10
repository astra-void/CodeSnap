import { $, $$, redraw, once, setVar } from './util.js';
import { vscode } from './vscode.js';

const windowNode = $('#window');
const snippetContainerNode = $('#snippet-container');

const flashFx = $('#flash-fx');

const SNAP_SCALE = 2;

const postUnavailable = (config, message, type = 'saveUnavailable') =>
  vscode.postMessage({
    type,
    message,
    data: null,
    action: config && config.shutterAction
  });

export const cameraFlashAnimation = async () => {
  flashFx.style.display = 'block';
  redraw(flashFx);
  flashFx.style.opacity = '0';
  await once(flashFx, 'transitionend');
  flashFx.style.display = 'none';
  flashFx.style.opacity = '1';
};

export const takeSnap = async (config) => {
  if (!config) {
    postUnavailable(null, 'CodeSnap 📸: Preview is not ready yet.');
    return;
  }

  const target = config.target === 'container' ? snippetContainerNode : windowNode;
  if (!target || !target.querySelector('.line')) {
    postUnavailable(
      config,
      'CodeSnap 📸: Preview is empty, so there is nothing to capture yet.'
    );
    return;
  }

  if (!globalThis.domtoimage || typeof globalThis.domtoimage.toPng !== 'function') {
    postUnavailable(
      config,
      'CodeSnap 📸: Image rendering is not available in this webview.'
    );
    return;
  }

  windowNode.style.resize = 'none';
  try {
    if (config.transparentBackground || config.target === 'window') {
      setVar('container-background-color', 'transparent');
    }

    const url = await globalThis.domtoimage.toPng(target, {
      bgColor: 'transparent',
      scale: SNAP_SCALE,
      postProcess: (node) => {
        $$('#snippet-container, #snippet, .line, .line-code span', node).forEach(
          (span) => (span.style.width = 'unset')
        );
        $$('.line-code', node).forEach((span) => (span.style.width = '100%'));
      }
    });

    const data = url.slice(url.indexOf(',') + 1);
    if (config.shutterAction === 'copy') {
      if (
        typeof ClipboardItem !== 'function' ||
        !navigator.clipboard ||
        typeof navigator.clipboard.write !== 'function'
      ) {
        vscode.postMessage({
          type: 'copyFailed',
          data,
          message: 'CodeSnap 📸: Clipboard image copy is not available in this webview.'
        });
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
        vscode.postMessage({
          type: 'copyFailed',
          data,
          message: `CodeSnap 📸: ${
            error && error.message ? error.message : 'Failed to copy image to the clipboard.'
          }`
        });
      }
    } else {
      vscode.postMessage({ type: config.shutterAction, data });
    }
  } catch (error) {
    postUnavailable(
      config,
      `CodeSnap 📸: ${
        error && error.message ? error.message : 'Failed to render the image preview.'
      }`
    );
  } finally {
    windowNode.style.resize = 'horizontal';
    setVar('container-background-color', config.backgroundColor);
  }
};
