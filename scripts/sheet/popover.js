/**
 * The large card: one element on the sheet window's <body>, so no scroll container clips it
 * (spec §5). One is open at a time across all sheets. Beside it, a side panel shows either a
 * socketed cypher's card or the socket picker. Everything lives in the sheet's own window, so a
 * detached sheet keeps its cards with it; confirmations are inline, not separate dialogs.
 */

import {TEMPLATE_PATH, t} from "../constants.js";
import * as cs from "../adapter/cypher.js";
import {applyTheme} from "./theme.js";

const GAP = 6;
const MARGIN = 8;
const WIDTH = 360;
/** Fixed size, plus the sockets section when there is one; shrinks only when the window can't fit it. */
const HEIGHT = 420;
const MIN_HEIGHT = 200;

/**
 * Large card actions. Each receives (actor, item, data, manager), `data` being the button's
 * dataset. Charges and sockets act on the artifact: the item itself, or its linked artifact.
 */
const ACTIONS = {
  payItem: (actor, item) => cs.payItem(actor, item),
  castSpell: (actor, item) => cs.castSpell(actor, item),
  quantityDown: (actor, item) => cs.adjustQuantity(item, -1),
  quantityUp: (actor, item) => cs.adjustQuantity(item, 1),
  resourceDown: (actor, item) => cs.adjustResource(actor, cs.artifactHost(actor, item), -1),
  resourceUp: (actor, item) => cs.adjustResource(actor, cs.artifactHost(actor, item), 1),
  socketPick: (actor, item, data, m) => m.openPicker(cs.artifactHost(actor, item), Number(data.slot)),
  socketInsert: async (actor, artifact, data, m) => {
    const cypher = actor.items.get(data.cypherId);
    m.closeSide();
    if (cypher && artifact) return cs.socketCypher(cypher, artifact, Number(data.slot));
  },
  useSocketed: async (actor, item, data, m) => {
    const cypher = actor.items.get(data.cypherId);
    if (!cypher) return;
    // Single-use cyphers are archived after use, so confirm first.
    if (!cs.cypherSocket(cypher).reusable
      && !await m.confirm(t("Socket.UseConfirm", {name: esc(cypher.name)}), t("Socket.UseShort"))) return;
    return cs.useSocketed(actor, cypher);
  },
  unsocketCypher: (actor, item, data) => {
    const cypher = actor.items.get(data.cypherId);
    return cypher && cs.unsocketCypher(cypher);
  },
  showSocketed: (actor, item, data, m) => m.toggleSide(data.cypherId),
  closeSide: (actor, item, data, m) => m.closeSide(),
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
const READ_ONLY_ACTIONS = new Set(["sendToChat", "showSocketed", "closeSide"]);

const esc = value => Handlebars.escapeExpression(String(value ?? ""));

/** Play the close animation, then remove the element. */
function animateOut(el) {
  el.removeEventListener("click", el._ccsClick);
  const win = el.ownerDocument.defaultView ?? window;
  if (win.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return el.remove();
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

/** A large-card element. Built with the main document and adopted by the sheet's window. */
function makeCard(doc, className, onClick) {
  const el = document.createElement("section");
  el.className = className;
  el.setAttribute("role", "dialog");
  if ("popover" in HTMLElement.prototype) el.setAttribute("popover", "manual");
  el.addEventListener("click", onClick);
  el._ccsClick = onClick;
  doc.body.append(el);
  el.showPopover?.();
  return el;
}

/** The socket picker: eligible cyphers for one socket, or why there are none. */
function pickerHtml(actor, artifact, slot) {
  const {key} = cs.socketSettings(artifact);
  const eligible = key ? cs.eligibleCyphers(actor, artifact) : [];
  const body = !key
    ? `<p class="ccs-muted">${esc(t("Socket.NoKey", {name: artifact.name}))}</p>`
    : !eligible.length
      ? `<p class="ccs-muted">${esc(t("Socket.NoneEligible", {key}))}</p>`
      : eligible.map(c => `<button type="button" class="ccs-socket-choice" data-popover-action="socketInsert" data-cypher-id="${c.id}" data-slot="${slot}">
          <img src="${esc(c.img)}" alt=""><span>${esc(c.name)}</span>
          ${c.system.basic?.level ? `<span class="ccs-muted">${esc(t("Card.Level", {n: c.system.basic.level}))}</span>` : ""}
        </button>`).join("");
  return `<header class="ccs-pop-header">
      <span class="ccs-cap ccs-cap-top frame-${cs.cardData(artifact, actor).frameKey}" aria-hidden="true"></span>
      <h3>${esc(t("Socket.PickHeading"))}</h3>
      <span class="ccs-pop-type">${esc(artifact.name)}</span>
    </header>
    <div class="ccs-pop-desc ccs-socket-choices">${body}</div>
    <footer class="ccs-pop-bar">
      <button type="button" class="ccs-pop-control" data-popover-action="closeSide"
              data-tooltip="${esc(t("Socket.Cancel"))}" aria-label="${esc(t("Socket.Cancel"))}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
    </footer>`;
}

class CardPopoverManager {
  #el = null;
  #sheet = null;
  #itemId = null;
  #groupKey = null;
  #anchor = null;
  #token = 0;
  /** The sheet's window and document (a detached sheet has its own). */
  #win = globalThis.window;
  #doc = globalThis.document;
  /** Side panel beside the large card: a socketed cypher's card, or the socket picker. */
  #side = null;
  #sideItemId = null;
  #sideSlot = null;
  #sideMode = null;
  /** An open inline confirmation's resolver. */
  #confirming = null;

  #onKeyDown = event => {
    if (event.key !== "Escape" || !this.#el) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    // Escape backs out one step: a confirmation, then the side panel, then the large card.
    if (this.#confirming) return this.#confirming(false);
    if (this.#side) return this.closeSide();
    this.close({restoreFocus: true});
  };

  #onPointerDown = event => {
    if (!this.#el) return;
    const target = event.target;
    if (this.#el.contains(target) || this.#side?.contains(target)) return;
    // Card clicks are handled by the card itself (toggle / switch).
    if (target.closest?.(".ccs-card")) return;
    this.close();
  };

  #onResize = () => this.reposition();

  #click(event, itemId, inSide) {
    const confirm = event.target.closest("[data-ccs-confirm]");
    if (confirm) return this.#confirming?.(confirm.dataset.ccsConfirm === "yes");
    const button = event.target.closest("[data-popover-action]");
    if (button) {
      if (button.disabled) return;
      event.preventDefault();
      cs.noteClick(event);
      this.#runAction(button.dataset.popoverAction, event, button.dataset, itemId, inSide);
      return;
    }
    return true;
  }

  #onClick = event => {
    // The title covers the small card, so clicking it closes, like clicking the card.
    if (this.#click(event, this.#itemId, false) && event.target.closest(".ccs-pop-header")) {
      this.close({restoreFocus: event.detail === 0});
    }
  };

  #onSideClick = event => {
    if (this.#click(event, this.#sideItemId, true) && event.target.closest(".ccs-pop-header")) this.closeSide();
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

    this.#doc = sheet.element.ownerDocument ?? document;
    this.#win = this.#doc.defaultView ?? window;
    const el = makeCard(this.#doc, "ccs-popover", this.#onClick);
    applyTheme(el, sheet);
    applyFrame(el, sheet, frameOf(card));
    el.setAttribute("aria-label", cs.displayName(item));
    el.innerHTML = html;

    this.#el = el;
    this.#sheet = sheet;
    this.#itemId = card.dataset.itemId;
    this.#groupKey = card.dataset.groupKey;
    this.#setAnchor(card);
    this.#position();

    this.#win.addEventListener("keydown", this.#onKeyDown, {capture: true});
    this.#doc.addEventListener("pointerdown", this.#onPointerDown, {capture: true});
    this.#win.addEventListener("resize", this.#onResize);

    if (keyboard) el.querySelector("button")?.focus();
  }

  close({restoreFocus = false} = {}) {
    this.#token++;
    if (!this.#el) return;
    this.#confirming?.(false);
    this.closeSide();
    this.#win.removeEventListener("keydown", this.#onKeyDown, {capture: true});
    this.#doc.removeEventListener("pointerdown", this.#onPointerDown, {capture: true});
    this.#win.removeEventListener("resize", this.#onResize);
    animateOut(this.#el);
    const anchor = this.#anchor;
    this.#setAnchor(null);
    this.#el = this.#sheet = this.#itemId = this.#groupKey = null;
    if (restoreFocus) anchor?.querySelector(".ccs-card-body")?.focus();
  }

  /** Close only if the popover belongs to this sheet (sheet close, minimize, detach, attach). */
  closeFor(sheet) {
    if (this.#sheet === sheet) this.close();
  }

  /** After a sheet re-render: re-anchor to the new card and refresh, or close if it's gone. */
  async refresh(sheet) {
    if (!this.#el || this.#sheet !== sheet) return;
    const escape = CSS.escape;
    const root = sheet.element;
    const card = root.querySelector(`.ccs-card[data-item-id="${escape(this.#itemId)}"][data-group-key="${escape(this.#groupKey)}"]`)
      ?? root.querySelector(`.ccs-card[data-item-id="${escape(this.#itemId)}"]`);
    const item = sheet.actor.items.get(this.#itemId);
    if (!card || !item || card.hidden) return this.close();

    this.#groupKey = card.dataset.groupKey;
    this.#setAnchor(card);
    const token = this.#token;
    const html = await this.#renderContent(sheet, item);
    if (token !== this.#token || !this.#el) return;
    const scroller = this.#el.querySelector(".ccs-pop-desc");
    const scrollTop = scroller?.scrollTop ?? 0;
    this.#confirming?.(false);
    this.#el.innerHTML = html;
    applyTheme(this.#el, sheet);
    applyFrame(this.#el, sheet, frameOf(card));
    const next = this.#el.querySelector(".ccs-pop-desc");
    if (next) next.scrollTop = scrollTop;
    this.#position();
    if (this.#sideMode) await this.#renderSide();
  }

  reposition() {
    if (this.#el) this.#position();
  }

  /**
   * Where a panel beside the large card goes: to its right, or to its left when there isn't
   * room on the right. Top-aligned with the large card, kept in the window. Null when closed.
   */
  besidePosition(width) {
    if (!this.#el) return null;
    const r = this.#el.getBoundingClientRect();
    const vw = this.#win.innerWidth;
    const right = vw - r.right - GAP - MARGIN >= width || r.left - GAP - MARGIN < width;
    const left = right ? Math.min(r.right + GAP, vw - width - MARGIN) : Math.max(r.left - GAP - width, MARGIN);
    return {left: Math.round(left), top: Math.round(Math.max(r.top, MARGIN)), width};
  }

  /** Show a socketed cypher's large card beside this one, or hide it if it's already showing. */
  async toggleSide(itemId) {
    if (this.#sideMode === "card" && this.#sideItemId === itemId) return this.closeSide();
    this.#sideMode = "card";
    this.#sideItemId = itemId;
    this.#sideSlot = null;
    return this.#renderSide();
  }

  /** Show the socket picker for one of the artifact's sockets beside the large card. */
  async openPicker(artifact, slot) {
    if (!artifact) return;
    this.#sideMode = "picker";
    this.#sideItemId = artifact.id;
    this.#sideSlot = slot;
    return this.#renderSide();
  }

  closeSide() {
    if (this.#side) animateOut(this.#side);
    this.#side = this.#sideItemId = this.#sideSlot = this.#sideMode = null;
  }

  async #renderSide() {
    const sheet = this.#sheet;
    const item = sheet?.actor.items.get(this.#sideItemId);
    if (!item || !this.#el) return this.closeSide();
    const token = this.#token;
    const picker = this.#sideMode === "picker";
    const html = picker ? pickerHtml(sheet.actor, item, this.#sideSlot) : await this.#renderContent(sheet, item);
    if (token !== this.#token || !this.#el) return;
    this.#side ??= makeCard(this.#doc, "ccs-popover is-side", this.#onSideClick);
    const el = this.#side;
    el.classList.toggle("is-picker", picker);
    el.setAttribute("aria-label", picker ? item.name : cs.displayName(item));
    el.innerHTML = html;
    applyTheme(el, sheet);
    applyFrame(el, sheet, cs.cardData(item, sheet.actor).frameKey);
    this.#positionSide();
    if (picker) el.querySelector(".ccs-socket-choice")?.focus();
  }

  #positionSide() {
    if (!this.#side || !this.#el) return;
    const main = this.#el.getBoundingClientRect();
    const pos = this.besidePosition(main.width);
    Object.assign(this.#side.style, {left: `${pos.left}px`, top: `${pos.top}px`, bottom: "auto", width: `${pos.width}px`, height: `${main.height}px`});
    this.#side.dataset.placement = "side";
  }

  /**
   * Ask for confirmation inside a card, above its action bar. Resolves true or false; a new
   * confirmation, Escape or a re-render cancels the open one.
   */
  confirm(message, label, el = this.#el) {
    this.#confirming?.(false);
    if (!el) return Promise.resolve(false);
    const bar = document.createElement("div");
    bar.className = "ccs-pop-confirm";
    bar.setAttribute("role", "alertdialog");
    bar.innerHTML = `<p>${message}</p>
      <button type="button" class="ccs-btn" data-ccs-confirm="no">${esc(t("Popover.Cancel"))}</button>
      <button type="button" class="ccs-btn is-danger" data-ccs-confirm="yes">${esc(label)}</button>`;
    (el.querySelector(".ccs-pop-bar") ?? el.lastElementChild).before(bar);
    bar.querySelector('[data-ccs-confirm="yes"]').focus();
    return new Promise(resolve => {
      this.#confirming = result => {
        this.#confirming = null;
        bar.remove();
        resolve(result);
      };
    });
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
    const vw = this.#win.innerWidth;
    const vh = this.#win.innerHeight;
    const width = Math.min(WIDTH, vw - (2 * MARGIN));
    const left = Math.clamp(a.left + (a.width / 2) - (width / 2), MARGIN, vw - width - MARGIN);
    const above = d20.top - GAP - MARGIN;
    const below = vh - d20.bottom - GAP - MARGIN;
    const growUp = above >= MIN_HEIGHT || above >= below;

    el.style.width = `${width}px`;
    el.style.left = `${left}px`;
    // Sockets add their own height instead of squeezing the description.
    const extra = el.querySelector(".ccs-pop-sockets")?.offsetHeight ?? 0;
    el.style.height = `${Math.max(Math.min(HEIGHT + extra, growUp ? above : below), MIN_HEIGHT)}px`;
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

  async #runAction(action, event, data, itemId, inSide) {
    if (action === "close") return this.close({restoreFocus: true});
    const sheet = this.#sheet;
    const item = sheet?.actor.items.get(itemId);
    if (!item) return inSide ? this.closeSide() : this.close();
    if (!sheet.isEditable && !READ_ONLY_ACTIONS.has(action)) return;

    // Alt-click on archive deletes (confirmed), as on the default sheet. Alt is read from the
    // click, since Foundry's key tracker can miss it.
    if (action === "archiveItem" && (event?.altKey || game.keyboard.isModifierActive("Alt"))) {
      const card = inSide ? this.#side : this.#el;
      const message = t("Popover.DeleteConfirm", {name: esc(item.name)});
      if (!await this.confirm(message, t("Popover.Delete"), card)) return;
      if (inSide) this.closeSide();
      else this.close();
      return cs.deleteItem(sheet.actor, item);
    }
    return ACTIONS[action]?.(sheet.actor, item, data, this);
  }
}

export const CardPopover = new CardPopoverManager();
