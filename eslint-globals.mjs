export const nodeGlobals = {
  Buffer: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  clearTimeout: 'readonly',
  console: 'readonly',
  exports: 'readonly',
  module: 'readonly',
  process: 'readonly',
  require: 'readonly',
  setTimeout: 'readonly'
};

export const browserGlobals = {
  Blob: 'readonly',
  ClipboardItem: 'readonly',
  URL: 'readonly',
  Uint8Array: 'readonly',
  atob: 'readonly',
  clearTimeout: 'readonly',
  console: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  Promise: 'readonly',
  setTimeout: 'readonly',
  window: 'readonly'
};

export const mochaGlobals = {
  after: 'readonly',
  afterEach: 'readonly',
  before: 'readonly',
  beforeEach: 'readonly',
  describe: 'readonly',
  it: 'readonly'
};
