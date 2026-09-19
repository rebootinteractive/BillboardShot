# The 40-Level Plan

What each level is for, how hard it should be, and which features it uses. The level
designer takes one row of the tables below as a slot and works from
[level-designer-workflow.md](level-designer-workflow.md).

All forty levels are new. The ten MVP levels were built to span a range of difficulties
for the first playtest, not to be a progression, so they are kept only as development
levels and as the calibration set for the bots.

## 1. Two shapes at once

A level's slot is set by two things that pull against each other:

- **The funnel** — teaching five features, one at a time, each on its own very easy level.
- **The curve** — the rhythm of pressure and relief that keeps play interesting.

Where they conflict, **the funnel wins**. A level that introduces a feature is easy even
if the curve wanted a peak there, because a player meeting a new rule for the first time
should never also be fighting for the win. The curve resumes on the next level.

The funnel is **long**. Features arrive one every four or five levels, from level 7 to
level 24, so a player has three or four levels to get comfortable with a rule before the
next one lands. Crowding all five into the first fifteen levels would teach them faster
than anyone could absorb them.

The curve runs underneath the funnel the whole time, with a peak every five levels from
12 onward. From 25 on every feature is known, and difficulty comes from combining them.

## 2. Difficulty bands

The difficulty score is the average bot's win rate. See level-design-strategy.md.

| Type | Band | What it is for |
|---|---|---|
| Intro | 95–100% | The first levels. Almost unloseable. |
| Onboarding | 90–100% | A feature's first appearance. Very easy on purpose. |
| Easy | 80–95% | Relief after a peak. |
| Medium | 55–80% | The default level. |
| Hard | 30–50% | Every fifth level from 12. Labeled in game. |
| Very hard | 15–30% | The peaks. Labeled, and **played by several people before shipping**. |

Bands are a target, not a contract. The bots are calibrated against three players and are
wrong by 30 points on individual levels in both directions, so a level one band off its
slot is fine if it plays well.

Each level's band in the tables below is **narrow, about ten points, and steps down from
the level before it**. That is deliberate. The tuner stops as soon as it is inside the
band, so a wide band gets whatever the first pass happened to produce: batch 1 found a
level sitting at 93% in an 80–95% band, which would have made it easier than the level
before it. Give a level the slice you actually want, not the whole type. Difficulty gets retuned from real player data after
release; see level-design-strategy.md, "Difficulty".

**Labeling.** Hard and very hard levels are marked before the player enters, so a loss
reads as a challenge rather than a surprise. This needs a `label` field on the level file
and a badge in the level intro.

**Continues.** Losing a level offers a continue for in-game money, which grants a sixth
deck slot for the rest of the attempt. It is deliberately not modeled by the simulator,
so every band above describes the level *without* a continue.

## 3. Which features may share a level

Two rules, and they bind harder than the difficulty target:

1. **At most three features in a level.** Four is no longer a puzzle, it is a list of
   things to remember.
2. **Never a key lock and a frozen board together.** They are the same idea wearing two
   coats — a board closed until the player does something. Two of them at once gives the
   player two unlock conditions to track and no new decision to make. One gate per level.

A consequence worth stating: **no level uses all five features**, including the finale.
Level 40 is the hardest *planning* problem in the game rather than the busiest one.

One soft guideline: hidden containers and mystery pixels are both about not being able to
see, one in the deck and one on the board. Together they are the harshest pairing in the
game, so they should not usually be the backdrop to a third feature.

Batch 3 tested that, because the plan asked for it twice and contradicted itself. Levels
17 and 22 both stack a third feature on both hiders, both landed in band, and both
produced the worst bot profiles in the game: **17 has the lowest careful bot anywhere
(70%, against 93–100% everywhere else), and 22 the lowest careless bot (17%)**. So the
combination is buildable but it costs at both ends — it is harder for a solver *and*
harsher on a beginner than its difficulty score admits.

It is kept on **27**, which is a very hard peak that is meant to be brutal and gets played
by real people before shipping. It is **removed from 35**, which is a medium level: a
medium level whose careless bot is in the teens is exactly the trap batch 2 warned about.

## 4. Levels 1–25: the funnel

Feature order runs uncertainty → goals → planning → constraint: first you learn not to
know what is coming, then to work toward something, then to plan two steps ahead, and
last to have choices taken away.

| # | Type | Target | Features | Boards | Pixels | Theme |
|---|---|---|---|---|---|---|
| 1 | Intro | 97–100% | **tutorial: send** | 1 | ~100 | Orchard |
| 2 | Intro | 95–100% | **tutorial: rotate** | 2 | ~210 | Orchard |
| 3 | Intro | 92–100% | — | 3 | ~310 | Orchard |
| 4 | Easy | 86–93% | — | 3 | ~330 | Orchard |
| 5 | Easy | 79–87% | — | 3 | ~370 | Orchard |
| 6 | Medium | 66–76% | — | 3 | ~410 | Harbor |
| **7** | **Onboarding** | 92–100% | **hidden** | 3 | ~390 | Harbor |
| 8 | Medium | 62–74% | hidden | 4 | ~460 | Harbor |
| 9 | Medium | 56–68% | hidden | 4 | ~500 | Harbor |
| 10 | Easy | 80–90% | hidden | 4 | ~470 | Harbor |
| **11** | **Onboarding** | 92–100% | **mystery** | 3 | ~420 | Garden |
| **12** | **Hard** | 32–48% | hidden, mystery | 4 | ~570 | Garden |
| 13 | Easy | 80–90% | mystery | 4 | ~500 | Garden |
| 14 | Medium | 58–70% | mystery, hidden | 4 | ~560 | Garden |
| **15** | **Onboarding** | 92–100% | **frozen** | 4 | ~480 | Garden |
| 16 | Medium | 60–72% | frozen | 5 | ~600 | Workshop |
| **17** | **Hard** | 32–48% | frozen, mystery, hidden | 5 | ~660 | Workshop |
| 18 | Easy | 78–88% | frozen | 4 | ~540 | Workshop |
| 19 | Medium | 56–68% | frozen, hidden | 5 | ~620 | Workshop |
| **20** | **Onboarding** | 92–100% | **key lock** | 4 | ~520 | Workshop |
| 21 | Medium | 58–70% | key | 5 | ~640 | Night Sky |
| **22** | **Hard** | 32–48% | key, mystery, hidden | 5 | ~700 | Night Sky |
| 23 | Easy | 78–88% | key | 5 | ~580 | Night Sky |
| **24** | **Onboarding** | 92–100% | **links** | 4 | ~550 | Night Sky |
| 25 | Medium | 56–68% | links | 5 | ~660 | Night Sky |

