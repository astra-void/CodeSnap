'use strict';

const path = require('path');
const vscode = require('vscode');
const { parse: parseJsonc } = require('jsonc-parser');
const plist = require('plist');
const { Registry, INITIAL, parseRawGrammar } = require('vscode-textmate');
const { loadWASM, OnigScanner, OnigString } = require('vscode-oniguruma');
const {
  buildPlainLines,
  buildTokenizedLine,
  splitLines,
  stripCommonIndent
} = require('./render-model');
const { createRenderPayload } = require('./render-payload');
const { EMPTY_THEME, mergeRawThemes, toRawTheme } = require('./theme-loader');

const TOKEN_TYPE_MAP = Object.freeze({
  other: 0,
  comment: 1,
  string: 2,
  regex: 3
});

let grammarIndex;
let onigLibPromise;
let registry;
let currentThemeKey = null;

const rawGrammarCache = new Map();
const rawThemeCache = new Map();
const numericLanguageIds = new Map();

const readUriText = async (uri) =>
  Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');

const resolveFileUri = (baseUri, relativePath) =>
  vscode.Uri.file(path.resolve(path.dirname(baseUri.fsPath), relativePath));

const getNumericLanguageId = (languageId) => {
  if (typeof languageId === 'number') return languageId;
  if (!numericLanguageIds.has(languageId)) {
    numericLanguageIds.set(languageId, numericLanguageIds.size + 1);
  }

  return numericLanguageIds.get(languageId);
};

const getOnigLib = () => {
  if (!onigLibPromise) {
    onigLibPromise = (async () => {
      const wasmPath = require.resolve('vscode-oniguruma/release/onig.wasm');
      const wasm = await vscode.workspace.fs.readFile(vscode.Uri.file(wasmPath));
      await loadWASM(wasm);

      return {
        createOnigScanner(patterns) {
          return new OnigScanner(patterns);
        },
        createOnigString(text) {
          return new OnigString(text);
        }
      };
    })();
  }

  return onigLibPromise;
};

const ensureGrammarIndex = () => {
  if (grammarIndex) return grammarIndex;

  const themes = [];
  const grammarByLanguage = new Map();
  const grammarByScope = new Map();
  const injectionsByScope = new Map();

  for (const extension of vscode.extensions.all) {
    const contributes = extension.packageJSON && extension.packageJSON.contributes;
    if (!contributes) continue;

    for (const theme of contributes.themes || []) {
      if (theme && theme.path) themes.push({ extension, theme });
    }

    for (const grammar of contributes.grammars || []) {
      if (!grammar || !grammar.scopeName || !grammar.path) continue;

      const contribution = { extension, grammar };
      grammarByScope.set(grammar.scopeName, contribution);

      if (grammar.language) grammarByLanguage.set(grammar.language, contribution);

      for (const injectTarget of grammar.injectTo || []) {
        const injections = injectionsByScope.get(injectTarget) || [];
        injections.push(grammar.scopeName);
        injectionsByScope.set(injectTarget, injections);
      }
    }
  }

  grammarIndex = { themes, grammarByLanguage, grammarByScope, injectionsByScope };
  return grammarIndex;
};

const findThemeContribution = (themeName) => {
  const { themes } = ensureGrammarIndex();
  const normalizedName = String(themeName || '').toLowerCase();

  return (
    themes.find(
      ({ theme }) =>
        String(theme.id || '').toLowerCase() === normalizedName ||
        String(theme.label || '').toLowerCase() === normalizedName
    ) || null
  );
};

const readThemeDocument = async (uri) => {
  const text = await readUriText(uri);
  const trimmed = text.trimStart();

  if (
    uri.fsPath.endsWith('.tmTheme') ||
    trimmed.startsWith('<?xml') ||
    trimmed.startsWith('<plist')
  ) {
    return plist.parse(text);
  }

  return parseJsonc(text) || {};
};

const loadThemeFromUri = async (uri, visited = new Set()) => {
  const cacheKey = uri.toString();
  if (rawThemeCache.has(cacheKey)) return rawThemeCache.get(cacheKey);
  if (visited.has(cacheKey)) return EMPTY_THEME;

  visited.add(cacheKey);

  const themeDocument = await readThemeDocument(uri);
  const rawThemes = [];

  if (typeof themeDocument.include === 'string' && themeDocument.include) {
    rawThemes.push(await loadThemeFromUri(resolveFileUri(uri, themeDocument.include), visited));
  }

  if (typeof themeDocument.tokenColors === 'string' && themeDocument.tokenColors) {
    rawThemes.push(await loadThemeFromUri(resolveFileUri(uri, themeDocument.tokenColors), visited));
  }

  rawThemes.push(toRawTheme(themeDocument));

  const rawTheme = mergeRawThemes(...rawThemes);
  rawThemeCache.set(cacheKey, rawTheme);
  return rawTheme;
};

