/**
 * Movement per action on the token ruler.
 *
 * The Cypher System ruler labels each waypoint with a fixed range band (immediate, short,
 * long). When an actor has a "movement per action" value set on this sheet, the label also
 * shows how many move actions the path costs, e.g. "Short (40 ft) · 2 actions".
 *
 * The system's Token class constructs its own ruler class directly, so CONFIG.Token.rulerClass
 * can't be swapped. Instead the label method on the active ruler class is wrapped. Bands,
 * colours, and everything else stay the system's. Actors without the setting are untouched.
 */

import {MODULE_ID, t} from "../constants.js";

const WRAPPED = Symbol.for(`${MODULE_ID}.rulerWrapped`);

function appendActions(token, context) {
  if (!context?.cyphersystemLabel) return;
  const perAction = Number(token?.actor?.getFlag(MODULE_ID, "movePerAction"));
  if (!(perAction > 0)) return;
  const cost = parseFloat(context.cost?.total);
  if (!(cost > 0)) return;
  // Small tolerance so exact multiples (e.g. 30 / 15) aren't rounded up by float error.
  const actions = Math.max(1, Math.ceil((cost / perAction) - 1e-6));
  context.cyphersystemLabel += ` · ${t(actions === 1 ? "Ruler.Action" : "Ruler.Actions", {n: actions})}`;
}

export function registerMovementRuler() {
  const proto = CONFIG.Token.rulerClass?.prototype;
  const original = proto?._getWaypointLabelContext;
  if (typeof original !== "function" || original[WRAPPED]) return;

  const wrapped = function(waypoint, state) {
    const context = original.call(this, waypoint, state);
    try {
      appendActions(this.token, context);
    } catch (err) {
      console.warn(`${MODULE_ID} | Could not add move actions to ruler label`, err);
    }
    return context;
  };
  wrapped[WRAPPED] = true;
  proto._getWaypointLabelContext = wrapped;
}
