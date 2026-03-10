import type { RawTheme, ThemeDocument, ThemeSetting } from '../types/contracts';

const cloneSettings = (settings: readonly ThemeSetting[]): ThemeSetting[] =>
  settings.map((setting) => ({
    ...(setting.name ? { name: setting.name } : {}),
    ...(setting.scope
      ? {
          scope: Array.isArray(setting.scope) ? [...setting.scope] : setting.scope
        }
      : {}),
    settings: { ...setting.settings }
  }));

export const EMPTY_THEME = Object.freeze({
  settings: [{ settings: {} }]
}) as Readonly<RawTheme>;

const cloneTheme = (theme: RawTheme | Readonly<RawTheme> | null | undefined): RawTheme => ({
  ...(theme?.name ? { name: theme.name } : {}),
  settings: Array.isArray(theme?.settings) ? cloneSettings(theme.settings) : []
});

export const toRawTheme = (themeDocument: ThemeDocument | null | undefined): RawTheme => {
  if (!themeDocument || typeof themeDocument !== 'object') return cloneTheme(EMPTY_THEME);

  if (Array.isArray(themeDocument.settings)) {
    return {
      ...(themeDocument.name ? { name: themeDocument.name } : {}),
      settings: cloneSettings(themeDocument.settings)
    };
  }

  if (Array.isArray(themeDocument.tokenColors)) {
    return {
      ...(themeDocument.name ? { name: themeDocument.name } : {}),
      settings: cloneSettings(themeDocument.tokenColors)
    };
  }

  return cloneTheme(EMPTY_THEME);
};

export const mergeRawThemes = (
  ...themes: Array<RawTheme | Readonly<RawTheme> | null | undefined>
): RawTheme => {
  const settings: ThemeSetting[] = [];
  let name: string | undefined;

  for (const theme of themes) {
    if (!theme) continue;
    if (theme.name) name = theme.name;
    if (Array.isArray(theme.settings)) settings.push(...cloneSettings(theme.settings));
  }

  return {
    ...(name ? { name } : {}),
    settings: settings.length ? settings : cloneTheme(EMPTY_THEME).settings
  };
};
