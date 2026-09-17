# Level Design Strategy

How the 40 levels are designed and produced. This is the reference for the
level-designer agent and for the people reviewing its work. The rules of each level
feature live in [level-features.md](level-features.md), and the practical rules for
building a good level (mechanics, traps, queue construction, recipes, checklist) live in
[level-designer-rules.md](level-designer-rules.md); this document covers everything
around them: limits, art, difficulty, pacing, and the production process.

Status: decisions agreed. Items marked *(to verify)* are checked on screen in the phase
named next to them.

---

## 1. Level limits

Every one of these is chosen per level. The designer may use any value up to the limit,
never beyond it.

| Parameter | Range | Notes |
|---|---|---|
| Boards | 1–6 | |
| Board size | up to 16 wide × 17 tall | Pixels are 0.15 world units, so a full board is the same size as the earlier 11×12 boards at 0.22. Levels 1–3 and the feature test levels still use 11×12 art and set `cellSize: 0.22`. With 5–6 boards prefer art with a silhouette over full rectangles. |
| Colors in a level | up to 12 | |
| Lanes | 1–4 | |
| Container charges | 3–40 per container | Raised from 20 for the 16×17 resolution. Charges per color must still equal that color's pixels. |
| Pixels in a level | up to 1000 *(provisional)* | Raised for the 16×17 resolution, where a picture has about 140 pixels (median). Calibrated against play time in Phase 4. |

Fixed for every level (tuning, not level design):

- Deck slots: 5. A global rule, set as `deckSlots` in the tuning file; levels don't choose it.

- Containers visible per lane: 4.
- Camera, speeds, carousel feel: the tuning file, `src/shared/defaults.json`.

## 2. Player model

The simulator and the bots play by the same actions a real player can reliably take.
It deliberately does not model precise timing, such as stopping a pull after exactly
three pixels.

Only one board is ever in focus, so the carousel is a discrete choice, not a rotation.
A player has two actions:

1. **Send** a lane head to the deck, following the send rules (free slot, linked partner
   at the front with two free slots).
2. **Choose a board** to focus. Every deck container whose color is exposed on that
   board then pulls until it is full or the board has no more of its color exposed.

Everything else follows from the game rules: reveals, keys, frozen boards counting
finished containers, and the stuck rule.

The simulator shares its rules with the game (one rules module used by both, built in
Phase 4), and bot replays are checked against the real game so the two never disagree.

## 3. Art library

Pictures are designed once, reviewed, and reused across levels. The level designer
picks from approved pictures and never draws art inside a level.

### Format

A picture is its shape divided into numbered color groups. Colors are **not** fixed in
the library; the designer assigns a color to each group per level, because colors are
the main difficulty lever.

```json
{
  "id": "apple",
  "name": "Apple",
  "tags": ["food", "fruit"],
  "status": "approved",
  "art": [
    ".....22..",
    "....22...",
    "..11211..",
    ".1111111.",
    "111111111",
    "111111111",
    "111111111",
    ".1111111.",
    "..11.11.."
  ],
  "groups": {
    "1": { "part": "fruit", "suggest": ["red", "yellow", "green"] },
    "2": { "part": "leaf", "suggest": ["green"] }
  }
}
```

- Group ids are digits `1`–`9`, so they are never confused with color letters or
  lowercase mystery letters. `.` is empty.
- A picture is one connected shape: every pixel reaches every other through up, down,
  left or right neighbors. Separate islands are rejected by the checker, because a board
  should not start in pieces.
- `suggest` keeps a picture recognizable (a leaf stays green) without forcing one color.
- `status` is `draft`, `approved` or `rejected`. Only approved pictures are used.

### Computed facts

A script computes these for each picture so the designer does not have to work them out
from the grid:

- Pixel count per group.
- **Exposed at start:** groups with a pixel at the bottom of a column.
- **Blocks:** which groups must be cleared before a group becomes reachable.
- **Mystery candidates:** groups where every pixel has another pixel beneath it. Only
  these can be hidden without revealing at the start (see level-features.md).

