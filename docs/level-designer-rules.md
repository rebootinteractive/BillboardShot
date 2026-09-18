# Level Designer Rules

The rules a level designer, human or agent, follows to build BillboardShot levels that are
fair, readable and hit a difficulty target. Read this together with
[level-features.md](level-features.md) (exact feature rules and the level file format) and
[level-design-strategy.md](level-design-strategy.md) (limits, art library, difficulty,
production).

Each rule is marked:

- **[verified]**: confirmed by a test or seen while tuning the showcase levels.
- **[hypothesis]**: reasoned from the rules but not yet measured. The simulator
  (`npm run sim`) confirms or corrects these; many warnings in its report come straight from
  this document.

When a rule and a measurement disagree, the measurement wins and this document is updated.

---

## 1. How the game really plays

These are the mechanics every design decision rests on. Most level mistakes come from
forgetting one of them.

### Boards and pixels

1. **Only the lowest pixel of each column can be pulled.** A pixel is reachable only
   when everything below it in its column is gone. Empty cells (holes) in a column are
   skipped, so a pixel above a hole is exposed if nothing solid is below it. [verified]
2. **Only the board at the front is pulled from.** The player turns the carousel to
   choose it. Containers on the deck never pull from boards at the side or back.
   [verified]
3. **A cleared board drops away** and the others close ranks around the ring. Pulling
   pauses briefly while they move. [verified]
4. **A locked or frozen board pulls nothing**, but it can still be turned to the front.
   Mystery pixels on it still reveal if they are exposed. [verified]

### Containers

5. **Tapping anywhere on a lane sends that lane's head** to a free deck slot. Only the
   first 4 containers of each lane are visible. [verified]
6. **Only one container per color pulls at a time**: the one with the fewest charges left
   (ties go to the lower slot). A second container of the same color on the deck just
   waits, holding a slot. [verified]
7. **A container pulls the lowest exposed pixel of its color** on the front board, one
   pixel per charge, until it is full. It leaves the deck when full and its slot frees.
   [verified]
8. **Charges are zero-sum**: per color, the charges of all containers equal the pixels
   of all boards. There is never a spare charge or a spare pixel. [verified]
9. **A partly filled container stays on the deck** until its color shows up again on the
   front board. This is how decks clog. [verified]

### Winning and losing

10. **Win**: every pixel collected.
11. **Lose (stuck)**: nothing is in the air, no container is about to leave, no container
    on the deck has a color exposed on any unlocked board, and no lane head can be sent
    (no free slot, or a linked partner is not ready). See level-features.md. [verified]
12. **A stuck deck is the only way to lose.** Difficulty is therefore always about slots:
    how often the player must hold containers that cannot pull yet. [verified]

---

## 2. Difficulty levers

From strongest to weakest, as currently understood.

Every level has the same 5 deck slots; they are not a lever. They are also why the levers
below matter so much: one slot changes everything (Deep Sea Secrets went from a 77–93%
rough bot win rate at 5 slots to 5–20% at 4), so every container that holds a slot without
pulling is expensive.

1. **Queue order.** By a wide margin the strongest lever, and the one the tuner works with.
   Every container that arrives before its color is reachable must park; putting the first
   container of a buried or locked color early is a precise way to add difficulty.
   Re-dealing batch 1's levels into the same number of lanes, changing nothing but the
   order, moved them by up to 30 points — one went from 69% to 39%. Order alone can carry
   a level across two difficulty bands. [verified, batch 1]
2. **Odd pixels.** A single pixel of another color placed inside a picture blocks its
   column until a container of that color comes to that board. Its position, color and
   timing can be planned and its effect counted before anyone plays (section 3). One useful
   lever among these, not the main one; used carelessly it becomes a trap.
   [verified: blocking and trap cases; hypothesis: strength relative to other levers]
3. **Colors that wait for an unlock.** A color that exists only on a locked or frozen board
   cannot be pulled until that board opens. Each such container that reaches the deck early
   parks for a long time. [verified]
