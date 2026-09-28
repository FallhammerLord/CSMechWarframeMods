# Quest tracker: design spec

A system-agnostic quest tracker for Foundry VTT v14, styled like the Cypher Card Sheet, that
reads quests made with Forien's Quest Log (FQL). Written as the brief for a new module, before
its own repository exists. Working name: **Quest Board** (placeholder, see §10).

## 1. Why

- FQL is effectively unmaintained: its last release (0.9.0) is verified for Foundry v13 only, and
  the v14 fix is an unmerged pull request ([#160](https://github.com/Forien/foundryvtt-forien-quest-log/pull/160))
  with an unofficial zip.
- Worlds already hold FQL quests. They must keep working without FQL installed.
- The card sheet's look (frames, dark theme, high contrast) should carry over to quests.

## 2. Goals and non-goals

**Goals**
- Works in any game system; no system data read.
- Reads FQL quests with FQL removed or disabled.
- Quests are ordinary journal entries; Foundry's ownership decides who sees what.
- The card sheet's design rules (§7).

**Non-goals (for now)**
- Replacing every FQL feature on day one. See the phases in §6.
- A dependency on the Cypher Card Sheet. Shared styling is copied, not imported.

## 3. FQL data format (reference)

Read from FQL 0.9.0 source (MIT licence), `src/model/Quest.js`, `src/model/constants.js`,
`src/control/util/Utils.js`, `src/control/db/QuestDB.js`.

**Storage**
- One quest = one `JournalEntry` in the root journal folder named `_fql_quests`.
- All quest data is one object at `flags["forien-quest-log"].json`. The entry's name mirrors the
  quest name. Journal pages are not used.
- Sub-quests are separate entries, linked by id.

**Quest** (`flags["forien-quest-log"].json`)

| Field | Type | Meaning |
|---|---|---|
| `name` | string | Quest name |
| `status` | string | `available`, `active`, `completed`, `failed` or `inactive` (unknown → `inactive`) |
| `giver` | string or null | Foundry UUID of an Actor, Item or JournalEntry, or `"abstract"` for a custom giver |
| `giverData` | object or null | Cached `{uuid, name, img, hasTokenImg}` of the giver |
| `giverName` | string | Custom giver's name (for `abstract`) |
| `image` | string | `"actor"` or `"token"` (which image of a UUID giver), or an image path (for `abstract`) |
| `description` | string (HTML) | Player-facing text |
| `gmnotes` | string (HTML) | GM only |
| `playernotes` | string (HTML) | Player notes |
| `splash` | string | Splash image path |
| `splashPos` | string | `top`, `center` or `bottom` |
| `splashAsIcon` | boolean | Use the splash as the quest icon |
| `location`, `type` | string or null | Unused by FQL |
| `priority` | number | Unused by FQL |
| `parent` | string or null | Parent quest's journal id |
| `subquests` | string[] | Child quests' journal ids |
| `tasks` | Task[] | Objectives |
| `rewards` | Reward[] | Rewards |
| `date` | `{create, start, end}` | `Date.now()` ms or null; start set on active, end on completed/failed |

**Task** (objective): `{name, completed, failed, hidden, state, uuidv4}`. Three states: neither
flag (open), `completed`, or `failed`. FQL cycles open → completed → failed → open. `state` is a
derived CSS class; recompute, don't trust it.

**Reward**: `{type, data, hidden, locked, uuidv4}`.
- `type`: `"Item"`, `"Actor"` or `"Abstract"` (compare case-insensitively).
- `data`: `{uuid, name, img, hasTokenImg}`; abstract rewards have only `{name, img}`.
- `hidden`: players can't see it. `locked`: players can't drag it (items) or open it.

**Visibility** (FQL's rules, to reproduce)
- GM sees everything.
- `inactive` quests are hidden from players (except owners, with the world setting "trusted player edit").
- Otherwise a player sees a quest with at least Observer ownership on its entry.
- *Personal* quest: default ownership below Observer, but at least one non-GM player has Observer.
- Editing needs update permission on the entry (Owner, or GM).

**Other FQL state**
- Primary quest: world setting `forien-quest-log.primaryQuest` = journal entry id, or `""`. It's
  cleared when that quest stops being active.
- World settings worth mirroring: `allowPlayersAccept`, `allowPlayersCreate`, `allowPlayersDrag`,
  `countHidden`, `defaultPermission`, `trustedPlayerEdit`, `showTasks`.

**Reading without FQL active (to verify in v14)**
- `entry.getFlag("forien-quest-log", "json")` throws when that module isn't active (flag scope
  check). Read `entry.flags["forien-quest-log"]?.json` directly.
- `game.settings.get("forien-quest-log", "primaryQuest")` throws when the setting isn't
  registered. Read the stored world Setting document for key `forien-quest-log.primaryQuest`, or
  register a read-only mirror setting.
- Opening an FQL journal entry without FQL shows an empty journal. The new module should open its
  own quest view for entries that carry FQL data.

## 4. Compatibility decision

**Recommended: FQL's schema is the core record.** Quest Board reads and writes
`flags["forien-quest-log"].json` in the `_fql_quests` folder, and keeps anything new in its own
flags (`flags["quest-board"]`).

- Existing quests work with no migration.
- If FQL is ever revived, it still reads our quests.
- Our extras (frame tier, sort order, tracker state) never touch FQL's object.
- Cost: we carry FQL's field quirks, and writes must round-trip unknown fields untouched.

Writing FQL's flag scope while FQL is inactive must be tested in v14; if Foundry refuses it,
update with a full `flags` object via `entry.update`, as FQL itself does (`{diff: false}`).

Alternatives considered: a separate native format with a one-time import (clean, but FQL and
Quest Board then diverge), or read-only FQL (old quests frozen).

## 5. Look

Carry the card sheet's language:

- **Quest board:** a window with status tabs (Available, Active, Completed, Failed; Hidden for
  the GM) and a grid of uniform quest cards.
- **Small quest card:** splash or giver art, name, giver, objectives progress (`2 / 5`), a
  personal-quest marker, and a primary-quest marker.
- **Frames:** frame caps as on item cards. Tier from FQL's unused `priority` (or our own flag),
  so the GM can mark minor, major and legendary quests; the primary quest gets a distinct frame.
- **Large quest card:** opens over or beside the small card, as on the sheet. Description,
  objectives checklist, rewards, giver, player notes; GM notes for the GM only.
- **Status cues never by colour alone:** icon and label per status; objectives show open, ✓ and
  ✗ shapes as well as colour.
- **Themes:** Foundry light and dark, plus the high-contrast suite.

## 6. Features by phase

**Phase 1: read and run quests**
- Board with tabs, search, and the visibility rules in §3.
- Large quest card with objectives, rewards, giver and notes.
- GM: create a quest, edit text, set status, add, reorder, hide and cycle objectives, set primary.
- Players with Owner can tick objectives, as in FQL.
- Clicking an FQL journal entry opens its quest card.

**Phase 2**
- Tracker: a small always-on panel of active quests and their objectives (FQL's Quest Tracker),
  with the primary quest first.
- Rewards: drop items and actors onto a quest; players drag unlocked item rewards to their sheet.
- Player-created quests and accepting available quests, behind world settings.

**Phase 3**
- Sub-quests (parent / child navigation, progress roll-up).
- Chat posts for status changes.
- Keybindings: open the board, open the primary quest, toggle the tracker (FQL's defaults: Ctrl+Q,
  Ctrl+Shift+Q, Ctrl+Alt+Q).

## 7. Design rules carried over

- **Colour is never the only cue** (shapes, icons, labels, `aria-pressed` / `aria-expanded`).
- **Flags only:** nothing stored outside journal entries and settings. Unknown fields round-trip.
- **One adapter file** reads and writes FQL's object; the UI never touches the raw flag.
- **Inline confirmations** in the card, not dialogs; Escape steps back one layer.
- **Detached windows:** build panels in the app's own document, as the card sheet does.
- **Harness from day one:** a Node renderer with Foundry mocked, a computed-style snapshot
  check, unit tests for the adapter (FQL round-trip, visibility rules, task cycling), and a
  live-world checklist.

## 8. Architecture sketch

| Path | Purpose |
|---|---|
| `scripts/data/fql.js` | Read, normalise and write FQL quest objects; round-trip unknown fields |
| `scripts/data/visibility.js` | FQL's visibility and permission rules |
| `scripts/data/quests.js` | Queries: by status, primary, personal, sub-quests |
| `scripts/apps/board.js` | The board (ApplicationV2 + Handlebars) |
| `scripts/apps/quest-card.js` | The large quest card |
| `scripts/apps/tracker.js` | Phase 2 tracker |
| `styles/` | Tokens and frames copied from the card sheet |

## 9. Testing

- Unit: FQL objects from real worlds round-trip unchanged; each visibility case; task cycling;
  status change sets `date.start` / `date.end` as FQL does.
- Fixtures: export a few FQL quest entries from a live world (including sub-quests and all
  reward types) into the harness.
- Live checklist: with FQL removed, old quests appear, open and edit; with FQL (unofficial v14
  build) re-enabled, it still reads quests we edited.

## 10. Open questions

- Module name and id.
- Frame tier source: FQL's `priority` field, or our own flag.
- Should players be able to tick objectives with Observer only (needs a GM relay over sockets)?
- Keep the `_fql_quests` folder name for new quests, or allow any folder with a flag?
- Where the tracker sits on screen, and whether it's per player.
- Which FQL settings to mirror, and whether to read FQL's stored values when present.

## Sources

- [FQL repository](https://github.com/Forien/foundryvtt-forien-quest-log) (source read for §3)
- [PR #160: v14 compatibility](https://github.com/Forien/foundryvtt-forien-quest-log/pull/160)
