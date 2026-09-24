/**
 * The sheet's theme: the nearest `.themed` ancestor (per-document choice), else <body> (the
 * global UI theme). "theme-light", "theme-dark" or undefined.
 */
export function effectiveTheme(sheet) {
  const themed = sheet?.element?.closest?.(".themed") ?? document.body;
  const [, theme] = themed.className.match(/(?:^|\s)(theme-\w+)/) ?? [];
  return theme;
}

/** Copy a sheet's theme onto an element outside it (popover, dialog). */
export function applyTheme(el, sheet) {
  const theme = effectiveTheme(sheet);
  el.classList.remove("themed", "theme-light", "theme-dark");
  if (theme) el.classList.add("themed", theme);
  return theme;
}
