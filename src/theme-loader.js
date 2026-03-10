'use strict';

const EMPTY_THEME = Object.freeze({
  settings: [{ settings: {} }]
});

const cloneTheme = (theme) => ({
  ...(theme && theme.name ? { name: theme.name } : {}),
  settings: Array.isArray(theme && theme.settings) ? [...theme.settings] : []
});

const toRawTheme = (themeDocument) => {
  if (!themeDocument || typeof themeDocument !== 'object') return cloneTheme(EMPTY_THEME);

  if (Array.isArray(themeDocument.settings)) {
    return {
      ...(themeDocument.name ? { name: themeDocument.name } : {}),
      settings: [...themeDocument.settings]
    };
  }

  if (Array.isArray(themeDocument.tokenColors)) {
    return {
      ...(themeDocument.name ? { name: themeDocument.name } : {}),
      settings: [...themeDocument.tokenColors]
    };
  }

  return cloneTheme(EMPTY_THEME);
};

const mergeRawThemes = (...themes) => {
  const settings = [];
  let name;

  for (const theme of themes) {
    if (!theme) continue;
    if (theme.name) name = theme.name;
    if (Array.isArray(theme.settings)) settings.push(...theme.settings);
  }

  return {
    ...(name ? { name } : {}),
    settings: settings.length ? settings : cloneTheme(EMPTY_THEME).settings
  };
};

module.exports = {
  EMPTY_THEME,
  mergeRawThemes,
  toRawTheme
};
