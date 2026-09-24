/**
 * The theme a sheet is showing: the nearest `.themed` ancestor (a per-document theme chosen in
 * Sheet Configuration), else <body> (the global UI theme). Returns "theme-light", "theme-dark",
 * or undefined.
 */
export function effectiveTheme(sheet) {
  const themed = sheet?.element?.closest?.(".themed") ?? document.body;
  const [, theme] = themed.className.match(/(?:^|\s)(theme-\w+)/) ?? [];
  return theme;
}

/** Copy a sheet's theme onto an element that lives outside it (popover, dialog). */
export function applyTheme(el, sheet) {
  const theme = effectiveTheme(sheet);
  el.classList.remove("themed", "theme-light", "theme-dark");
  if (theme) el.classList.add("themed", theme);
  return theme;
}
