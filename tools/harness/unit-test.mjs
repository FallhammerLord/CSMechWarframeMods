import {test} from "node:test";
import assert from "node:assert/strict";

// Unit tests for the adapter's own logic (no Foundry, no system checkout): node unit-test.mjs
const getProperty = (o, p) => p.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o);
Math.clamp = (v, a, b) => Math.min(Math.max(v, a), b);
globalThis.foundry = {utils: {getProperty}};
globalThis.game = {
  i18n: {localize: k => k, format: k => k},
  settings: {get() { throw new Error("no setting"); }},
  keyboard: {isModifierActive: () => false},
  user: {isGM: true},
  cyphersystem: {}
};
globalThis.ui = {notifications: {warn() {}, info() {}, error() {}}};
globalThis.ChatMessage = {create: async () => {}, getSpeaker: () => ({})};

const cs = await import("../../scripts/adapter/cypher.js");
const F = "cypher-card-sheet";

function item(id, type, {flags = {}, archived = false, identified = true, name = id} = {}) {
  return {
    id, type, name, img: "", flags: {[F]: flags}, updates: [],
    system: {archived, basic: {identified}},
    async update(u) { this.updates.push(u); }
  };
}

function actor(items, flags = {}) {
  return {
    items, updates: [], embedded: [],
    getFlag: (ns, key) => (ns === F ? flags[key] : undefined),
    async update(u) { this.updates.push(u); },
    async updateEmbeddedDocuments(type, u) { this.embedded.push(u); }
  };
}

const rod = (sockets = {enabled: true, count: 3, key: "rod"}) => item("rod", "artifact", {flags: {sockets}});
const cypher = (id, socket = {}, opts = {}) => item(id, "cypher", {...opts, flags: {socket: {enabled: true, key: "rod", ...socket}}});

test("parseDepletion reads the common forms", () => {
  assert.deepEqual(cs.parseDepletion("1 in d6"), {low: 1, high: 1, die: "1d6"});
  assert.deepEqual(cs.parseDepletion("1-2 in d10"), {low: 1, high: 2, die: "1d10"});
  assert.deepEqual(cs.parseDepletion("1 in [[/r d20]]"), {low: 1, high: 1, die: "1d20"});
  assert.deepEqual(cs.parseDepletion("<p>1–3 in 1d100</p>"), {low: 1, high: 3, die: "1d100"});
  assert.deepEqual(cs.parseDepletion("3-1 in d6"), {low: 1, high: 3, die: "1d6"});
  assert.equal(cs.parseDepletion("—"), null);
  assert.equal(cs.parseDepletion(undefined), null);
});

test("socketSettings clamps the count and trims the key", () => {
  assert.deepEqual(cs.socketSettings(rod({enabled: true, count: 0, key: " rod "})), {enabled: true, count: 1, key: "rod"});
  assert.equal(cs.socketSettings(rod({enabled: true, count: 9})).count, cs.MAX_SOCKETS);
  assert.deepEqual(cs.socketSettings(item("x", "artifact")), {enabled: false, count: 1, key: ""});
});

test("socketLayout places cyphers by slot, moving clashes and overflow to free slots", () => {
  const a = cypher("a", {artifactId: "rod", slot: 0}, {name: "A"});
  const b = cypher("b", {artifactId: "rod", slot: 0}, {name: "B"});
  const c = cypher("c", {artifactId: "rod", slot: 7}, {name: "C"});
  const slots = cs.socketLayout(actor([rod(), a, b, c])).get("rod");
  assert.deepEqual(slots.map(s => s?.id ?? null), ["a", "b", "c"]);
});

test("socketLayout leaves out cyphers that no longer fit", () => {
  const a = cypher("a", {artifactId: "rod", slot: 0});
  const b = cypher("b", {artifactId: "rod", slot: 1});
  const small = actor([rod({enabled: true, count: 1, key: "rod"}), a, b]);
  assert.deepEqual([...cs.socketedIds(small)], ["a"]);
  const off = actor([rod({enabled: false, count: 3, key: "rod"}), a]);
  assert.equal(cs.socketedIds(off).size, 0);
  const gone = actor([a]);
  assert.equal(cs.socketedIds(gone).size, 0);
});

