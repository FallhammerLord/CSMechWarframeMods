/** Per-actor sheet options (module flags), sheet design, and settings-tab choices. */

import {MODULE_ID, t} from "../constants.js";
import {L, capitalize, get, isTeen, systemSetting} from "./shared.js";

export const ARMOR_IMAGE = "systems/cyphersystem/icons/items/armor.svg";
const BG_ROOT = "systems/cyphersystem/icons/background";

export function armorImage(actor) {
  const value = actor.getFlag(MODULE_ID, "armorImage");
  // An early build could save "undefined" or "null" as text.
  const clean = typeof value === "string" && !["undefined", "null"].includes(value) ? value : "";
  return {path: `flags.${MODULE_ID}.armorImage`, value: clean, placeholder: ARMOR_IMAGE};
}

export function highContrastFrames(actor) {
  return {path: `flags.${MODULE_ID}.highContrastFrames`, value: !!actor.getFlag(MODULE_ID, "highContrastFrames")};
}

/** The system's Additional Pool setting (the default sheet reads it too). */
export function additionalPoolActive(actor) {
  const general = isTeen(actor) ? actor.system.teen.settings.general : actor.system.settings.general;
  return !!general.additionalPool?.active;
}

/**
 * Compact layout. It uses the fourth pool slot, so it is blocked while the Additional Pool is
 * on, and vice versa. Neither setting is ever switched for the player.
 */
export function compactMode(actor) {
  const flag = !!actor.getFlag(MODULE_ID, "compact");
  const blocked = additionalPoolActive(actor);
  return {path: `flags.${MODULE_ID}.compact`, value: flag, blocked, active: flag && !blocked};
}

export function portraitTall(actor) {
  return {path: `flags.${MODULE_ID}.portraitTall`, value: !!actor.getFlag(MODULE_ID, "portraitTall")};
}

/** Name of the card grid tab. */
export function cardsTab(actor) {
  const value = actor.getFlag(MODULE_ID, "cardsTabLabel") ?? "";
  return {path: `flags.${MODULE_ID}.cardsTabLabel`, value, placeholder: t("Tab.Cards"), label: value || t("Tab.Cards")};
}

/** Ruler range bands. Empty fields keep the system's distances. */
export const MOVEMENT_BANDS = [
  {key: "immediate", label: "Immediate", ft: 10, m: 3},
  {key: "short", label: "Short", ft: 50, m: 15},
  {key: "long", label: "Long", ft: 100, m: 30},
  {key: "veryLong", label: "VeryLong", ft: 500, m: 150}
];

export function movementRanges(actor) {
  const saved = actor.getFlag(MODULE_ID, "movementRanges") ?? {};
  return MOVEMENT_BANDS.map(band => ({
    key: band.key,
    path: `flags.${MODULE_ID}.movementRanges.${band.key}`,
    label: L(band.label),
    value: Number(saved[band.key]) > 0 ? Number(saved[band.key]) : "",
    placeholder: `${band.ft} ft / ${band.m} m`
  }));
}

/** The low-opacity image in the lower-right corner. Uses the system's own actor fields. */
export function badge(actor) {
  const teen = isTeen(actor);
  const base = teen ? "system.teen.settings.general.background" : "system.settings.general.background";
  const bg = get(actor, base) ?? {};
  let src = null;
  if (bg.icon === "custom") src = bg.iconPath || null;
  else if (bg.icon && bg.icon !== "none") src = `${BG_ROOT}/icon-${bg.icon}.svg`;
  return {
    base,
    icon: bg.icon ?? "none",
    iconPath: bg.iconPath ?? "",
    opacity: Number(bg.iconOpacity ?? 0.5),
    src
  };
}

/* Sheet design (actor-sheet.js customBackgroundData) */

const BACKGROUNDS = {
  "cypher-blue": "linear-gradient(rgb(203, 203, 218), white)",
  "plain metal": `center / cover url("${BG_ROOT}/background-metal.webp")`,
  "paper": `center / cover url("${BG_ROOT}/background-paper.webp")`,
  "plain pride": `center / cover url("${BG_ROOT}/background-pride.webp")`,
  "plain blue": "rgb(0, 77, 129)",
  "plain green": "rgb(20, 104, 66)",
  "plain grey": "rgb(128, 128, 128)",
  "plain purple": "rgb(154, 24, 96)",
  "plain red": "rgb(153, 0, 0)",
  "plain yellow": "rgb(247, 186, 0)"
};

