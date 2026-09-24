/**
 * Cypher Card Sheet: entry point.
 * Registers an alternative PC sheet for the Cypher System. Players choose it per actor.
 */

import {MODULE_ID, SYSTEM_ID, TEMPLATE_PATH} from "./constants.js";
import {CypherCardSheet, PARTIALS} from "./sheet/card-sheet.js";
import {preloadSystemImports} from "./adapter/system-imports.js";
import {GROUP_MODES} from "./adapter/cypher.js";
import {registerMovementRuler} from "./adapter/ruler.js";
import {registerSystemUi} from "./adapter/system-ui.js";

Hooks.once("init", () => {
  if (game.system.id !== SYSTEM_ID) {
    console.warn(`${MODULE_ID} | This module only works with the Cypher System.`);
    return;
  }

  game.settings.register(MODULE_ID, "defaultGroupMode", {
    name: "CCS.Setting.DefaultGroupMode.Name",
    hint: "CCS.Setting.DefaultGroupMode.Hint",
    scope: "client",
    config: true,
    type: String,
    choices: Object.fromEntries(GROUP_MODES.map(mode => [mode, `CCS.Grid.Mode.${mode}`])),
    default: "category"
  });

  foundry.documents.collections.Actors.registerSheet(MODULE_ID, CypherCardSheet, {
    types: ["pc"],
    makeDefault: false,
    label: "CCS.SheetLabel"
  });

  foundry.applications.handlebars.loadTemplates([...PARTIALS, `${TEMPLATE_PATH}/popover.hbs`]);

  // The system sets its ruler class during its own init, which runs before module init.
  registerMovementRuler();

  // Roll dialog theming and custom pool names in roll chat cards.
  registerSystemUi();
});

Hooks.once("ready", () => {
  if (game.system.id === SYSTEM_ID) preloadSystemImports();
});