const loadRawGrammar = async (scopeName) => {
  if (rawGrammarCache.has(scopeName)) return rawGrammarCache.get(scopeName);

  const { grammarByScope } = ensureGrammarIndex();
  const contribution = grammarByScope.get(scopeName);
  if (!contribution) return null;

  const grammarUri = vscode.Uri.joinPath(
    contribution.extension.extensionUri,
    contribution.grammar.path
  );
  const grammarText = await readUriText(grammarUri);
  const rawGrammar = parseRawGrammar(grammarText, grammarUri.fsPath);

  rawGrammarCache.set(scopeName, rawGrammar);
  return rawGrammar;
};

const getRegistry = () => {
  if (!registry) {
    const { injectionsByScope } = ensureGrammarIndex();

    registry = new Registry({
      onigLib: getOnigLib(),
      theme: EMPTY_THEME,
      loadGrammar: loadRawGrammar,
      getInjections(scopeName) {
        return injectionsByScope.get(scopeName);
      }
    });
  }

  return registry;
};

const ensureTheme = async () => {
  const configuredTheme = vscode.workspace.getConfiguration('workbench').get('colorTheme');
  const contribution = findThemeContribution(configuredTheme);
  const themeKey = contribution
    ? `${contribution.extension.id}:${contribution.theme.path}`
    : String(configuredTheme || 'default');

  if (themeKey === currentThemeKey) return getRegistry();

  const themeUri =
    contribution &&
    vscode.Uri.joinPath(contribution.extension.extensionUri, contribution.theme.path);
  const rawTheme = themeUri ? await loadThemeFromUri(themeUri) : EMPTY_THEME;

  getRegistry().setTheme(rawTheme);
  currentThemeKey = themeKey;

  return getRegistry();
};

const toEmbeddedLanguages = (embeddedLanguages) => {
  if (!embeddedLanguages || typeof embeddedLanguages !== 'object') return undefined;

  const mappedLanguages = Object.entries(embeddedLanguages).reduce(
    (acc, [scopeName, languageId]) => {
      acc[scopeName] = getNumericLanguageId(languageId);
      return acc;
    },
    {}
  );

  return Object.keys(mappedLanguages).length ? mappedLanguages : undefined;
};

const toTokenTypes = (tokenTypes) => {
  if (!tokenTypes || typeof tokenTypes !== 'object') return undefined;

  const mappedTypes = Object.entries(tokenTypes).reduce((acc, [scopeName, tokenType]) => {
    if (TOKEN_TYPE_MAP[tokenType] != null) acc[scopeName] = TOKEN_TYPE_MAP[tokenType];
    return acc;
  }, {});

  return Object.keys(mappedTypes).length ? mappedTypes : undefined;
};

const tokenizeLines = async (languageId, lines, startLine) => {
  const { grammarByLanguage } = ensureGrammarIndex();
  const contribution = grammarByLanguage.get(languageId);
  if (!contribution) return buildPlainLines(lines, startLine);

  const textmateRegistry = await ensureTheme();
  const grammar = await textmateRegistry.loadGrammarWithConfiguration(
    contribution.grammar.scopeName,
    getNumericLanguageId(languageId),
    {
      embeddedLanguages: toEmbeddedLanguages(contribution.grammar.embeddedLanguages),
      tokenTypes: toTokenTypes(contribution.grammar.tokenTypes)
    }
  );

  if (!grammar) return buildPlainLines(lines, startLine);

  const colorMap = textmateRegistry.getColorMap();
  let ruleStack = INITIAL;

  return lines.map((lineText, index) => {
    const tokenizedLine = grammar.tokenizeLine2(lineText, ruleStack);
    ruleStack = tokenizedLine.ruleStack;

    return buildTokenizedLine(lineText, tokenizedLine.tokens, colorMap, startLine + index + 1);
  });
};

const buildRenderPayload = async (editor, config, windowTitle) => {
  const rawText = editor.document.getText(editor.selection);
  const lines = stripCommonIndent(splitLines(rawText));

  try {
    return createRenderPayload({
      config,
      windowTitle,
      startLine: config.startLine,
      lines: await tokenizeLines(editor.document.languageId, lines, config.startLine)
    });
  } catch (error) {
    return createRenderPayload({
      config,
      windowTitle,
      startLine: config.startLine,
      lines: buildPlainLines(lines, config.startLine),
      errorType: 'tokenizeFailed'
    });
  }
};

const invalidateTheme = () => {
  currentThemeKey = null;
};

module.exports = {
  buildRenderPayload,
  invalidateTheme
};
