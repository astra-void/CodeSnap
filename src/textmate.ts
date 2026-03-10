import * as path from 'node:path';

import { parse as parseJsonc } from 'jsonc-parser';
import * as plist from 'plist';
import * as vscode from 'vscode';
import { loadWASM, OnigScanner, OnigString } from 'vscode-oniguruma';
import {
  INITIAL,
  Registry,
  parseRawGrammar,
  type IGrammarConfiguration,
  type IOnigLib,
  type IRawGrammar
} from 'vscode-textmate';

import type { CodeSnapConfig, RawTheme, ThemeDocument } from '../types/contracts';

import { buildPlainLines, buildTokenizedLine, splitLines, stripCommonIndent } from './render-model';
import { createRenderPayload } from './render-payload';
import { EMPTY_THEME, mergeRawThemes, toRawTheme } from './theme-loader';

const TOKEN_TYPE_MAP = Object.freeze({
  other: 0,
  comment: 1,
  string: 2,
  regex: 3
});

type TokenTypeName = keyof typeof TOKEN_TYPE_MAP;

interface ThemeContribution {
  id?: string;
  label?: string;
  path: string;
}

interface GrammarContribution {
  scopeName: string;
  path: string;
  language?: string;
  injectTo?: string[];
  embeddedLanguages?: Record<string, string | number>;
  tokenTypes?: Record<string, TokenTypeName>;
}

interface PackageJsonContributes {
  contributes?: {
    grammars?: GrammarContribution[];
    themes?: ThemeContribution[];
  };
}

interface ThemeContributionRecord {
  extension: vscode.Extension<unknown>;
  theme: ThemeContribution;
}

interface GrammarContributionRecord {
  extension: vscode.Extension<unknown>;
  grammar: GrammarContribution;
}

interface GrammarIndex {
  themes: ThemeContributionRecord[];
  grammarByLanguage: Map<string, GrammarContributionRecord>;
  grammarByScope: Map<string, GrammarContributionRecord>;
  injectionsByScope: Map<string, string[]>;
}

let grammarIndex: GrammarIndex | undefined;
let onigLibPromise: Promise<IOnigLib> | undefined;
let registry: Registry | undefined;
let currentThemeKey: string | null = null;

const rawGrammarCache = new Map<string, IRawGrammar>();
const rawThemeCache = new Map<string, RawTheme>();
const numericLanguageIds = new Map<string, number>();

const readUriText = async (uri: vscode.Uri): Promise<string> =>
  Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');

const resolveFileUri = (baseUri: vscode.Uri, relativePath: string): vscode.Uri =>
  vscode.Uri.file(path.resolve(path.dirname(baseUri.fsPath), relativePath));

const getNumericLanguageId = (languageId: string | number): number => {
  if (typeof languageId === 'number') return languageId;

  const existingLanguageId = numericLanguageIds.get(languageId);
  if (existingLanguageId != null) return existingLanguageId;

  const nextLanguageId = numericLanguageIds.size + 1;
  numericLanguageIds.set(languageId, nextLanguageId);
  return nextLanguageId;
};

const getOnigLib = (): Promise<IOnigLib> => {
  if (!onigLibPromise) {
    onigLibPromise = (async () => {
      const wasmPath = require.resolve('vscode-oniguruma/release/onig.wasm');
      const wasm = await vscode.workspace.fs.readFile(vscode.Uri.file(wasmPath));
      await loadWASM(wasm);

      return {
        createOnigScanner(patterns: string[]) {
          return new OnigScanner(patterns);
        },
        createOnigString(text: string) {
          return new OnigString(text);
        }
      };
    })();
  }

  return onigLibPromise;
};

const ensureGrammarIndex = (): GrammarIndex => {
  if (grammarIndex) return grammarIndex;

  const themes: ThemeContributionRecord[] = [];
  const grammarByLanguage = new Map<string, GrammarContributionRecord>();
  const grammarByScope = new Map<string, GrammarContributionRecord>();
  const injectionsByScope = new Map<string, string[]>();

  for (const extension of vscode.extensions.all) {
    const contributes = (extension.packageJSON as PackageJsonContributes | undefined)?.contributes;
    if (!contributes) continue;

    for (const theme of contributes.themes ?? []) {
      if (theme?.path) themes.push({ extension, theme });
    }

    for (const grammar of contributes.grammars ?? []) {
      if (!grammar?.scopeName || !grammar.path) continue;

      const contribution = { extension, grammar };
      grammarByScope.set(grammar.scopeName, contribution);

      if (grammar.language) grammarByLanguage.set(grammar.language, contribution);

      for (const injectTarget of grammar.injectTo ?? []) {
        const injections = injectionsByScope.get(injectTarget) ?? [];
        injections.push(grammar.scopeName);
        injectionsByScope.set(injectTarget, injections);
      }
    }
  }

  grammarIndex = { themes, grammarByLanguage, grammarByScope, injectionsByScope };
  return grammarIndex;
};

const findThemeContribution = (themeName: unknown): ThemeContributionRecord | null => {
  const { themes } = ensureGrammarIndex();
  const normalizedName = String(themeName ?? '').toLowerCase();

  return (
    themes.find(
      ({ theme }) =>
        String(theme.id ?? '').toLowerCase() === normalizedName ||
        String(theme.label ?? '').toLowerCase() === normalizedName
    ) ?? null
  );
};

