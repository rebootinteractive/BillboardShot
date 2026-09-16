# Level Design Strategy

How the 40 levels are designed and produced. This is the reference for the
level-designer agent and for the people reviewing its work. The rules of each level
feature live in [level-features.md](level-features.md); this document covers everything
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
| Board size | up to 11 wide × 12 tall | The largest art on screen so far. Six full-size boards together checked in Phase 2 *(to verify)*. |
| Colors in a level | up to 12 | 8 today; 4 more added in Phase 1 *(to verify)*. |
| Lanes | 1–4 | 4 *(to verify, Phase 2)*. |
| Deck slots | 3–7 | 7 *(to verify, Phase 2)*. The strongest difficulty lever. |
| Container charges | 3–20 per container | Charges per color must still equal that color's pixels. |

Fixed for every level (tuning, not level design):

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

The level file keeps the final art the game plays, plus a record of the source picture,
group colors and overrides, so a reviewer can see what was changed and the checker can
confirm the art matches its source. The exact fields are settled in Phase 3.

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

### Curve across 40 levels

A starting shape only; the curve is discussed in detail before the 40-level plan
(Phase 6), once the difficulty score from Phase 4 exists.

- Early levels are close to always won (about 95% for the average bot).
- Difficulty rises in waves: a noticeably harder level about every 5 levels, followed by
  an easier one.
- The hardest levels sit around 40%.

### Levers, roughly from strongest to weakest

1. Deck slots.
2. Number of colors, and how many boards share each color.
3. Queue order: how often the next container is not usable yet.
4. Lanes: fewer lanes means fewer choices.
5. Features: locks and frozen boards restrict order; mystery pixels and hidden
   containers remove information; links demand two slots at once.
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
