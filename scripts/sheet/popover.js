/**
 * The large card: one element on document.body, so no scroll container clips it (spec §5).
 * One is open at a time across all sheets.
 */

import {TEMPLATE_PATH, t} from "../constants.js";
import * as cs from "../adapter/cypher.js";
import {applyTheme} from "./theme.js";

const GAP = 6;
const MARGIN = 8;
const WIDTH = 360;
/** Fixed size; the height shrinks only when the viewport can't fit it. */
const HEIGHT = 420;
const MIN_HEIGHT = 200;

/** Popover actions. Each receives (actor, item, data), `data` being the button's dataset. */
const ACTIONS = {
  payItem: (actor, item) => cs.payItem(actor, item),
  castSpell: (actor, item) => cs.castSpell(actor, item),
  quantityDown: (actor, item) => cs.adjustQuantity(item, -1),
  quantityUp: (actor, item) => cs.adjustQuantity(item, 1),
  // Charges and sockets act on the artifact: the item itself, or an attack's linked artifact.
  resourceDown: (actor, item) => cs.adjustResource(actor, cs.artifactHost(actor, item), -1),
  resourceUp: (actor, item) => cs.adjustResource(actor, cs.artifactHost(actor, item), 1),
  socketPick: (actor, item, data) => pickSocket(actor, cs.artifactHost(actor, item), Number(data.slot)),
  useSocketed: (actor, item, data) => useSocketed(actor, actor.items.get(data.cypherId)),
  unsocketCypher: (actor, item, data) => {
    const cypher = actor.items.get(data.cypherId);
    return cypher && cs.unsocketCypher(cypher);
  },
  showSocketed: (actor, item, data) => CardPopover.toggleSide(data.cypherId),
  refreshSockets: (actor, item) => {
    const host = cs.artifactHost(actor, item);
    return host && cs.refreshSockets(actor, host);
  },
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

/** Actions an observer may still use, as on the default sheet. */
const READ_ONLY_ACTIONS = new Set(["sendToChat", "showSocketed"]);

const PICKER_WIDTH = 320;

/** Windows opened from the large card. Clicking in them doesn't close it. */
const CHILD_CLASS = "ccs-pop-child";

/** Choose a cypher for an empty socket from the eligible ones (matching identifier). */
async function pickSocket(actor, artifact, slot) {
  if (!artifact) return;
  const {key} = cs.socketSettings(artifact);
  if (!key) return ui.notifications.warn(t("Socket.NoKey", {name: artifact.name}));
  const eligible = cs.eligibleCyphers(actor, artifact);
  if (!eligible.length) return ui.notifications.info(t("Socket.NoneEligible", {key}));
  const esc = Handlebars.escapeExpression;
  const rows = eligible.map((c, i) => `<label class="ccs-socket-choice">
    <input type="radio" name="cypher" value="${c.id}"${i === 0 ? " checked" : ""}>
    <img src="${esc(c.img)}" alt=""><span>${esc(c.name)}</span>${c.system.basic?.level ? `<span class="ccs-muted">${esc(t("Card.Level", {n: c.system.basic.level}))}</span>` : ""}
  </label>`).join("");
  CardPopover.closeSide();
  const id = await foundry.applications.api.DialogV2.prompt({
    window: {title: t("Socket.PickTitle", {name: artifact.name})},
    position: CardPopover.besidePosition(PICKER_WIDTH) ?? {width: PICKER_WIDTH},
    classes: ["ccs-socket-picker", CHILD_CLASS],
    content: `<div class="ccs-socket-choices">${rows}</div>`,
    ok: {label: t("Socket.Insert"), icon: "fa-solid fa-gem", callback: (event, button) => button.form.elements.cypher.value},
    rejectClose: false
  });
  const cypher = id && actor.items.get(id);
  if (cypher) return cs.socketCypher(cypher, artifact, slot);
}

/** Single-use cyphers are archived after use, so confirm first. */
async function useSocketed(actor, cypher) {
  if (!cypher) return;
  if (!cs.cypherSocket(cypher).reusable) {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: {title: t("Socket.UseTitle")},
      classes: [CHILD_CLASS],
      content: `<p>${t("Socket.UseConfirm", {name: Handlebars.escapeExpression(cypher.name)})}</p>`,
      rejectClose: false
    });
    if (!confirmed) return;
  }
  return cs.useSocketed(actor, cypher);
}

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Play the close animation, then remove the element. */
function animateOut(el) {
  el.removeEventListener("click", el._ccsClick);
  if (reducedMotion()) return el.remove();
  el.classList.add("is-closing");
  el.addEventListener("animationend", () => el.remove(), {once: true});
  setTimeout(() => el.remove(), 300);
}