const readThemeDocument = async (uri: vscode.Uri): Promise<ThemeDocument> => {
  const text = await readUriText(uri);
  const trimmed = text.trimStart();

  if (
    uri.fsPath.endsWith('.tmTheme') ||
    trimmed.startsWith('<?xml') ||
    trimmed.startsWith('<plist')
  ) {
    return (plist.parse(text) as ThemeDocument | null) ?? {};
  }

  return (parseJsonc(text) as ThemeDocument | undefined) ?? {};
};

const loadThemeFromUri = async (
  uri: vscode.Uri,
  visited = new Set<string>()
): Promise<RawTheme> => {
  const cacheKey = uri.toString();
  const cachedTheme = rawThemeCache.get(cacheKey);
  if (cachedTheme) return cachedTheme;
  if (visited.has(cacheKey)) return mergeRawThemes(EMPTY_THEME);

  visited.add(cacheKey);

  const themeDocument = await readThemeDocument(uri);
  const rawThemes: RawTheme[] = [];

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

const loadRawGrammar = async (scopeName: string): Promise<IRawGrammar | null> => {
  const cachedGrammar = rawGrammarCache.get(scopeName);
  if (cachedGrammar) return cachedGrammar;

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

const getRegistry = (): Registry => {
  if (!registry) {
    const { injectionsByScope } = ensureGrammarIndex();

    registry = new Registry({
      onigLib: getOnigLib(),
      theme: mergeRawThemes(EMPTY_THEME),
      loadGrammar: loadRawGrammar,
      getInjections(scopeName) {
        return injectionsByScope.get(scopeName);
      }
    });
  }

  return registry;
};

const ensureTheme = async (): Promise<Registry> => {
  const configuredTheme = vscode.workspace.getConfiguration('workbench').get<string>('colorTheme');
  const contribution = findThemeContribution(configuredTheme);
  const themeKey = contribution
    ? `${contribution.extension.id}:${contribution.theme.path}`
    : String(configuredTheme ?? 'default');

  if (themeKey === currentThemeKey) return getRegistry();

  const themeUri =
    contribution &&
    vscode.Uri.joinPath(contribution.extension.extensionUri, contribution.theme.path);
  const rawTheme = themeUri ? await loadThemeFromUri(themeUri) : mergeRawThemes(EMPTY_THEME);

  getRegistry().setTheme(rawTheme);
  currentThemeKey = themeKey;

  return getRegistry();
};

const toEmbeddedLanguages = (
  embeddedLanguages: GrammarContribution['embeddedLanguages']
): Record<string, number> | undefined => {
  if (!embeddedLanguages || typeof embeddedLanguages !== 'object') return undefined;

  const mappedLanguages = Object.entries(embeddedLanguages).reduce<Record<string, number>>(
    (acc, [scopeName, languageId]) => {
      acc[scopeName] = getNumericLanguageId(languageId);
      return acc;
    },
    {}
  );

  return Object.keys(mappedLanguages).length ? mappedLanguages : undefined;
};

const toTokenTypes = (
  tokenTypes: GrammarContribution['tokenTypes']
): Record<string, number> | undefined => {
  if (!tokenTypes || typeof tokenTypes !== 'object') return undefined;

  const mappedTypes = Object.entries(tokenTypes).reduce<Record<string, number>>(
    (acc, [scopeName, tokenType]) => {
      acc[scopeName] = TOKEN_TYPE_MAP[tokenType];
      return acc;
    },
    {}
  );

  return Object.keys(mappedTypes).length ? mappedTypes : undefined;
};

const tokenizeLines = async (languageId: string, lines: readonly string[], startLine: number) => {
  const { grammarByLanguage } = ensureGrammarIndex();
  const contribution = grammarByLanguage.get(languageId);
  if (!contribution) return buildPlainLines(lines, startLine);

  const textmateRegistry = await ensureTheme();
  const embeddedLanguages = toEmbeddedLanguages(contribution.grammar.embeddedLanguages);
  const tokenTypes = toTokenTypes(contribution.grammar.tokenTypes);
  const grammarConfiguration: IGrammarConfiguration = {
    ...(embeddedLanguages ? { embeddedLanguages } : {}),
    ...(tokenTypes ? { tokenTypes } : {})
  };
  const grammar = await textmateRegistry.loadGrammarWithConfiguration(
    contribution.grammar.scopeName,
    getNumericLanguageId(languageId),
    grammarConfiguration
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

export const buildRenderPayload = async (
  editor: vscode.TextEditor,
  config: CodeSnapConfig,
  windowTitle: string
) => {
  const rawText = editor.document.getText(editor.selection);
  const lines = stripCommonIndent(splitLines(rawText));

  try {
    return createRenderPayload({
      config,
      windowTitle,
      startLine: config.startLine,
      lines: await tokenizeLines(editor.document.languageId, lines, config.startLine)
    });
  } catch {
    return createRenderPayload({
      config,
      windowTitle,
      startLine: config.startLine,
      lines: buildPlainLines(lines, config.startLine),
      errorType: 'tokenizeFailed'
    });
  }
};

export const invalidateTheme = (): void => {
  currentThemeKey = null;
};
