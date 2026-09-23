export const MODULE_ID = "cypher-card-sheet";
export const SYSTEM_ID = "cyphersystem";
export const MODULE_PATH = `modules/${MODULE_ID}`;
export const TEMPLATE_PATH = `${MODULE_PATH}/templates`;

/** Localize a key from this module's namespace. */
export function t(key, data) {
  const full = `CCS.${key}`;
  return data ? game.i18n.format(full, data) : game.i18n.localize(full);
}
