/**
 * Detail popover: a single positioned element on document.body, outside every sheet's DOM,
 * so no scroll container can clip it (spec §5). Only one is open at a time across all sheets.
 */

import {TEMPLATE_PATH, t} from "../constants.js";
import * as cs from "../adapter/cypher.js";

const GAP = 6;
const MARGIN = 8;
const WIDTH = 360;
/** Fixed popover size; the height shrinks only when the viewport can't fit it. */
const HEIGHT = 420;
const MIN_HEIGHT = 200;

/** Popover actions. Each receives (actor, item). */
const ACTIONS = {
  payItem: (actor, item) => cs.payItem(actor, item),
  castSpell: (actor, item) => cs.castSpell(actor, item),
  quantityDown: (actor, item) => cs.adjustQuantity(item, -1),
  quantityUp: (actor, item) => cs.adjustQuantity(item, 1),
  damageDown: (actor, item) => cs.adjustLastingDamage(item, -1),
  damageUp: (actor, item) => cs.adjustLastingDamage(item, 1),
  identify: (actor, item) => cs.identify(actor, item),
  rollForLevel: (actor, item) => cs.rollForLevel(item),
  cycleCypherType: (actor, item) => cs.cycleCypherType(item),
  toggleArmor: (actor, item) => cs.toggleArmorActive(item),
  toggleTemporary: (actor, item) => cs.toggleTemporary(item),
  toggleFavorite: (actor, item) => cs.toggleFavorite(item),
  sendToChat: (actor, item) => cs.sendToChat(actor, item),
  editItem: (actor, item) => item.sheet.render(true),
  archiveItem: (actor, item) => cs.toggleArchive(item)
};

/** Actions an observer (non-editable sheet) may still use, as on the default sheet. */
const READ_ONLY_ACTIONS = new Set(["sendToChat"]);

class CardPopoverManager {
  #el = null;
  #sheet = null;
  #itemId = null;
  #groupKey = null;
  #anchor = null;
  #token = 0;

  #onKeyDown = event => {
    if (event.key !== "Escape" || !this.#el) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    this.close({restoreFocus: true});
  };

  #onPointerDown = event => {
    if (!this.#el) return;
    const target = event.target;
    if (this.#el.contains(target)) return;
    // Card clicks are handled by the card itself (toggle / switch).
    if (target.closest?.(".ccs-card")) return;
    this.close();
  };

  #onResize = () => this.reposition();

  #onClick = event => {
    const button = event.target.closest("[data-popover-action]");
    if (!button || button.disabled) return;
    event.preventDefault();
    this.#runAction(button.dataset.popoverAction);
  };

  get isOpen() {
    return !!this.#el;
  }

  /** Card body click: close if it's this card, otherwise switch to it. */
  async toggle(sheet, card, {keyboard = false} = {}) {
    const same = this.#el && this.#sheet === sheet
      && this.#itemId === card.dataset.itemId && this.#groupKey === card.dataset.groupKey;
    if (same) return this.close({restoreFocus: keyboard});
    return this.open(sheet, card, {keyboard});
  }