Levels 1–5 teach the base game with no features at all: that only the lowest pixel of a
column is pullable, that only the front board is pulled from, and that a color with no
container left is a dead end. Five levels is not padding — every later feature assumes
these are automatic.

**Levels 1 and 2 teach the two inputs**, each with a pointing hand rather than a sentence,
because both gestures are physical and easier shown than described. The level's `tutorial`
field carries this.

- **Level 1, `send`.** One board, so there is nothing to turn to and nothing to get wrong.
  The hand taps the head of a lane. It leaves as soon as the player sends anything.
- **Level 2, `rotate`.** Two boards whose colors are plainly different, the red strawberry
  in front and the yellow lemon behind. **Every lane starts with a yellow container**, so
  there is nothing to pull until the carousel is turned, and the lanes stay shut until it
  is. The hand shows the drag. Tapping a lane meanwhile says "Turn the billboards first".

The rotate tutorial only works if the level opens with nothing pullable on the front board,
so its queue is written by hand with `queue.order` and built rather than tuned — the tuner
would reorder the opening and undo the lesson.

## 5. Levels 26–40: the engine

Every feature is known. Difficulty now comes from **combining** them, not from growing the
level: two mild features are hard together, so boards and pixels grow gently.

| # | Type | Target | Features | Boards | Pixels | Theme |
|---|---|---|---|---|---|---|
| 26 | Medium | 56–68% | links, key | 5 | ~700 | Farmyard |
| **27** | **Very hard** | 15–28% | key, mystery, hidden | 5 | ~740 | Farmyard |
| 28 | Easy | 78–88% | hidden | 5 | ~600 | Farmyard |
| 29 | Medium | 56–68% | frozen, mystery | 5 | ~680 | Farmyard |
| 30 | Medium | 54–66% | key, links | 6 | ~720 | Farmyard |
| 31 | Medium | 52–64% | frozen, hidden | 6 | ~760 | Concert |
| **32** | **Hard** | 32–46% | frozen, links, hidden | 6 | ~790 | Concert |
| 33 | Easy | 78–88% | mystery | 5 | ~640 | Concert |
| 34 | Medium | 56–68% | links, hidden | 6 | ~720 | Concert |
| 35 | Medium | 50–62% | frozen, mystery | 6 | ~770 | Concert |
| 36 | Medium | 50–62% | mystery, links | 6 | ~800 | Winter Games |
| **37** | **Very hard** | 15–28% | frozen, links, mystery | 6 | ~830 | Winter Games |
| 38 | Easy | 78–88% | hidden, mystery | 5 | ~680 | Winter Games |
| 39 | Medium | 54–66% | key, links | 6 | ~750 | Winter Games |
| **40** | **Very hard** | 15–28% | key, links, mystery | 6 | ~900 | Winter Games |

The three very hard levels are deliberately given different characters, so the peaks do
not feel like the same wall three times:

- **27** is a hiding level: a key you must dig for while you can see neither the deck nor
  parts of the board.
- **37** is a counting level: a frozen board to feed while links keep taking your choices
  away.
- **40** is a planning level: the key, the links and the mystery groups all have to be
  solved in the right order.

## 6. Length

Levels 8–10 of the MVP ran 100–160 seconds of engaged play and all three testers were
comfortable there, so that is the ceiling. Early levels should be far shorter: level 1
should be over in about 25 seconds. The report card estimates play time from the pixel
budget, so the Pixels column above is the real length control.

## 7. Themes and picture reuse

Eight themes, five levels each, drawn from the 191-picture library:

Orchard · Harbor · Garden · Workshop · Night Sky · Farmyard · Concert · Winter Games

A picture may not appear twice within eight levels, and at most twice across the forty,
the second time in a different color **and** a different job — plain board first, then the
locked, frozen or mystery board. Themes mostly enforce this on their own. At two uses per
picture the ~200 board slots need 100 distinct pictures, and the library has 191, so there
is room to refuse any picture that does not fit.

## 8. How the levels get built

In **batches of eight**, which is also the picture reuse window, so each batch draws on
fresh art. For each batch:

1. Write the eight briefs from the rows above.
2. `npm run level -- build`, fix every error, then `npm run level -- tune`.
3. Read the report cards: difficulty against the band, warnings, and whether each picture
   still reads as its subject.
4. **Play every level scored under 55% before it ships.** Both of the MVP's worst
   difficulty misses were in this range, and a bad estimate there is what makes a player
   quit.
5. Send the very hard levels (27, 37, 40) to several players and watch for churn — how
   many attempts before they stop, not just whether they win.
6. Review, then move to the next batch.
