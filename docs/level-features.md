# Level Features

The five level features that 40 levels are built from. Each one is described as
exact rules, the fields it adds to a level file, and notes for whoever designs levels
with it (human or AI). These rules are the contract: the game, the level validator and
the level-designer agent all follow this document.

Status: the level system and all five features are built, and waiting for the
designer to play and confirm them. Each feature has one test level in
`src/levels/sandbox/`, opened with `?sandbox=<file name>` (for example
`?sandbox=key-locks`). Sandbox levels are not part of the play order.

## Base game, for reference

- A carousel of billboards; the player swipes to bring one to the front (focus).
- Containers wait in lanes. Tapping a lane sends its head container to a free deck slot.
- Each deck container pulls pixels of its own color from the focused board, one charge
  per pixel. Only the lowest standing pixel in each column can be pulled.
- A pixel counts as **collected** when it lands in its container.
- Charges are zero-sum: per color, the charges across all containers equal the pixels
  across all boards.
- **Win:** every pixel collected. **Loss:** the game is stuck (see the end).

## Level file

One JSON file per level in `src/levels/`, played in filename order (`level-01.json`,
`level-02.json`, …). Adding a file adds a level; no code changes. When the player beats
the last file the list starts again from the first, while the level number they see
keeps counting up. `?level=N` in the address jumps to a level for testing, and `?debug`
turns the level pill into a dropdown of every level and feature test level.

Art rows are written top to bottom. Coordinates in a level file use the same
orientation: `col` from the left, `row` from the top, both starting at 0.

```json
{
  "name": "Locked Garden",
  "boards": [
    {
      "name": "Fish",
      "art": ["R...RR", "R...rR", "BBBBBB"],
      "keys": [{ "col": 1, "row": 0, "color": "gold" }]
    },
    { "name": "Cactus", "art": ["..."], "lock": { "type": "key", "color": "gold" } },
    { "name": "Sun", "art": ["..."], "lock": { "type": "frozen", "color": "red", "containers": 2 } }
  ],
  "lanes": [
    [
      { "color": "red", "charges": 12 },
      { "color": "blue", "charges": 8, "hidden": true, "link": "a" }
    ],
    [
      { "color": "green", "charges": 10 },
      { "color": "red", "charges": 9, "link": "a" }
    ]
  ]
}
```

A level may also carry `"hint": "..."`, a one-line explanation shown before the first
attempt at that level, used when a feature appears for the first time.

Art characters: `R` red, `B` blue, `G` green, `Y` yellow, `P` purple, `O` orange,
`C` cyan, `M` pink, `N` brown, `L` lime, `K` black, `W` white, `.` empty. The lowercase letter is a mystery pixel of that color.

Checked on load: equal row widths, known characters and colors, whole-number charges,
zero-sum charges per color, keys that fit on their board over empty cells, key and lock
pairing (one of each per key color, not on the same board, no loops), frozen boards whose containers can be finished from other boards, and links joining
exactly two containers in different lanes. Problems are logged to the browser console.
Whether a level can be won is not checked yet; that is the solver's job in the pipeline.

---

## 1. Mystery pixels

A pixel whose color is hidden until its color group is revealed.

**Rules**
- A mystery pixel is drawn as a neutral gray `?` tile. Its true color is fixed in the
  level file and never changes.
- **Trigger:** the moment a mystery pixel becomes the lowest standing pixel in its
  column (the pixel beneath it was pulled, or it starts at the bottom), it is revealed.
- **Flood:** revealing a pixel also reveals every mystery pixel connected to it through
  same-color pixels, using up/down/left/right adjacency (no diagonals). The flood passes
  through already-visible pixels of that color, and through pixels already pulled but
  still in flight. Pixels already collected do not connect anything.
- Hiding the color changes nothing else. A mystery pixel blocks its column like any
  other pixel, and it is always revealed before it can be pulled.

**Level file:** lowercase color letter in `art`.

**Design notes**
- A mystery group stays hidden only if **every** pixel in it has a pixel beneath it in its
  column. If any one of them is the lowest in its column at the start, it reveals at once
  and the flood uncovers the whole group before the player sees it. In practice, hide
  groups that rest on another color (leaves above a pot, a cap above its bottom row,
  eyes inside a face), not groups that reach the bottom edge of the art.
- One exposure revealing a big region is a satisfying payoff. A region of isolated
  single mystery pixels is just noise.
- The player plans container order around colors they can't see. Keep the hidden share
  low enough that the visible part of the board still hints at what to send.

## 2. Key and locked billboard

A key is an object on a board, 3 pixels wide and 2 tall. Freeing it opens the padlocked
billboard of the same key color.

**Rules**
- A locked board shows a padlock and chains over its frame. It stays on the carousel and
  can be rotated to the front, but nothing pulls from it while it is locked.
- The key takes the place of pixels: where it sits there are none. It is drawn as a
  metal key in its key color on a pale plate. The padlock is drawn in the same key color.
