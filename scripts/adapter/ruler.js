/**
 * Per-actor movement ranges on the token ruler. The system bands waypoints by fixed distances
 * (token-ruler.js getCategory); for an actor with custom ranges, the same bands are recomputed
 * with its distances. Everything else stays the system's.
 * The system's Token class builds its ruler class directly, so the ruler's four label and style
 * methods are wrapped instead of replacing the class. Baseline: cyphersystem v3.5.2.
 */

import {MODULE_ID} from "../constants.js";
import {MOVEMENT_BANDS} from "./cypher.js";

const WRAPPED = Symbol.for(`${MODULE_ID}.rulerWrapped`);

/** System defaults per unit family (mirrors token-ruler.js getCategory). */
const DEFAULTS = {
  m: {rounding: 0.5, ...Object.fromEntries(MOVEMENT_BANDS.map(b => [b.key, b.m]))},
  ft: {rounding: 1, ...Object.fromEntries(MOVEMENT_BANDS.map(b => [b.key, b.ft]))}
};

/** Band label keys and colours, in order (mirrors token-ruler.js getCategory). */
const BANDS = [
  {key: "immediate", label: "CYPHERSYSTEM.Immediate", color: 0x0000ff},
  {key: "short", label: "CYPHERSYSTEM.Short", color: 0x008000},
  {key: "long", label: "CYPHERSYSTEM.Long", color: 0xffa500},
  {key: "veryLong", label: "CYPHERSYSTEM.VeryLong", color: 0xff0000}
];
const BEYOND_COLOR = 0x808080;

function unitFamily(unit) {
  if (["m", "meter", "metre", game.i18n.format("CYPHERSYSTEM.UnitDistanceMeter")].includes(unit)) return "m";
  if (["ft", game.i18n.format("CYPHERSYSTEM.UnitDistanceFeet")].includes(unit)) return "ft";
  return null;
}

/** The actor's custom distances, or null when none are set. */
function customRanges(token) {
  const saved = token?.actor?.getFlag(MODULE_ID, "movementRanges");
  if (!saved) return null;
  const ranges = {};
  for (const {key} of MOVEMENT_BANDS) {
    const value = Number(saved[key]);
    if (value > 0) ranges[key] = value;
  }
  return Object.keys(ranges).length ? ranges : null;
}

function category(token, cost, unit, ranges) {
  const base = DEFAULTS[unitFamily(unit)] ?? {};
  const limits = {...base, ...ranges};
  if (token.scene.grid.type === 0 && base.rounding) cost = cost.toNearest(base.rounding);
  const band = BANDS.find(b => limits[b.key] !== undefined && cost <= limits[b.key]);
  return {cost, label: band ? game.i18n.format(band.label) : undefined, color: band?.color ?? BEYOND_COLOR};
}

function wrap(proto, name, adjust) {
  const original = proto?.[name];
  if (typeof original !== "function" || original[WRAPPED]) return;
  const wrapped = function(...args) {
    const result = original.apply(this, args);
    try {
      const ranges = customRanges(this.token);
      if (ranges && result) adjust.call(this, result, ranges, ...args);
    } catch (err) {
      console.warn(`${MODULE_ID} | Could not apply custom movement ranges (${name})`, err);
    }
    return result;
  };
  wrapped[WRAPPED] = true;
  proto[name] = wrapped;
}

/** Recolour a style result, leaving hidden results (no colour key) alone. */
function recolour(style, ranges, waypoint) {
  if (!("color" in style)) return;
  const cost = parseFloat(waypoint.measurement.cost);
  style.color = category(this.token, cost, this.token.scene.grid.units, ranges).color;
}

export function registerMovementRuler() {
  const proto = CONFIG.Token.rulerClass?.prototype;
  if (!proto) return;

  wrap(proto, "_getWaypointLabelContext", function(context, ranges) {
    if (!context.cyphersystemLabel) return;
    const unit = context.cost.units;
    const cat = category(this.token, parseFloat(context.cost.total), unit, ranges);
    context.cyphersystemLabel = cat.label
      ? game.i18n.format("CYPHERSYSTEM.DistanceLabelCategory", {category: cat.label, distance: cat.cost, unit})
      : game.i18n.format("CYPHERSYSTEM.DistanceLabel", {distance: cat.cost, unit});
  });
  wrap(proto, "_getWaypointStyle", recolour);
  wrap(proto, "_getSegmentStyle", recolour);
  wrap(proto, "_getGridHighlightStyle", recolour);
}