  async open(sheet, card, {keyboard = false} = {}) {
    this.close();
    const token = ++this.#token;
    const item = sheet.actor.items.get(card.dataset.itemId);
    if (!item) return;
    const html = await this.#renderContent(sheet, item);
    // A newer open/close happened while we were rendering.
    if (token !== this.#token) return;

    const el = document.createElement("section");
    el.className = "ccs-popover";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", cs.displayName(item));
    if ("popover" in HTMLElement.prototype) el.setAttribute("popover", "manual");
    el.innerHTML = html;
    el.addEventListener("click", this.#onClick);
    document.body.append(el);
    el.showPopover?.();

    this.#el = el;
    this.#sheet = sheet;
    this.#itemId = card.dataset.itemId;
    this.#groupKey = card.dataset.groupKey;
    this.#setAnchor(card);
    this.#position();

    window.addEventListener("keydown", this.#onKeyDown, {capture: true});
    document.addEventListener("pointerdown", this.#onPointerDown, {capture: true});
    window.addEventListener("resize", this.#onResize);

    if (keyboard) el.querySelector("button")?.focus();
  }

  close({restoreFocus = false} = {}) {
    this.#token++;
    if (!this.#el) return;
    window.removeEventListener("keydown", this.#onKeyDown, {capture: true});
    document.removeEventListener("pointerdown", this.#onPointerDown, {capture: true});
    window.removeEventListener("resize", this.#onResize);
    this.#el.remove();
    const anchor = this.#anchor;
    this.#setAnchor(null);
    this.#el = this.#sheet = this.#itemId = this.#groupKey = null;
    if (restoreFocus) anchor?.querySelector(".ccs-card-body")?.focus();
  }

  /** Close only if the popover belongs to this sheet (sheet close / minimize). */
  closeFor(sheet) {
    if (this.#sheet === sheet) this.close();
  }

  /**
   * After a sheet re-render the old card element is gone. Re-anchor to the new one and
   * refresh the content, or close if the item or its card no longer exists.
   */
  async refresh(sheet) {
    if (!this.#el || this.#sheet !== sheet) return;
    const esc = CSS.escape;
    const root = sheet.element;
    const card = root.querySelector(`.ccs-card[data-item-id="${esc(this.#itemId)}"][data-group-key="${esc(this.#groupKey)}"]`)
      ?? root.querySelector(`.ccs-card[data-item-id="${esc(this.#itemId)}"]`);
    const item = sheet.actor.items.get(this.#itemId);
    if (!card || !item || card.hidden) return this.close();

    this.#groupKey = card.dataset.groupKey;
    this.#setAnchor(card);
    const token = this.#token;
    const html = await this.#renderContent(sheet, item);
    if (token !== this.#token || !this.#el) return;
    const scroller = this.#el.querySelector(".ccs-pop-desc");
    const scrollTop = scroller?.scrollTop ?? 0;
    this.#el.innerHTML = html;
    const next = this.#el.querySelector(".ccs-pop-desc");
    if (next) next.scrollTop = scrollTop;
    this.#position();
  }

  reposition() {
    if (this.#el) this.#position();
  }

  async #renderContent(sheet, item) {
    const detail = await cs.itemDetail(sheet.actor, item);
    const editable = sheet.isEditable;
    detail.controls = detail.controls.filter(c => editable || READ_ONLY_ACTIONS.has(c.action));
    return foundry.applications.handlebars.renderTemplate(`${TEMPLATE_PATH}/popover.hbs`, {...detail, editable});
  }

  #setAnchor(card) {
    if (this.#anchor) {
      this.#anchor.classList.remove("is-open");
      this.#anchor.querySelector(".ccs-card-body")?.setAttribute("aria-expanded", "false");
    }
    this.#anchor = card;
    if (card) {
      card.classList.add("is-open");
      card.querySelector(".ccs-card-body")?.setAttribute("aria-expanded", "true");
    }
  }

  #position() {
    const el = this.#el;
    const anchor = this.#anchor;
    if (!el || !anchor?.isConnected) return this.close();
    const a = anchor.getBoundingClientRect();

    // Close when the card is scrolled out of the sheet's visible area or the sheet is minimized.
    const viewport = anchor.closest(".ccs-scroll")?.getBoundingClientRect();
    if (!a.width || (viewport && (a.bottom < viewport.top || a.top > viewport.bottom))) return this.close();

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(WIDTH, vw - (2 * MARGIN));
    const left = Math.clamp(a.left + (a.width / 2) - (width / 2), MARGIN, vw - width - MARGIN);
    const below = vh - a.bottom - GAP - MARGIN;
    const above = a.top - GAP - MARGIN;
    const placeBelow = below >= HEIGHT || below >= above;
    const space = placeBelow ? below : above;

    el.style.width = `${width}px`;
    el.style.left = `${left}px`;
    el.style.height = `${Math.max(Math.min(HEIGHT, space), MIN_HEIGHT)}px`;
    if (placeBelow) {
      el.style.top = `${a.bottom + GAP}px`;
      el.style.bottom = "auto";
    } else {
      el.style.top = "auto";
      el.style.bottom = `${vh - a.top + GAP}px`;
    }
    el.dataset.placement = placeBelow ? "below" : "above";
  }

  async #runAction(action) {
    if (action === "close") return this.close({restoreFocus: true});
    const sheet = this.#sheet;
    const item = sheet?.actor.items.get(this.#itemId);
    if (!item) return this.close();
    if (!sheet.isEditable && !READ_ONLY_ACTIONS.has(action)) return;

    if (action === "deleteItem") {
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: {title: t("Popover.DeleteTitle")},
        content: `<p>${t("Popover.DeleteConfirm", {name: Handlebars.escapeExpression(item.name)})}</p>`,
        rejectClose: false
      });
      if (!confirmed) return;
      this.close();
      return cs.deleteItem(sheet.actor, item);
    }
    return ACTIONS[action]?.(sheet.actor, item);
  }
}

export const CardPopover = new CardPopoverManager();