test("eligibleCyphers matches the key loosely and skips unusable cyphers", () => {
  const items = [
    rod(),
    cypher("match", {key: " ROD "}, {name: "Zap"}),
    cypher("also", {key: "rod"}, {name: "Arc"}),
    cypher("placed", {artifactId: "rod", slot: 0}),
    cypher("archived", {}, {archived: true}),
    cypher("unknown", {}, {identified: false}),
    cypher("other", {key: "wand"}),
    item("plain", "cypher")
  ];
  assert.deepEqual(cs.eligibleCyphers(actor(items), items[0]).map(c => c.id), ["also", "match"]);
  assert.deepEqual(cs.eligibleCyphers(actor(items), rod({enabled: true, count: 1, key: ""})), []);
});

test("socketView summarises slots and hides on unidentified artifacts", () => {
  const a = cypher("a", {artifactId: "rod", slot: 1, spent: true, reusable: true}, {name: "Spark"});
  const view = cs.socketView(actor([rod(), a]), rod());
  assert.deepEqual(view.slots.map(s => s.id ?? null), [null, "a", null]);
  assert.equal(view.anySpent, true);
  const hidden = rod();
  hidden.system.basic.identified = false;
  assert.equal(cs.socketView(actor([hidden]), hidden), null);
});

test("refreshSockets clears only spent marks on that artifact", async () => {
  const a = cypher("a", {artifactId: "rod", slot: 0, spent: true});
  const b = cypher("b", {artifactId: "rod", slot: 1});
  const act = actor([rod(), a, b]);
  await cs.refreshSockets(act, act.items[0]);
  assert.deepEqual(act.embedded, [[{_id: "a", [`flags.${F}.socket.spent`]: false}]]);
});

test("useSocketed marks reusable cyphers spent and archives single-use ones", async () => {
  const reusable = cypher("r", {artifactId: "rod", slot: 0, reusable: true});
  await cs.useSocketed(actor([reusable]), reusable);
  assert.deepEqual(reusable.updates, [{[`flags.${F}.socket.spent`]: true}]);
  const single = cypher("s", {artifactId: "rod", slot: 1});
  await cs.useSocketed(actor([single]), single);
  assert.deepEqual(single.updates, [{"system.archived": true, [`flags.${F}.socket`]: {artifactId: null, slot: null, spent: false}}]);
});

test("resourceOf needs a label and clamps the value", () => {
  assert.equal(cs.resourceOf(item("x", "artifact", {flags: {resource: {value: 2, max: 3}}})), null);
  assert.deepEqual(cs.resourceOf(item("x", "artifact", {flags: {resource: {label: " Charges ", value: 9, max: 3}}})),
    {label: "Charges", value: 3, max: 3, depleteAtZero: false});
  assert.equal(cs.resourceOf(item("x", "artifact", {identified: false, flags: {resource: {label: "C", max: 1}}})), null);
  assert.equal(cs.resourceOf(item("x", "cypher", {flags: {resource: {label: "C", max: 1}}})), null);
});

test("adjustResource stays within 0 and max", async () => {
  const full = item("x", "artifact", {flags: {resource: {label: "C", value: 3, max: 3}}});
  await cs.adjustResource(actor([full]), full, 1);
  assert.deepEqual(full.updates, []);
  await cs.adjustResource(actor([full]), full, -1);
  assert.deepEqual(full.updates, [{[`flags.${F}.resource.value`]: 2}]);
});

test("artifactHost follows links to artifacts only", () => {
  const art = rod();
  const linked = item("atk", "attack", {flags: {linkedArtifact: "rod"}});
  const toCypher = item("atk2", "attack", {flags: {linkedArtifact: "c"}});
  const broken = item("atk3", "attack", {flags: {linkedArtifact: "missing"}});
  const tag = item("tag", "tag", {flags: {linkedArtifact: "rod"}});
  const act = actor([art, linked, toCypher, broken, tag, cypher("c")]);
  assert.equal(cs.artifactHost(act, art), art);
  assert.equal(cs.artifactHost(act, linked), art);
  assert.equal(cs.artifactHost(act, toCypher), null);
  assert.equal(cs.artifactHost(act, broken), null);
  assert.equal(cs.artifactHost(act, tag), null);
});

test("roll effects are independent and read the 0.8.0 flag", async () => {
  assert.deepEqual(cs.rollEffects(actor([], {effect: {kind: "major"}})), {minor: false, major: true});
  assert.deepEqual(cs.rollEffects(actor([], {effects: {minor: true, major: true}})), {minor: true, major: true});
  const legacy = actor([], {effect: {kind: "minor"}});
  await cs.setRollEffect(legacy, "major", true);
  assert.deepEqual(legacy.updates, [{[`flags.${F}.effects`]: {minor: true, major: true}, [`flags.${F}.-=effect`]: null}]);
});