function worldDesign() {
  const w = key => systemSetting(`sheetCustomization${key}`);
  return {
    background: {image: w("BackgroundImage"), imagePath: w("BackgroundImagePath"), overlayOpacity: w("BackgroundImageOverlayOpacity"),
      icon: w("BackgroundIcon"), iconPath: w("BackgroundIconPath"), iconOpacity: w("BackgroundIconOpacity")},
    logo: {image: w("LogoImage"), imagePath: w("LogoImagePath"), imageOpacity: w("LogoImageOpacity")}
  };
}

export function cyphersheetsActive() {
  return !!game.modules.get("cyphersheets")?.active;
}

/**
 * Background, badge and logo. Backgrounds come only from the actor's own Custom Sheet Design:
 * the world default ("cypher-blue", a light gradient) showed through this sheet's dark panels.
 * The logo still falls back to the world setting.
 */
export function sheetDesign(actor) {
  const teen = isTeen(actor);
  const s = actor.system;
  let custom = null;
  if (teen && s.teen.settings.general.customSheetDesign) custom = s.teen.settings.general;
  else if (!teen && s.settings.general.customSheetDesign) custom = s.settings.general;

  const bg = custom?.background ?? {};
  const logo = (custom ?? worldDesign()).logo ?? {};
  const design = {background: "", scrim: 0, icon: null, logo: null};

  if (!cyphersheetsActive()) {
    // The scrim is the theme background over the image; at least 0.6 keeps text readable.
    if (bg.image === "custom" && bg.imagePath) {
      design.background = `center / cover url("${bg.imagePath}")`;
      design.scrim = Math.max(Number(bg.overlayOpacity ?? 0.75), 0.6);
    } else if (BACKGROUNDS[bg.image]) {
      design.background = BACKGROUNDS[bg.image];
      design.scrim = 0.75;
    }
    const b = badge(actor);
    if (b.src) design.icon = {src: b.src, opacity: b.opacity};
  }

  if (logo.image === "custom" && logo.imagePath) design.logo = {src: logo.imagePath, opacity: Number(logo.imageOpacity ?? 1), variant: "custom"};
  else if (logo.image && !["none", "custom"].includes(logo.image)) {
    design.logo = {
      src: `${BG_ROOT}/compatible-cypher-system-${logo.image}.webp`,
      opacity: Number(logo.imageOpacity ?? 1),
      variant: logo.image
    };
  }
  return design;
}

/** Select choices for the settings tab (pc-sheet.js / actor-sheet.js getData). */
export function settingsChoices() {
  const range = (from, to) => Object.fromEntries(Array.from({length: to - from + 1}, (_, i) => [from + i, from + i]));
  return {
    gameMode: {Cypher: L("Cypher"), Unmasked: L("Unmasked"), Strange: L("Strange")},
    unmaskedForm: {Mask: L("Mask"), Teen: L("Teen")},
    showPrice: {none: L("None"), category: L("pricecategory"), priceTag: L("pricetag"), both: L("PriceBoth")},
    materialsDisplayMode: {price: L("Price"), level: L("Level")},
    currency: range(1, 6),
    oneActionRecoveries: range(1, 7),
    tenMinuteRecoveries: range(0, 2),
    backgroundImage: {
      "foundry": L("BGImageFoundry"), "cypher-blue": L("BGImageCypherBlue"), "plain metal": L("BGImageMetal"),
      "paper": L("BGImagePaper"), "plain pride": L("BGImagePride"), "plain blue": L("BGImagePlainBlue"),
      "plain green": L("BGImagePlainGreen"), "plain grey": L("BGImagePlainGrey"), "plain purple": L("BGImagePlainPurple"),
      "plain red": L("BGImagePlainRed"), "plain yellow": L("BGImagePlainYellow"), "custom": L("BGImageCustom")
    },
    backgroundIcon: Object.fromEntries(["none", "bat", "bat-mask", "battered-axe", "battle-gear", "bear", "bow-arrow",
      "circuitry", "csrd-logo", "holy-symbol", "hood", "orb-wand", "wizard-staff", "wolf", "custom"].map(k => [k,
      L(`BGIcon${k === "csrd-logo" ? "CypherLogo" : k.split("-").map(capitalize).join("")}`)])),
    logoImage: {none: L("CSLogoNone"), black: L("CSLogoBlack"), white: L("CSLogoWhite"), color: L("CSLogoColor"), custom: L("CSLogoCustom")}
  };
}