- The key blocks its three columns like a pixel would: nothing above it can be pulled
  while it is there.
- The key is **released** the moment nothing is left standing beneath it in any of its
  three columns (the last pixel under it has been pulled). It flies to the padlock, which
  opens when it arrives, and pulls start at once if that board is in focus. Its columns
  are free straight away.
- A key on a locked or frozen board waits until that board opens, then is released if
  nothing is beneath it.
- A key only opens the lock of its own key color.

**Level file:** `keys: [{ col, row, color }]` on the board holding the key, where `col`
and `row` are the key's top-left cell (row from the top). The six cells it covers are `.`
in `art`. The locked board has `lock: { type: "key", color }`. Key colors are their own
small palette (for example gold, silver, bronze), separate from pixel colors, so a key
never reads as a pixel color.

**Constraints**
- A key lies wholly inside its board's art, over empty cells only, and keys never overlap.
- A key cannot sit on the board it unlocks.
- Every key color used in a level appears on exactly one key and exactly one lock.
- A board has at most one lock (key or frozen).
- Keys may sit on locked or frozen boards, but the chain of unlocks cannot loop.

**Design notes:** keep it to two key/lock pairs per level at most. Burying the key high
on its board makes the player clear that board first. The key costs its board six pixels,
so give it room inside the picture's silhouette, not hanging off an edge.

## 3. Frozen billboard

A board iced over until enough containers of one color are finished.

**Rules**
- A frozen board shows an ice cover with a small container in its color and a number: how
  many containers of that color still have to finish. It can be rotated to the front, but
  nothing pulls from it.
- Only **finished** containers count, one each whatever their size. When a container of
  that color is full and leaves the deck, it flies to the frozen board as a few cubes that
  crack the ice, and the number drops by one as the last cube lands. A container still
  filling counts for nothing. Counting starts at the level start.
- At zero the ice shatters and the board plays normally.

**Level file:** `lock: { type: "frozen", color, containers }`.

**Constraints**
- While the board is frozen, every pixel a container of its color holds comes from other
  boards. So the level needs at least `containers` containers of that color, and the
  smallest that many must fit within the pixels of that color on other boards. The checker
  rejects the level otherwise.

**Design notes:** a frozen board pushes the player toward one color early, so its color
should compete with what the open boards ask for. Because only finished containers count,
container sizes matter: a big container that cannot be filled from the open boards never
counts, and a player who starts it may get stuck. Asking for every container of that
color makes the player clear all of it elsewhere first. That can be intended, but it
often isn't.

## 4. Linked containers

Two containers in different lanes, chained together. They are always sent together.

**Rules**
- A visible link (rope/chain) joins the two containers once both are in view.
- Tapping either one sends both, but only if both are at the head of their lanes and
  there are two free deck slots. Otherwise the tap is refused (shake plus link flash).
- Once on the deck they act as two independent containers.

**Level file:** matching `link` id on exactly two containers, in different lanes.

**Design notes**
- Keep the partners at similar depths in their lanes. A partner buried deep blocks the
  other lane for a long time, and the player can't see why.
- Links can deadlock each other (A waits behind C, C is linked to a container waiting
  behind A). The validator rejects any level that can't be won.

## 5. Hidden containers

A container whose color and charge count stay hidden until it reaches the head of its
lane.

**Rules**
- Shown as a gray container with a `?`. Reaching the lane head reveals color and charges
  at once.
- It plays exactly like a normal container once revealed.

**Level file:** `hidden: true`.

**Design notes:** the head is always visible, so this hides one step of lookahead, not
the next move. Hiding several containers in a row in one lane makes that lane a gamble.

---

## Combining features

- Container flags combine: `hidden` and `link` can both be on one container.
- A key can sit inside a mystery group; the cells it covers simply have no pixels.
  A container filled with mystery pixels counts toward a frozen board like any other
  once it is finished.
- A board has at most one lock.

## Loss: the stuck rule

The only way to lose is being stuck. With these features, stuck means **no possible
action can ever change the game state**. Once nothing is in flight and no container is
about to leave, the game is stuck when both of these hold:

1. **No pull is possible:** no deck container has charges whose color is the lowest
   standing pixel of some column on an unlocked, unfrozen board.
2. **No send is possible:** no lane head can be sent. A head can't be sent when there is
   no free slot, or when it is linked and its partner is not at a head or there are fewer
   than two free slots.

A locked board only opens by collecting and a frozen board only by finishing containers,
so if both of these hold, nothing can move again.

## What the validator checks (pipeline step)

- The file matches the schema; art rows have equal widths; colors are known.
- Charges are zero-sum per color.
- Keys: 3×2 inside the art over empty cells, not overlapping, one key and one lock per
  key color, no loops, not on their own board.
- Links: exactly two containers per id, in different lanes.
- Frozen boards ask for no more containers than can be finished from other boards.
- A solver finds at least one winning line, and reports how many lines win as a
  difficulty signal.
