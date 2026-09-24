/** GM settings window for card frames, with a live preview and a guide to making caps. */

import {MODULE_ID, TEMPLATE_PATH, t} from "../constants.js";
import {
  FRAME_EFFECTS, FRAME_KEYS, FRAME_SETTING, FRAME_SUITES, RECOMMENDED, buildFrameCss, defaultFrames, getFrames, normalizeFrames
} from "./frames.js";

const {HandlebarsApplicationMixin, ApplicationV2} = foundry.applications.api;

/** A sample card for the preview, rendered with the sheet's own card template. */
function previewCard(key) {
  const trained = key !== "none";
  return {
    id: `preview-${key}`, family: "equipment", type: "equipment", frameKey: key,
    training: trained ? {key, label: t(`Frames.Set.${key}.label`)} : null,
    foot: trained ? t(`Frames.Set.${key}.label`) : "",
    name: t("Frames.Preview.Name"), value: t("Frames.Preview.Value"), img: "icons/svg/item-bag.svg", imgIsIcon: true
  };
}

export class CardFramesConfig extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "ccs-card-frames",
    tag: "form",
    classes: ["ccs-frames-config"],
    window: {title: "CCS.Frames.Title", icon: "fa-solid fa-border-top-left", resizable: true},
    position: {width: 820, height: 800},
    form: {handler: CardFramesConfig.#onSubmit, closeOnSubmit: true, submitOnChange: false},
    actions: {
      pickFile: CardFramesConfig.#onPickFile,
      resetDefaults: CardFramesConfig.#onResetDefaults
    }
  };

  static PARTS = {
    form: {template: `${TEMPLATE_PATH}/frames-config.hbs`, scrollable: [".ccs-frames-body"]}
  };

  /** When set, the next render shows the defaults instead of the saved frames. */
  #showDefaults = false;

  async _prepareContext(options) {
    const frames = this.#showDefaults ? defaultFrames() : getFrames();
    this.#showDefaults = false;
    const effects = Object.fromEntries(FRAME_EFFECTS.map(e => [e, t(`Frames.Effect.${e}`)]));
    return {
      enabled: frames.enabled,
      recommended: RECOMMENDED,
      suites: FRAME_SUITES.map(suite => ({
        suite,
        label: t(`Frames.Suite.${suite}.label`),
        hint: t(`Frames.Suite.${suite}.hint`),
        contrast: suite === "contrast",
        sets: FRAME_KEYS.map(key => ({
          key,
          suite,
          label: t(`Frames.Set.${key}.label`),
          rarity: t(`Frames.Set.${key}.${suite === "contrast" ? "rarityHc" : "rarity"}`),
          ...frames.suites[suite].sets[key],
          effects,
          preview: previewCard(key)
        }))
      }))
    };
  }

  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    // The form element persists across renders, so listen once.
    this.element.addEventListener("input", () => this.#updatePreview());
    this.element.addEventListener("change", () => this.#updatePreview());
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.#updatePreview();
  }

  /** Current form values as a normalized frame config. */
  #readForm() {
    const FormDataExtended = foundry.applications.ux.FormDataExtended;
    return normalizeFrames(foundry.utils.expandObject(new FormDataExtended(this.element).object));
  }

  /** Preview rules scoped to this window, overriding the live rules until saved. */
  #updatePreview() {
    let style = this.element.querySelector("style.ccs-frames-preview-style");
    if (!style) {
      style = document.createElement("style");
      style.className = "ccs-frames-preview-style";
      this.element.prepend(style);
    }
    style.textContent = buildFrameCss(this.#readForm(), ".ccs-frames-preview");
  }

  static async #onSubmit(event, form, formData) {
    const frames = normalizeFrames(foundry.utils.expandObject(formData.object));
    await game.settings.set(MODULE_ID, FRAME_SETTING, frames);
    ui.notifications.info(t("Frames.Saved"));
  }

  static #onPickFile(event, target) {
    const input = this.element.querySelector(`[name="${target.dataset.target}"]`);
    if (!input) return;
    const FilePicker = foundry.applications.apps.FilePicker.implementation;
    return new FilePicker({
      type: "image",
      current: input.value,
      callback: path => {
        input.value = path;
        this.#updatePreview();
      }
    }).browse();
  }

  static #onResetDefaults() {
    this.#showDefaults = true;
    this.render();
  }
}