4. **Number of colors.** More colors means more distinct containers competing for slots.
   [hypothesis]
5. **Color spread across boards.** A color on several boards can be pulled from more
   places, which is easier to use but makes the player turn the carousel more.
   [hypothesis]
6. **Container sizes.** Large containers stay on the deck longer; sizes that don't match
   the exposed pixels leave partly filled containers. [hypothesis]
7. **Lanes.** Not a dependable lever, and weaker than it looks. Re-dealing the same
   containers into 2, 3 and 4 lanes moved five levels in no consistent direction: one got
   harder with fewer lanes, another easier, a third was hardest at 3 lanes and easier at
   both 2 and 4. Choose a lane count for the shape of the level and tune with something
   else. [verified, batch 1]
8. **Hidden information** (mystery pixels, hidden containers). Adds uncertainty rather than
   hard constraints; its weight depends on how much the hidden part matters to the order.
   [hypothesis]

---

## 3. Queue construction

### The opening

- **The first containers of each lane matter most.** Playtesters lost mostly within their
  first ten sends, with most of the level still standing: people start by sending what is
  at the front of the lanes, before checking whether it can pull. A container at the front
  whose color is buried, locked or scattered is a much bigger trap for people than for a
  careful solver. Put traps there only on purpose, and expect a large difficulty jump.
  [verified: two playtesters; the simulator's average bot models this opening rush]

### Gating colors

- **A board's bottom color gates everything above it.** If the lowest row of a board is all
  one color, nothing on that board is reachable until a container of that color comes.
  That container must arrive in time, or every other container for that board parks. In
  Key to the Coop, the chicken's orange feet blocked the whole chicken while the only
  orange container was late in its lane, and the deck clogged. [verified]
- Before placing containers, list for each board which colors are exposed at the start and
  which colors each group rests on (the art library's facts give this). [verified]

### Colors that wait for an unlock

- **Never place the first container of a locked-only color early** unless the level is
  meant to be very hard. [verified]
- **A pixel override must not use a locked-only color** on an unlocked board. It forces a
  container to pull one pixel and then park until the unlock. In Night Market this made the
  level effectively unwinnable (0 wins in 60 rough-bot runs) until the overrides used colors
  available from the start. [verified]
- When a color is split between an open board and a locked board, the first containers of
  that color can fill from the open board; later ones must wait. Order them so the waiting
  ones come after the unlock is likely. [verified]

### Odd pixels: a deliberate difficulty layer

A library picture is only a source. A level can change any single pixel to another color
with a pixel override (see level-design-strategy.md), without touching the library. Small,
independent pixels of another color are one of the strongest and most controllable ways to
shape difficulty. Plan every one of them.

**What an odd pixel does** [verified]

- It blocks its column: nothing above it can be pulled until a container of its color is on
  the deck while that board is at the front.
- Its container has to come to that board for it. If that color is barely present on the
  board, the container pulls the one pixel and then has to wait for its color elsewhere,
  holding a slot (rule 9).
- It changes the charge totals: its color gains one pixel and the group it replaced loses
  one. Recount containers after placing overrides.

**Three dials set its strength** [hypothesis until measured]

1. **Position in the column.**
   - Low in a tall column: many pixels above are blocked. Strong.
   - Near the top: few pixels blocked. Mild.
   - At the bottom of its column: exposed from the start, so its color is needed early.
   Count the pixels above it: that is the number of pixels it holds hostage.
2. **Color.**
   - A color that is common and arrives early: mild, almost a speed bump.
   - A color whose containers come late: strong, because the column stays blocked longer.
   - A color that exists only behind a lock: a trap (below).
3. **Count and pattern.**
   - One odd pixel: a single decision.
   - Two odd pixels in the same column in different colors: forces an order, X before Y.
   - An odd pixel directly below a key: the unlock now also waits for that color. A very
     precise way to set key depth.
   - A color that exists only as odd pixels scattered across boards (at least 3 in total):
     one container has to visit several boards to fill. Strong planning pressure.

**Using them carefully** [verified unless marked]

- **Never use a color that only exists behind a lock** on an unlocked board. The container
  pulls one pixel and parks until the unlock. In Night Market this made the level
  effectively unwinnable until the odd pixels used colors available from the start.
- **Know which container takes it and when.** The container of that color that is on the
  deck when the pixel becomes reachable is the one that pays. If it arrives long before,
  it parks.
- **Keep the picture readable.** Keep odd pixels off defining features such as eyes, and
  usually 1–3 per board. Very hard levels can use more if the picture still reads.
  [hypothesis]
- **Hidden odd pixels** inside a mystery group stay hidden when the group floods open, and
  reveal only when they become the lowest in their column. The player cannot plan for them,
  so use them rarely. [verified: behavior; hypothesis: feel]

### Accidental small pieces

Small color pieces already in a picture (an eye, a beak, a 2-pixel highlight) behave exactly
like odd pixels. Decide about each one on purpose: keep it as a difficulty layer, or merge
it into a neighboring group's color.

- The chicken's 2-pixel eye and 6-pixel beak in Key to the Coop had their own colors, sat
  on a locked board, and their containers came before the unlock, so they parked. They were
  merged into orange. The problem was the timing, not the size. [verified]
- A container holds 3–40 charges (level limits), so a color needs at least 3 pixels in the
  whole level to have a container. The level checker does not enforce this range yet; the
  designer must. [verified]

### Same-color containers

- **Don't queue two containers of the same color back to back** unless enough of that color
  is exposed to fill both. The second one waits (rule 6) and holds a slot. [hypothesis]

### Charges

- Split a color's pixels evenly across its containers (3–40 each). [verified]
- More, smaller containers mean more sends and more slot pressure; fewer, larger containers
  mean longer stays on the deck. Pick the split, don't default to the maximum.
  [hypothesis]

---

## 4. Feature rules and traps

### Mystery pixels

- **A mystery group only stays hidden if every pixel in it has a pixel beneath it.** Any
  pixel that is the lowest in its column at the start reveals at once and floods the whole
  group. Use the art library's "mystery candidate" fact. [verified]
- The flood passes through same-color pixels, visible or hidden, up/down/left/right.
  Coloring a hidden group the same as a touching visible group joins them into one flood
  region. [verified]
- A single override pixel of another color inside a hidden group stays hidden when the
  group floods open, because the flood only follows the group's own color. It reveals on
  its own when it becomes the lowest in its column. [verified]
- Hide groups that rest on a visible color, like the octopus body above its tentacles or a
  lion's muzzle inside its mane. A hidden group that reaches the bottom edge is wasted.
  [verified]

### Key and locked board

- **Key depth is the difficulty.** The number of pixels beneath the key in its column, and
  the colors they need, decide how long the lock stays. A key at the bottom opens at once;
  a key at the top of a board's center (Key to the Coop) needs most of that board cleared.
  [verified]
- The board unlocks when the key pixel **lands**, about three quarters of a second after it
  is pulled. [verified]
- Every key color has exactly one key and one lock, a key is never on the board it opens,
  and locks never form a loop. The checker enforces this. [verified]
- Check rule 3 in section 2: the locked board's colors wait for the key. [verified]

### Frozen billboard

- **Only finished containers count.** A container of the frozen color counts its full
  capacity when it leaves the deck, never while filling. [verified]
- **Every pixel in such a container comes from other boards while the board is frozen.** So
  some set of that color's containers must fill completely from other boards and add up to
  the count. The checker enforces this. [verified]
- A large container of the frozen color that cannot be filled from open boards never
  counts, and a player who sends it may get stuck. Size those containers to what the open
  boards hold. [verified]
- In Deep Sea Secrets the crab thaws after one blue container (38) finishes on the whale.
  One container's worth is a gentle count; counts that need several finished containers
  push the player hard toward one color. [verified]

### Linked containers

- Sending needs both partners at the head of their lanes and two free slots. On a tight
  deck, a link is a real constraint. [verified]
- **Keep partners at similar depths.** A partner buried deep blocks the other lane, and the
  player may not see why. [hypothesis]
- **Links can deadlock** each other (A waits behind C, C is linked to a container waiting
  behind A). Always run the simulator. [hypothesis: follows from the send rules, not yet
  observed]

### Hidden containers

- A hidden container reveals only at the head of its lane, so it hides one step of
  lookahead, not the next move. [verified]
- Two or more hidden containers in a row make a lane a gamble. Use them one at a time.
  [hypothesis]

---

## 5. Art and colors

- **Pick approved library pictures.** Never draw art inside a level. [verified]
- **Recognizable first**: use a group's suggested colors unless there is a design reason.
  A picture that no longer reads as its subject is a bad trade even for difficulty.
  [verified]
- **Pixel overrides** are a deliberate difficulty layer, not decoration. Plan their
  position, color and count as described in section 3, and keep the picture readable.
  [verified]
- **Merging groups** by giving touching groups the same color makes one larger region: one
  flood, one pulling surface. [verified]
- **Colors that read close** (brown/orange, lime/green, black/purple, white/mystery gray)
  are distinguishable but slower to read. Placing them next to each other is a mild
  difficulty lever, not a trick. [verified: distinguishable; hypothesis: slows players]
- With 5–6 boards, prefer pictures with a silhouette over full rectangles; the carousel
  gets crowded. [verified]

---

## 6. Difficulty recipes

Starting points taken from the playtest levels, all on the global 5 slots. Win rates are
from `npm run sim` (average bot, careless bot in brackets) and are not yet calibrated
against real players.

| Band | Example | Boards | Colors | Features | Average (careless) |
|---|---|---|---|---|---|
| Very easy | Fruit Stand | 2 | 3 | none | 100% (100%) |
| Easy | Garden Party | 3 | 5 | a couple of hidden containers | 100% (100%) |
| Easy–medium | Farm Friends | 3 | 6 | one frozen board | 97% (71%) |
| Medium | Deep Sea Secrets | 4 | 9 | mystery groups, frozen board, 2 links, hidden containers | 83% (53%) |
| Hard | Night Market | 5 | 12 | key lock, mystery groups, odd pixels, links, hidden containers | 45% (9%) |
| Very hard | Space Trip | 5 | 9 | frozen board, mystery groups, a link, hidden containers | 28% (9%) |

Rules of thumb:

- **Easy**: every early container's color is exposed at the start; buried colors come late;
  no locked-only colors; no odd pixels, or one near the top of a column in a common color.
- **Medium**: one lock or frozen board; its colors come after the unlock is likely; one or
  two containers that must park briefly; a few odd pixels in colors that arrive early.
- **Hard**: several colors that wait for something; a few deliberately early buried
  containers; links; odd pixels low in tall columns, or two in one column
  to force an order.
- **Very hard**: many colors; odd pixels under keys or scattered as a color that
  must be collected from several boards; the player must plan which containers to hold.

---

## 7. Checklist before a level is done

1. The level checker passes: art matches source, charges are zero-sum, keys and locks pair
   up, frozen counts are reachable, links are valid. Every container holds 3–40 charges
   (not yet checked automatically).
2. Pixels are within the level cap, and the level stays within the board, color and lane
   limits.
3. Every mystery group is a mystery candidate (nothing hidden reveals at the start).
4. For every board, the container of its bottom color arrives in time.
5. Every odd pixel is planned: you know how many pixels it blocks, which container takes
   it and when, and its color is not one that only exists behind a lock.
6. Every accidental small color piece (under ~8 pixels) was either kept on purpose as a
   difficulty layer or merged into a neighboring color.
7. Locked-only colors come after their unlock is likely, unless the level aims to be very
   hard.
8. The simulator finds a winning line, and the difficulty score lands in the target band.
9. Play it once, or watch a replay: does the picture still read, and does the hard part feel
   like a decision rather than a trap?
