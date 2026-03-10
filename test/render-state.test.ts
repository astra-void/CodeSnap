import { strict as assert } from 'node:assert';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { RenderStatus } from '../types/contracts';

describe('render-state', () => {
  it('turns zero rendered lines into an error placeholder state', async () => {
    const importModule = new Function('specifier', 'return import(specifier);') as (
      specifier: string
    ) => Promise<{
      resolveRenderState: (
        renderStatus: RenderStatus | null | undefined,
        renderedLineCount: number
      ) => RenderStatus;
    }>;
    const renderState = await importModule(
      pathToFileURL(path.resolve(__dirname, '../webview/src/render-state.js')).href
    );

    assert.deepStrictEqual(
      renderState.resolveRenderState(
        {
          kind: 'ready',
          canCapture: true,
          errorType: null,
          message: ''
        },
        0
      ),
      {
        kind: 'error',
        canCapture: false,
        errorType: 'captureUnavailable',
        message: 'CodeSnap 📸: No code content was rendered.'
      }
    );
  });
});