### Overriding pixels in a level

A level uses a library picture as its source but may change it. The library picture is
never edited; the changes live in the level.

- **Group colors:** each group gets a color for this level.
- **Pixel overrides:** individual pixels can be given a different color, even one
  unrelated to their group, such as a single blue pixel in the middle of a red apple.

A single odd pixel barely changes how a picture reads, but it can change difficulty a
lot: it blocks its column until a container of its color comes, it splits a color region,
and inside a mystery group it stays hidden and interrupts the flood. Overrides should
stay few enough that the picture is still recognizable.

The level file keeps the final art the game plays, plus a `source` record, so a reviewer
can see what was changed and the checker can confirm the art still matches its source:

```json
{
  "name": "Apple",
  "art": ["....."],
  "source": {
    "picture": "apple",
    "colors": { "1": "red", "2": "green" },
    "hidden": ["2"],
    "overrides": [{ "col": 4, "row": 5, "color": "blue" }]
  }
}
```

- `colors` gives every group a color. `hidden` lists groups shown as mystery pixels.
- An override's `hidden` defaults to its group's; set it to show or hide just that pixel.

### Where the library lives

- Pictures: `src/art/pictures/<id>.json`, one file per picture. `origin` records whether a
  picture was drawn or converted; converted pictures carry their source, license and URL,
  and the license notices live in `src/art/THIRD_PARTY_NOTICES.md`. Only sources licensed
  for commercial use are converted (currently Fluent Emoji, MIT).
- Checks and rendering: `src/art/library.ts`. Computed facts: `src/art/analyze.ts`.
- Review page: `?gallery` on the local dev server. Approve and Reject save the status and
  note straight into the picture file. "Play preview" opens `?art=<id>`, the picture as a
  playable one-board level in its first suggested colors.

### Merging groups

If the designer gives two touching groups the same color, they become one region in
play: one flood reveal uncovers both, and they count as one color group for pulling.
This can be used on purpose, for example to make a small hidden eye part of a large
hidden face.

## 4. Difficulty

Difficulty is measured, not guessed.

- **Win rate:** bots of three skill levels (careless, average, careful) play each level
  many times. The average bot's win rate is the level's difficulty score.
- **Supporting numbers:**
  - Whether the level can be won at all (required).
  - Tightest deck moment: the fewest free slots at any point in a good playthrough.
  - Length: number of containers, aiming at roughly 2–3 minutes of play.
- **Calibration:** the scores are tuned until they match the designer's own sense of
  difficulty from playing the same levels (Phase 4).

### The simulator

`npm run sim` reports on every level in play order; `npm run sim -- <level files>` reports
on specific ones (`--runs`, `--careful`, `--json <file>`, `--notes`). The code lives in
`src/rules/`:

- `core.ts`: decision rules shared with the game (which container pulls, which pixel it
  takes, the send rules, the stuck check, the reveal flood, the next front board).
- `sim.ts`: the level as discrete moves. A move sends a lane head or chooses the front
  board; every container on the deck then pulls until nothing more can be pulled.
- `bots.ts`: three bots deciding only from what a player can see.
  - **careless** follows a simple move score with a lot of randomness.
  - **average** plays its top three moves out once each, about ten moves ahead, and acts on
    impulse a quarter of the time.
  - **careful** plays its top five moves out three times each, to the end.
  The planning bots fill hidden pixel groups with colors guessed from the charges still
  unaccounted for, as a player could. They also have lapses (average 6% of moves, careful
  2%): a moment of inattention where they send whatever is at the front of a lane. Real
  players do this, so a level where one careless send clogs the deck scores harder than
  one that forgives it.
  The average bot also has an **opening rush**: for its first 8 sends it lapses at 50%.
  Playtesters mostly lost within their first ten sends, with most pixels still standing,
  because they sent the containers at the front of the lanes before checking whether they
  could pull. Fitting this to the first two playtesters raised the rank match between the
  bot's and the players' per-attempt win rates on levels 3–10 from 0.46 to about 0.7 and
  cut the average gap from 22 to 16 points. Both settings are calibration dials
  (`PLANNERS` in `src/rules/bots.ts`) to refit as more playtest data arrives.
