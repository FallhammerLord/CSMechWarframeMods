/**
 * Cypher Card Sheet: an AppV2 PC sheet that shows items as a uniform card grid.
 * All Cypher System data access goes through the adapter (spec §1).
 */

import {MODULE_ID, TEMPLATE_PATH, t} from "../constants.js";
import * as cs from "../adapter/cypher.js";
import {CardPopover} from "./popover.js";

const {HandlebarsApplicationMixin, DialogV2} = foundry.applications.api;
const {ActorSheetV2} = foundry.applications.sheets;

/** Per-actor view state that survives closing and reopening the sheet within a session. */
const VIEW_STATE = new Map();

export const PARTIALS = [
  `${TEMPLATE_PATH}/parts/header.hbs`,
  `${TEMPLATE_PATH}/parts/status.hbs`,
  `${TEMPLATE_PATH}/parts/cards.hbs`,
  `${TEMPLATE_PATH}/parts/toolbar.hbs`,
  `${TEMPLATE_PATH}/parts/card.hbs`,
  `${TEMPLATE_PATH}/parts/settings.hbs`
];

export class CypherCardSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["ccs-sheet"],
    position: {width: 880, height: 900},
    window: {resizable: true},
    form: {submitOnChange: true},
    actions: {
      setTab: CypherCardSheet.#onSetTab,
      setFamily: CypherCardSheet.#onSetFamily,
      editImage: CypherCardSheet.#onEditImage,
      pickFile: CypherCardSheet.#onPickFile,
      togglePopover: CypherCardSheet.#onTogglePopover,
      rollItem: CypherCardSheet.#onRollItem,
      archiveItem: CypherCardSheet.#onArchiveItem,
      createItem: CypherCardSheet.#onCreateItem,
      toggleTag: CypherCardSheet.#onToggleTag,
      editTag: CypherCardSheet.#onEditTag,
      deleteTag: CypherCardSheet.#onDeleteTag,
      poolAdjust: CypherCardSheet.#onPoolAdjust,
      poolReset: CypherCardSheet.#onPoolReset,
      statRoll: CypherCardSheet.#onStatRoll,
      xpAdjust: CypherCardSheet.#onXpAdjust,
      resetAdvancement: CypherCardSheet.#onResetAdvancement,
      toggleDamageApply: CypherCardSheet.#onToggleDamageApply,
      stressAdjust: CypherCardSheet.#onStressAdjust,
      stressReset: CypherCardSheet.#onStressReset,
      recoverySlot: CypherCardSheet.#onRecoverySlot,
      recoveryReset: CypherCardSheet.#onRecoveryReset,
      rollDice: CypherCardSheet.#onRollDice,
      endMultiRoll: CypherCardSheet.#onEndMultiRoll,
      toggleArmorMenu: CypherCardSheet.#onToggleArmorMenu,
      toggleArmorWorn: CypherCardSheet.#onToggleArmorWorn
    }
  };

  static PARTS = {
    sheet: {
      template: `${TEMPLATE_PATH}/sheet.hbs`,
      templates: PARTIALS,
      scrollable: [".ccs-scroll"]
    }
  };

  #armorMenuAbort = null;

  /** Drop events already handled, so core's DragDrop and our fallback listener never double-handle. */
  #handledDrops = new WeakSet();

  get title() {
    return this.actor.name;
  }

  /** View state: tab, grouping mode, family filter, search text. */
  get view() {
    let state = VIEW_STATE.get(this.actor.uuid);
    if (!state) {
      state = {armorMenu: false, tab: "cards", mode: game.settings.get(MODULE_ID, "defaultGroupMode"), family: "all", search: ""};
      VIEW_STATE.set(this.actor.uuid, state);
    }
    return state;
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.actor;
    const editable = this.isEditable;
    const limited = actor.limited;
    const TextEditor = foundry.applications.ux.TextEditor.implementation;
    const enrich = html => TextEditor.enrichHTML(html ?? "", {secrets: actor.isOwner, relativeTo: actor});

    Object.assign(context, {
      actor,
      system: actor.system,
      moduleId: MODULE_ID,
      editable,
      limited,
      isGM: game.user.isGM,
      identity: cs.identity(actor),
      design: cs.sheetDesign(actor),
      layout: {portraitTall: cs.portraitTall(actor).value}
    });

    if (limited) {
      context.description = await enrich(actor.system.description);
      return context;
    }

    const view = this.view;
    const state = cs.actorState(actor);
    const tabs = [
      {id: "cards", icon: "fa-solid fa-layer-group", label: cs.cardsTab(actor).label},
      {id: "notes", icon: "fa-regular fa-file-pen", label: game.i18n.localize("CYPHERSYSTEM.Notes")},
      {id: "description", icon: "fa-regular fa-file-lines", label: game.i18n.localize("CYPHERSYSTEM.Description")}
    ];
    if (game.user.isGM) tabs.splice(2, 0, {id: "gmNotes", icon: "fa-regular fa-file-shield", label: game.i18n.localize("CYPHERSYSTEM.GMNotes")});
    tabs.push({id: "settings", icon: "fa-solid fa-gear", label: game.i18n.localize("CYPHERSYSTEM.Settings")});
    if (!tabs.some(tab => tab.id === view.tab)) view.tab = "cards";
    tabs.forEach(tab => tab.active = tab.id === view.tab);

    const groups = this.#filterGroups(cs.buildGroups(actor, view.mode), view.family);
    const pools = cs.pools(actor);

    Object.assign(context, {
      view,
      tabs,
      state,
      locked: state.staticStatsLocked,
      pools,
      poolSeparator: cs.poolSeparator(),
      logo: pools.some(p => p.additional) ? null : context.design.logo,
      damageTrack: cs.damageTrack(actor),
      stress: cs.stress(actor),
      armor: cs.armorTotals(actor),
      recovery: {slots: cs.recoverySlots(actor), formula: cs.recoveryFormula(actor)},
      dice: cs.diceTrayEnabled() ? ["d6", "d10", "d20", "d100"] : null,
      currency: cs.currency(actor),
      tagBar: cs.tagBar(actor),
      groups,
      groupModes: Object.fromEntries(cs.GROUP_MODES.map(m => [m, t(`Grid.Mode.${m}`)])),
      families: [{id: "all", label: t("Family.all"), active: view.family === "all"}]
        .concat(cs.FAMILIES.map(f => ({id: f, label: cs.familyLabel(f), active: view.family === f}))),
      hideArchive: actor.system.settings.general.hideArchive,
      settings: this.#settingsContext(),
      text: {
        notes: {path: "system.notes", source: actor.system.notes, enriched: await enrich(actor.system.notes)},
        gmNotes: {path: "system.gmNotes", source: actor.system.gmNotes, enriched: await enrich(actor.system.gmNotes)},
        description: {path: "system.description", source: actor.system.description, enriched: await enrich(actor.system.description)}
      }
    });
    return context;
  }

  /** Family filter: whole groups in category/type mode, individual cards in tag mode. */
  #filterGroups(groups, family) {
    if (family === "all") return groups;
    return groups
      .map(g => (g.family ? g : {...g, items: g.items.filter(c => c.family === family)}))
      .filter(g => (g.family ? g.family === family : g.items.length > 0));
  }

  #settingsContext() {
    const actor = this.actor;
    return {
      choices: cs.settingsChoices(),
      recoveryLabels: Object.values(cs.recoveryLabels(actor)),
      poolNames: Object.values(cs.poolNames(actor)),
      movement: cs.movementRanges(actor),
      portraitTall: cs.portraitTall(actor),
      armorImage: cs.armorImage(actor),
      badge: cs.badge(actor),
      cardsTab: cs.cardsTab(actor),
      cyphersheetsActive: cs.cyphersheetsActive(),
      general: actor.system.settings.general,
      teenGeneral: actor.system.teen.settings.general
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const root = this.element;

    // Minimum width: measure the header now and again once web fonts have loaded, then widen
    // the window if it's narrower (e.g. after switching to the tall portrait).
    this.#measureMinWidth();
    document.fonts?.ready.then(() => this.rendered && this.#measureMinWidth());
    root.style.setProperty("--ccs-sheet-min-width", `${this.minWidth}px`);

    // Armor menu: close on a click outside the tile or on Escape.
    this.#armorMenuAbort?.abort();
    if (this.view.armorMenu) {
      const tile = root.querySelector(".ccs-armor-tile");
      const abort = this.#armorMenuAbort = new AbortController();
      const close = () => {
        abort.abort();
        this.view.armorMenu = false;
        this.render();
      };
      document.addEventListener("pointerdown", event => {
        if (!tile?.contains(event.target)) close();
      }, {capture: true, signal: abort.signal});
      document.addEventListener("keydown", event => {
        if (event.key === "Escape") { event.stopPropagation(); close(); }
      }, {capture: true, signal: abort.signal});
    }

    // The portrait is an <img> acting as a button; give it keyboard activation.
    root.querySelector(".ccs-portrait[data-action]")?.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.currentTarget.click();
    });

    // Local controls (never submitted to the actor).
    root.querySelector("[data-ccs-group-mode]")?.addEventListener("change", event => {
      this.view.mode = event.target.value;
      this.render();
    });
    const search = root.querySelector("[data-ccs-search]");
    if (search) {
      search.value = this.view.search;
      search.addEventListener("input", event => {
        this.view.search = event.target.value;
        this.#applySearch();
      });
    }
    // Also re-anchors an open popover to its re-rendered card.
    this.#applySearch();

    // Hide card art that fails to load instead of showing a broken-image icon.
    for (const img of root.querySelectorAll(".ccs-card-img, .ccs-armor-art img, .ccs-portrait")) {
      img.addEventListener("error", () => img.classList.add("is-broken"), {once: true});
    }

    // Card drag for hotbar macros and for moving items between categories / actors.
    if (this.isEditable) {
      for (const card of root.querySelectorAll(".ccs-card[draggable='true']")) {
        card.addEventListener("dragstart", this.#onCardDragStart.bind(this));
      }
    }
  }

  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    const root = this.element;
    // Fallback drop handling in case the core sheet doesn't bind DragDrop in this version.
    root.addEventListener("dragover", event => event.preventDefault());
    root.addEventListener("drop", event => this.#handleDrop(event));
    // Reposition the popover while the sheet body scrolls.
    root.addEventListener("scroll", () => CardPopover.reposition(), {capture: true, passive: true});
  }

  /** Client-side search: hide non-matching cards, then empty groups. No re-render. */
  #applySearch() {
    const query = this.view.search.trim().toLowerCase();
    const root = this.element;
    for (const card of root.querySelectorAll(".ccs-card")) {
      card.hidden = !!query && !card.dataset.search.includes(query);
    }
    for (const group of root.querySelectorAll(".ccs-group")) {
      const cards = group.querySelectorAll(".ccs-card");
      group.hidden = !!query && cards.length > 0 && [...cards].every(c => c.hidden);
      if (query && cards.length === 0) group.hidden = true;
    }
    CardPopover.refresh(this);
  }

  /** Ignore changes from local (non-document) controls. */
  _onChangeForm(formConfig, event) {
    if (event.target?.closest?.("[data-ccs-local]")) return;
    return super._onChangeForm(formConfig, event);
  }

  /* -------------------------------------------- */
  /*  Window lifecycle                            */
  /* -------------------------------------------- */

  /**
   * Narrowest widths that keep the header (advancement row, Tier/Effort/XP) from overlapping,
   * measured in Chromium. The double-tall portrait takes a wider column.
   */
  static MIN_WIDTH = {square: 800, tall: 835};

  /** Minimum width measured from the rendered header in the live client (fonts included). */
  #measuredMinWidth = 0;

  get minWidth() {
    const fallback = cs.portraitTall(this.actor).value ? CypherCardSheet.MIN_WIDTH.tall : CypherCardSheet.MIN_WIDTH.square;
    return Math.max(fallback, this.#measuredMinWidth);
  }

  /**
   * Measure the narrowest window that fits the header: portrait column + the header at its
   * min-content width (advancement row on one line, Tier/Effort/XP) + padding + window chrome.
   * Measured in the client because Foundry's fonts and button styles differ from any fixed guess.
   */
  #measureMinWidth() {
    const top = this.element?.querySelector(".ccs-top");
    const header = top?.querySelector(".ccs-header");
    const content = this.element?.querySelector(".window-content");
    if (!header || !content) return;
    const previous = header.style.width;
    header.style.width = "min-content";
    const headerMin = header.getBoundingClientRect().width;
    header.style.width = previous;
    const style = getComputedStyle(top);
    const portrait = top.querySelector(".ccs-portrait-wrap")?.getBoundingClientRect().width ?? 0;
    const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const chrome = this.element.offsetWidth - content.clientWidth;
    this.#measuredMinWidth = Math.ceil(portrait + (parseFloat(style.columnGap) || 0) + headerMin + padding + chrome + 4);
    this.element.style.setProperty("--ccs-sheet-min-width", `${this.minWidth}px`);
    if (this.position.width < this.minWidth) this.setPosition({width: this.minWidth});
  }

  /** Every move and resize (including dragging the resize handle) passes through here. */
  _updatePosition(position) {
    const pos = super._updatePosition(position);
    if (typeof pos.width === "number") pos.width = Math.max(pos.width, this.minWidth);
    return pos;
  }

  setPosition(position) {
    const result = super.setPosition(position);
    CardPopover.reposition();
    return result;
  }

  async minimize() {
    CardPopover.closeFor(this);
    return super.minimize();
  }

  async close(options) {
    CardPopover.closeFor(this);
    this.#armorMenuAbort?.abort();
    this.view.armorMenu = false;
    return super.close(options);
  }

  /* -------------------------------------------- */
  /*  Drag and drop                               */
  /* -------------------------------------------- */

  #onCardDragStart(event) {
    const item = this.actor.items.get(event.currentTarget.dataset.itemId);
    if (!item) return;
    CardPopover.close();
    event.dataTransfer.setData("text/plain", JSON.stringify(item.toDragData()));
  }

  /** Core DragDrop entry point. */
  async _onDrop(event) {
    return this.#handleDrop(event);
  }

  async #handleDrop(event) {
    if (this.#handledDrops.has(event)) return;
    this.#handledDrops.add(event);
    event.preventDefault();
    if (!this.isEditable) return;

    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    // Non-item drops (effects, actors, folders) use core behaviour, which fires its own hook.
    if (data?.type !== "Item") return super._onDrop?.(event);

    // Items go through the system's own drop rules (move/archive dialogs, quantities, categories).
    const allowed = Hooks.call("dropActorSheetData", this.actor, this, data);
    if (allowed === false) return;
    return cs.dropItem(this.actor, event, data);
  }

  /* -------------------------------------------- */
  /*  Action helpers                              */
  /* -------------------------------------------- */

  #itemFrom(target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    return id ? this.actor.items.get(id) : null;
  }

  /* -------------------------------------------- */
  /*  Actions (this = sheet)                      */
  /* -------------------------------------------- */

  static #onSetTab(event, target) {
    const tab = target.dataset.tab;
    this.view.tab = tab;
    CardPopover.closeFor(this);
    for (const button of this.element.querySelectorAll("[data-action='setTab']")) {
      const active = button.dataset.tab === tab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    }
    for (const panel of this.element.querySelectorAll(".ccs-panel")) {
      panel.hidden = panel.dataset.tab !== tab;
    }
    for (const bar of this.element.querySelectorAll("[data-tab-owner]")) {
      bar.hidden = bar.dataset.tabOwner !== tab;
    }
  }

  static #onSetFamily(event, target) {
    this.view.family = target.dataset.family;
    this.render();
  }

  static async #onEditImage(event, target) {
    if (!this.isEditable) return;
    const attr = target.dataset.path;
    const FilePicker = foundry.applications.apps.FilePicker.implementation;
    return new FilePicker({
      type: "image",
      current: foundry.utils.getProperty(this.actor, attr),
      callback: path => this.actor.update({[attr]: path})
    }).browse();
  }

  static async #onPickFile(event, target) {
    if (!this.isEditable) return;
    const attr = target.dataset.target;
    const FilePicker = foundry.applications.apps.FilePicker.implementation;
    return new FilePicker({
      type: "image",
      current: foundry.utils.getProperty(this.actor, attr),
      callback: path => this.actor.update({[attr]: path})
    }).browse();
  }

  static #onTogglePopover(event, target) {
    const card = target.closest(".ccs-card");
    if (!card) return;
    // detail === 0 means the click came from the keyboard (Enter / Space).
    return CardPopover.toggle(this, card, {keyboard: event.detail === 0});
  }

  static #onRollItem(event, target) {
    const item = this.#itemFrom(target);
    if (!item) return;
    const card = cs.cardData(item, this.actor);
    if (card.canRoll && !this.isEditable) return;
    return cs.rollItem(this.actor, item);
  }

  static #onArchiveItem(event, target) {
    const item = this.#itemFrom(target);
    if (item && this.isEditable) return cs.toggleArchive(item);
  }

  static #onCreateItem(event, target) {
    if (!this.isEditable) return;
    const types = target.dataset.types ? target.dataset.types.split(",") : undefined;
    return cs.createItem(this.actor, {types, sorting: target.dataset.sorting || undefined});
  }

  static #onToggleTag(event, target) {
    const item = this.#itemFrom(target);
    if (item && this.isEditable) return cs.toggleTag(this.actor, item);
  }

  static #onEditTag(event, target) {
    this.#itemFrom(target)?.sheet.render(true);
  }

  static async #onDeleteTag(event, target) {
    const item = this.#itemFrom(target);
    if (!item || !this.isEditable) return;
    const confirmed = await DialogV2.confirm({
      window: {title: t("Popover.DeleteTitle")},
      content: `<p>${t("Popover.DeleteConfirm", {name: Handlebars.escapeExpression(item.name)})}</p>`,
      rejectClose: false
    });
    if (confirmed) return cs.deleteItem(this.actor, item);
  }

  static #onPoolAdjust(event, target) {
    if (this.isEditable) return cs.adjustPool(this.actor, target.dataset.pool, Number(target.dataset.dir));
  }

  static #onPoolReset(event, target) {
    if (this.isEditable) return cs.resetPool(this.actor, target.dataset.pool);
  }

  static #onStatRoll(event, target) {
    if (this.isEditable) return cs.rollStat(this.actor, target.dataset.pool);
  }

  static #onXpAdjust(event, target) {
    if (this.isEditable) return cs.adjustXP(this.actor, Number(target.dataset.dir));
  }

  static #onResetAdvancement() {
    if (this.isEditable) return cs.resetAdvancement(this.actor);
  }

  static #onToggleDamageApply(event, target) {
    if (this.isEditable) return cs.toggleDamageApply(this.actor, target.dataset.kind);
  }

  static #onStressAdjust(event, target) {
    if (this.isEditable) return cs.adjustStress(this.actor, target.dataset.field, Number(target.dataset.dir));
  }

  static #onStressReset() {
    if (this.isEditable) return cs.resetStress(this.actor);
  }

  /** Available slot: roll (the system spends the next free slot). Spent slot: un-spend it. */
  static #onRecoverySlot(event, target) {
    if (!this.isEditable) return;
    if (target.dataset.spent === "true") return cs.unspendRecovery(this.actor, target.dataset.key);
    return cs.rollRecovery(this.actor, target.dataset.key);
  }

  static #onRecoveryReset() {
    if (this.isEditable) return cs.resetRecoveries(this.actor);
  }

  static #onRollDice(event, target) {
    return cs.rollDice(this.actor, target.dataset.dice);
  }

  static #onToggleArmorMenu() {
    this.view.armorMenu = !this.view.armorMenu;
    this.render();
  }

  /** Worn toggle, from the armor menu or an armor card. */
  static #onToggleArmorWorn(event, target) {
    const item = this.#itemFrom(target);
    if (item && this.isEditable) return cs.toggleArmorActive(item);
  }

  static #onEndMultiRoll() {
    if (this.isEditable) return cs.endMultiRoll(this.actor);
  }
}
