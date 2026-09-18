# Level Designer Workflow

How to make one level, from brief to reviewed level file. Written for the level-designer
agent; a person can follow it the same way.

Read first, once per session:

- [level-features.md](level-features.md): what each feature does and the level format.
- [level-designer-rules.md](level-designer-rules.md): the traps and levers. This workflow
  assumes you know them.
- [level-design-strategy.md](level-design-strategy.md): limits, the art library, how
  difficulty is measured.

## 1. Start from the level's slot

Each level comes with a slot: its place in the plan, a **target band** for the difficulty
score (the average bot's win rate, for example 55–75%), and what it is for: introducing a
feature, practicing one, a breather after a hard level, a peak. Until the 40-level plan
exists, the reviewer gives the slot.

Write the intent in one or two sentences before choosing anything. Every later choice
should serve it.

## 2. Choose pictures

- Browse `src/art/pictures/` or the gallery (`?gallery` on the dev server), or list what
  the library holds with `npm run art -- stats`. Pick pictures that belong together (a
  theme reads better than a random mix).
- Respect the reuse cap: a picture may not appear twice within eight levels, and may be
  used at most twice across the forty, the second time in a different color and a
  different job (see level-design-strategy.md, "Reusing pictures").
- Match the picture's **proportion** to the intent, not just its subject. A tall narrow
  board has deep columns and takes real digging; a wide flat board has many shallow
  columns and forgives mistakes. Small pictures of 40–80 pixels are how a level holds six
  boards without running long.
- Get their facts:

  ```
  npm run level -- facts sailboat whale crab
  ```

  For each group you get its pixels, whether it is exposed at the start or buried, which
  groups it rests on, whether it can be hidden as mystery pixels, and suggested colors.
- Keep the level within the limits: up to 6 boards, 12 colors and 1000 pixels. More boards
  and pixels mean a longer level; the report card estimates play time.

## 3. Assign colors

- Start from each group's suggested colors, so the picture reads as its subject.
- Decide which colors are **shared** between boards (easier to use, more carousel turning)
  and which belong to one board.
- Every color needs at least 3 pixels in the level. A group smaller than that (an eye, a
  nose) must take a color used elsewhere, usually a neighbor's.
- Count the colors. More colors means more containers competing for the 5 slots.

## 4. Add features

Only what the intent calls for.

- **Key lock:** put the key in a group of another board with `pick` `highest`, `middle` or
  `lowest`. Higher keys stay locked longer. The locked board's colors wait for the key.
- **Frozen board:** set the color and count. One finished container's worth (about 30–40)
  is gentle; more pushes hard toward that color. The color must be fillable from other
  boards.
- **Mystery pixels:** hide only groups the facts mark `mystery ok`, or they reveal at the
  start.
- **Odd pixels:** a planned blocker, one lever among many. Use a color that is available at
  that time, never one that only exists behind a lock.
- **Links and hidden containers:** give how many; the tuner places them.
- **Hint:** add a one-line `hint` when a feature appears for the first time.

## 5. Write the brief

Save it as `design/briefs/<id>.json`:

```json
{
  "id": "trial-01",
  "name": "Harbor Day",
  "intent": "Medium level with no new feature. ...",
  "target": { "min": 0.55, "max": 0.75 },
  "lanes": 3,
  "boards": [
    { "picture": "sailboat", "colors": { "1": "blue", "2": "orange", "3": "yellow", "4": "white" } },
    { "picture": "whale", "colors": { "1": "cyan", "2": "white", "3": "blue" }, "hidden": ["3"] },
    { "picture": "crab", "colors": { "1": "red", "2": "orange", "3": "white" },
      "lock": { "type": "frozen", "color": "cyan", "count": 30 } }
  ],
  "queue": { "hidden": 1, "links": 0 }
}
```

Fields:

| Field | Meaning |
|---|---|
| `target` | Band for the difficulty score, 0 to 1. |
| `lanes` | 1–4. Shapes the level; it is not a reliable difficulty lever (see level-designer-rules.md). |
| `boards[].colors` | Color per group; groups left out use the first suggestion. |
| `boards[].hidden` | Groups shown as mystery pixels. |
| `boards[].overrides` | Odd pixels: `{ "group": "1", "pick": "middle", "color": "blue" }` or an exact `col`/`row` (row from the top). |
| `boards[].key` | `{ "group": "2", "pick": "highest", "color": "gold" }` |
| `boards[].lock` | `{ "type": "key", "color": "gold" }` or `{ "type": "frozen", "color": "white", "count": 35 }` |
| `hint` | One line shown before the first attempt. |
| `containers.maxCharges` | Largest container (default 40). |
| `containers.split` | Exact container count for a color, e.g. `{ "white": 5 }`. |
| `queue.links`, `queue.hidden` | How many linked pairs and hidden containers to place. |
| `queue.order` | Optional explicit starting queue by color, lane by lane. |
| `queue.allowWarnings` | Rule warnings accepted on purpose, e.g. `["locked-only color"]` for a deliberate trap. |

## 6. Build, then tune

```
npm run level -- build design/briefs/trial-01.json
npm run level -- tune design/briefs/trial-01.json
```

`build` renders the boards and a starting queue and reports errors; fix every ERROR in the
brief before tuning (a color with fewer than 3 pixels is the usual one).

`tune` changes only the queue (container order, how colors are split, where links and hidden
containers sit) until the difficulty score is inside the target band, with no rule
warnings, a proven winning line, and the careful bot winning at least 60% (so the
difficulty is not a trap). It writes the level to `src/levels/trial/<id>.json` and a report
card to `design/reports/<id>.html`.

**When the tuner cannot reach the target**, it says why and keeps the closest level. The
queue alone could not do it; change the brief, not the queue:

| Too easy (score above the band) | Too hard (score below the band) |
|---|---|
| More colors, fewer shared | Fewer colors, more shared |
| A lock or frozen board, or a higher key | Remove a lock, lower the key, smaller frozen count |
| An odd pixel low in a tall column | Remove odd pixels |
| A trap at the front of a lane | Move buried and locked colors later in the queue |
| More pixels (bigger or more boards) | Fewer pixels |

## 7. Review the report card

Open `design/reports/<id>.html`. Check, in order:

1. **Difficulty** is in the band, the level is winnable, and the careful bot wins it.
2. **Warnings**: none, or only ones allowed on purpose.
3. **Boards**: each picture still reads as its subject; odd pixels and hidden groups are
   where you intended.
4. **Queue**: the first containers of each lane match the intent. People lose most in the
   opening, so a trap at the front is a big jump in difficulty.
5. **Most often sent with nothing to pull**: the colors that clog the deck. If one color
   dominates and that was not the plan, revisit its boards or split.
6. **Notes**: gating colors and key depth are what you intended.
7. Run the checklist at the end of level-designer-rules.md.
8. Play it once on the dev server (the card's Play link, or `?debug` and the Trial group).

## 8. Hand off

A level is ready for review when it has a brief, a level file in `src/levels/trial/`, and a
report card with no unexplained warnings. Summarize for the reviewer: the intent, the
difficulty score against the target, which features it uses, and anything you accepted on
purpose.