/** Set the frame (rarity) class and the sheet's frame suite. */
function applyFrame(el, sheet, frameKey) {
  for (const cls of [...el.classList]) if (cls.startsWith("frame-")) el.classList.remove(cls);
  if (frameKey) el.classList.add(`frame-${frameKey}`);
  el.classList.toggle("ccs-hc", !!sheet.element?.querySelector(".ccs-root.ccs-hc"));
}

const frameOf = card => [...card.classList].find(cls => cls.startsWith("frame-"))?.slice(6);

class CardPopoverManager {
  #el = null;
  #sheet = null;
  #itemId = null;
  #groupKey = null;
  #anchor = null;
  #token = 0;
  /** Side card: a socketed cypher's large card, beside the main one. */
  #side = null;
  #sideItemId = null;

  #onKeyDown = event => {
    if (event.key !== "Escape" || !this.#el) return;
    // A child window (picker, confirmation) handles its own Escape.
    if (event.target.closest?.(`.${CHILD_CLASS}`) || document.querySelector(`.${CHILD_CLASS}`)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    this.close({restoreFocus: true});
  };

  #onPointerDown = event => {
    if (!this.#el) return;
    const target = event.target;
    if (this.#el.contains(target) || this.#side?.contains(target) || target.closest?.(`.${CHILD_CLASS}`)) return;
    // Card clicks are handled by the card itself (toggle / switch).
    if (target.closest?.(".ccs-card")) return;
    this.close();
  };

  #onResize = () => this.reposition();

  #onClick = event => {
    const button = event.target.closest("[data-popover-action]");
    if (button) {
      if (button.disabled) return;
      event.preventDefault();
      cs.noteClick(event);
      this.#runAction(button.dataset.popoverAction, event, button.dataset);
      return;
    }
    // The title covers the small card, so clicking it closes, like clicking the card.
    if (event.target.closest(".ccs-pop-header")) this.close({restoreFocus: event.detail === 0});
  };

  #onSideClick = event => {
    const button = event.target.closest("[data-popover-action]");
    if (button) {
      if (button.disabled) return;
      event.preventDefault();
      cs.noteClick(event);
      this.#runAction(button.dataset.popoverAction, event, button.dataset, this.#sideItemId);
      return;
    }
    if (event.target.closest(".ccs-pop-header")) this.closeSide();
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
    applyTheme(el, sheet);
    applyFrame(el, sheet, frameOf(card));
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", cs.displayName(item));
    if ("popover" in HTMLElement.prototype) el.setAttribute("popover", "manual");
    el.innerHTML = html;
    el.addEventListener("click", this.#onClick);
    el._ccsClick = this.#onClick;
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
    this.closeSide();
    window.removeEventListener("keydown", this.#onKeyDown, {capture: true});
    document.removeEventListener("pointerdown", this.#onPointerDown, {capture: true});
    window.removeEventListener("resize", this.#onResize);
    animateOut(this.#el);
    const anchor = this.#anchor;
    this.#setAnchor(null);
    this.#el = this.#sheet = this.#itemId = this.#groupKey = null;
    if (restoreFocus) anchor?.querySelector(".ccs-card-body")?.focus();
  }

  /** Close only if the popover belongs to this sheet (sheet close / minimize). */
  closeFor(sheet) {
    if (this.#sheet === sheet) this.close();
  }

  /** After a sheet re-render: re-anchor to the new card and refresh, or close if it's gone. */
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
    applyTheme(this.#el, sheet);
    applyFrame(this.#el, sheet, frameOf(card));
    const next = this.#el.querySelector(".ccs-pop-desc");
    if (next) next.scrollTop = scrollTop;
    this.#position();
    if (this.#sideItemId) await this.#renderSide();
  }

  /**
   * Where a window beside the large card goes: to its right, or to its left when there isn't
   * room on the right. Top-aligned with the large card, kept on screen. Null when closed.
   */
  besidePosition(width) {
    if (!this.#el) return null;
    const r = this.#el.getBoundingClientRect();
    const vw = window.innerWidth;
    const right = vw - r.right - GAP - MARGIN >= width || r.left - GAP - MARGIN < width;
    const left = right ? Math.min(r.right + GAP, vw - width - MARGIN) : Math.max(r.left - GAP - width, MARGIN);
    return {left: Math.round(left), top: Math.round(Math.max(r.top, MARGIN)), width};
  }

  /** Show a socketed cypher's large card beside this one, or hide it if it's already showing. */
  async toggleSide(itemId) {
    if (this.#side && this.#sideItemId === itemId) return this.closeSide();
    this.#sideItemId = itemId;
    return this.#renderSide();
  }

  closeSide() {
    if (this.#side) animateOut(this.#side);
    this.#side = this.#sideItemId = null;
  }

  async #renderSide() {
    const sheet = this.#sheet;
    const item = sheet?.actor.items.get(this.#sideItemId);
    if (!item) return this.closeSide();
    const token = this.#token;
    const html = await this.#renderContent(sheet, item);
    if (token !== this.#token || !this.#el) return;
    let el = this.#side;
    if (!el) {
      el = this.#side = document.createElement("section");
      el.className = "ccs-popover is-side";
      el.setAttribute("role", "dialog");
      if ("popover" in HTMLElement.prototype) el.setAttribute("popover", "manual");
      el.addEventListener("click", this.#onSideClick);
      el._ccsClick = this.#onSideClick;
      document.body.append(el);
      el.showPopover?.();
    }
    el.setAttribute("aria-label", cs.displayName(item));
    el.innerHTML = html;
    applyTheme(el, sheet);
    applyFrame(el, sheet, cs.cardData(item, sheet.actor).frameKey);
    this.#positionSide();
  }

  #positionSide() {
    if (!this.#side || !this.#el) return;
    const main = this.#el.getBoundingClientRect();
    const pos = this.besidePosition(main.width);
    Object.assign(this.#side.style, {left: `${pos.left}px`, top: `${pos.top}px`, bottom: "auto", width: `${pos.width}px`, height: `${main.height}px`});
    this.#side.dataset.placement = "side";
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

  /**
   * Cover the small card but leave its button row visible: grow upward from just above the
   * buttons, or downward from below them when there isn't room above.
   */
  #position() {
    const el = this.#el;
    const anchor = this.#anchor;
    if (!el || !anchor?.isConnected) return this.close();
    const a = anchor.getBoundingClientRect();

    // Close when the card is scrolled out of the sheet's visible area or the sheet is minimized.
    const viewport = anchor.closest(".ccs-scroll")?.getBoundingClientRect();
    if (!a.width || (viewport && (a.bottom < viewport.top || a.top > viewport.bottom))) return this.close();

    // The card's button row stays visible.
    const d20 = anchor.querySelector(".ccs-card-actions")?.getBoundingClientRect() ?? {top: a.bottom, bottom: a.bottom};
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(WIDTH, vw - (2 * MARGIN));
    const left = Math.clamp(a.left + (a.width / 2) - (width / 2), MARGIN, vw - width - MARGIN);
    const above = d20.top - GAP - MARGIN;
    const below = vh - d20.bottom - GAP - MARGIN;
    const growUp = above >= MIN_HEIGHT || above >= below;

    el.style.width = `${width}px`;
    el.style.left = `${left}px`;
    el.style.height = `${Math.max(Math.min(HEIGHT, growUp ? above : below), MIN_HEIGHT)}px`;
    if (growUp) {
      el.style.top = "auto";
      el.style.bottom = `${vh - d20.top + GAP}px`;
    } else {
      el.style.top = `${d20.bottom + GAP}px`;
      el.style.bottom = "auto";
    }
    el.dataset.placement = growUp ? "up" : "down";
    this.#positionSide();
  }

  async #runAction(action, event, data = {}, itemId = this.#itemId) {
    if (action === "close") return this.close({restoreFocus: true});
    const sheet = this.#sheet;
    const item = sheet?.actor.items.get(itemId);
    if (!item) return itemId === this.#itemId ? this.close() : this.closeSide();
    if (!sheet.isEditable && !READ_ONLY_ACTIONS.has(action)) return;

    // Alt-click on archive deletes (confirmed), as on the default sheet. Alt is read from the
    // click, since Foundry's key tracker can miss it.
    if (action === "archiveItem" && (event?.altKey || game.keyboard.isModifierActive("Alt"))) action = "deleteItem";
    if (action === "deleteItem") {
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: {title: t("Popover.DeleteTitle")},
        classes: [CHILD_CLASS],
        content: `<p>${t("Popover.DeleteConfirm", {name: Handlebars.escapeExpression(item.name)})}</p>`,
        rejectClose: false
      });
      if (!confirmed) return;
      if (itemId === this.#itemId) this.close();
      else this.closeSide();
      return cs.deleteItem(sheet.actor, item);
    }
    return ACTIONS[action]?.(sheet.actor, item, data);
  }
}

export const CardPopover = new CardPopoverManager();