- `solver.ts`: a search that sees everything and proves a level can be won.
- `lint.ts`: automatic checks from docs/level-designer-rules.md.
- `report.ts`: all of the above per level.

The report gives winnability, each bot's win rate, the difficulty score (the average bot's
win rate), moves, a rough play time, the tightest deck moment, the colors most often sent
with nothing to pull, and rule warnings and notes.

Replaying bot move lists in the real game gave the same result and the same remaining
pixel count in 18 of 18 playthroughs across the three hardest showcase levels. Play time is
a rough estimate (1.5 s per move, 0.06 s per pixel) until playtests calibrate it.

### Playtest data

Every attempt at a level is recorded in the player's own browser (`src/game/analytics.ts`):
level, level version, attempt number, result (win, lose, or abandoned when restarted or
left), engaged play time, idle time, containers sent, board changes, pixels left, and the
tightest deck moment. Play time only counts within 10 seconds of the last tap or swipe;
longer pauses (a player who puts the phone down) go to idle time instead. The
"Send results" button (top-left of the HUD, and on the win and lose screens) opens an email
to admin@reboot.ist with the results as CSV. When the results are too long for a mail link
they are also copied to the clipboard and downloaded as a file to paste or attach.

These results calibrate the difficulty score: compare real win rates and attempts per level
with the bots' win rates on the same levels. Save each player's export as a file in
`playtest/` and run `npm run playtest`: it drops unfinished attempts and exits before any
send, groups results by level version, and shows first-try win rate, attempts to win, win
time and board changes per level next to the simulator's numbers for the current version.
Exports from before results carried a version are matched to the first playtest deploy.

### Curve across 40 levels

A starting shape only; the curve is discussed in detail before the 40-level plan
(Phase 6), once the difficulty score from Phase 4 exists.

- Early levels are close to always won (about 95% for the average bot).
- Difficulty rises in waves: a noticeably harder level about every 5 levels, followed by
  an easier one.
- The hardest levels sit around 40%.

### Levers, roughly from strongest to weakest

Deck slots are the same in every level (5), so difficulty comes from what fills them:

1. Queue order: how often the next container is not usable yet.
2. Colors that wait for an unlock (locked and frozen boards).
3. Number of colors, and how many boards share each color.
4. Lanes: fewer lanes means fewer choices.
5. Features: mystery pixels and hidden containers remove information; links demand two
   slots at once.
6. Container sizes: many small containers need more slots over time; large ones stay on
   the deck longer.

## 5. Introducing features

- A feature's first level is easy and centered on that feature, with a one-line hint
  card explaining it.
- The next 2–3 levels mix it with earlier features before another new one arrives.
- The order of introduction is set in the 40-level plan (Phase 6).

## 6. Production phases

Each phase ends with a review. The next phase starts only after approval.

| # | Phase | Review |
|---|---|---|
| 0 | This document | Read and approve |
| 1 | Palette of 12 colors | Look on a phone; approve or swap colors |
| 2 | Layout at the limits | Look on screen; confirm or lower the limits |
| 3 | Art library, analyzer, `?gallery` | Approve or reject each picture, in batches |
| 4 | Rules module, simulator, bots, difficulty score | Play levels; calibrate the score |
| 5 | Designer workflow and report card; hint card | Review 3–5 trial levels |
| 6 | Detailed difficulty-curve discussion, then the 40-level plan | Approve the plan before generation |
| 7 | Levels in batches of 5–10 | Play each batch; feedback updates this document |
