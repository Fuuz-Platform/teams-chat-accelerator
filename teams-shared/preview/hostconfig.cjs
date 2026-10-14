'use strict';
/*
 * Approximate Microsoft Teams host configs (light and dark) for the Adaptive Cards JS renderer, used ONLY for local PNG previews.
 * Real Teams applies its own host config; these values follow the Teams "default" and "dark" themes closely enough to judge
 * layout, hierarchy and contrast (Segoe UI stack, 14px default text, Teams accent #5B5FC7 / #7F85F5).
 */
function hostConfig(theme) {
  const dark = theme === 'dark';
  const fg = dark ? '#FFFFFF' : '#242424';
  const subtle = dark ? '#ADADAD' : '#616161';
  const accent = dark ? '#7F85F5' : '#5B5FC7';
  const cs = (bg) => ({
    backgroundColor: bg,
    foregroundColors: {
      default: { default: fg, subtle },
      dark: { default: dark ? '#ADADAD' : '#242424', subtle: dark ? '#8A8A8A' : '#616161' },
      light: { default: '#FFFFFF', subtle: '#E0E0E0' },
      accent: { default: accent, subtle: accent },
      good: { default: dark ? '#92C353' : '#237B4B', subtle: dark ? '#92C353' : '#237B4B' },
      warning: { default: dark ? '#F8D22A' : '#835B00', subtle: dark ? '#F8D22A' : '#835B00' },
      attention: { default: dark ? '#F1707B' : '#C4314B', subtle: dark ? '#F1707B' : '#C4314B' },
    },
  });
  return {
    fontFamily: "'Segoe UI', 'Segoe UI Web (West European)', -apple-system, BlinkMacSystemFont, Roboto, 'Helvetica Neue', sans-serif",
    supportsInteractivity: true,
    spacing: { small: 4, default: 8, medium: 16, large: 20, extraLarge: 24, padding: 16 },
    separator: { lineThickness: 1, lineColor: dark ? '#3D3D3D' : '#E0E0E0' },
    fontSizes: { small: 12, default: 14, medium: 14, large: 18, extraLarge: 24 },
    fontWeights: { lighter: 300, default: 400, bolder: 600 },
    imageSizes: { small: 32, medium: 52, large: 100 },
    containerStyles: {
      default: cs(dark ? '#292929' : '#FFFFFF'),
      emphasis: cs(dark ? '#1F1F1F' : '#F5F5F5'),
      accent: cs(dark ? '#2F2F4A' : '#E8EBFA'),
      good: cs(dark ? '#0D2E0D' : '#E7F2DA'),
      attention: cs(dark ? '#3E1F25' : '#FCF4F6'),
      warning: cs(dark ? '#463100' : '#FBF6D9'),
    },
    actions: { maxActions: 6, spacing: 'default', buttonSpacing: 8, showCard: { actionMode: 'inline', inlineTopMargin: 16 }, actionsOrientation: 'horizontal', actionAlignment: 'left' },
    factSet: { title: { color: 'default', size: 'default', isSubtle: true, weight: 'default', wrap: true, maxWidth: 150 }, value: { color: 'default', size: 'default', isSubtle: false, weight: 'default', wrap: true }, spacing: 8 },
    _page: { bg: dark ? '#1F1F1F' : '#F5F5F5', card: dark ? '#292929' : '#FFFFFF', fg, subtle, accent, border: dark ? '#3D3D3D' : '#E0E0E0' },
  };
}
module.exports = { hostConfig };
