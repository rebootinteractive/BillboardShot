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
slot is fine if it plays well. Difficulty gets retuned from real player data after
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
game, so they carry a level on their own and should not be the backdrop to a third
feature on a peak.

## 4. Levels 1–25: the funnel

Feature order runs uncertainty → goals → planning → constraint: first you learn not to
know what is coming, then to work toward something, then to plan two steps ahead, and
last to have choices taken away.

| # | Type | Target | Features | Boards | Pixels | Theme |
|---|---|---|---|---|---|---|
| 1 | Intro | 95–100% | — | 2 | ~200 | Orchard |
| 2 | Intro | 95–100% | — | 2 | ~240 | Orchard |
| 3 | Intro | 90–100% | — | 3 | ~290 | Orchard |
| 4 | Easy | 85–95% | — | 3 | ~330 | Orchard |
| 5 | Easy | 80–95% | — | 3 | ~370 | Orchard |
| 6 | Medium | 65–80% | — | 3 | ~410 | Harbor |
| **7** | **Onboarding** | 90–100% | **hidden** | 3 | ~390 | Harbor |
| 8 | Medium | 60–80% | hidden | 4 | ~460 | Harbor |
| 9 | Medium | 55–75% | hidden | 4 | ~500 | Harbor |
| 10 | Easy | 80–95% | hidden | 4 | ~470 | Harbor |
| **11** | **Onboarding** | 90–100% | **mystery** | 3 | ~420 | Garden |
| **12** | **Hard** | 30–50% | hidden, mystery | 4 | ~570 | Garden |
| 13 | Easy | 80–95% | mystery | 4 | ~500 | Garden |
| 14 | Medium | 55–75% | mystery, hidden | 4 | ~560 | Garden |
| **15** | **Onboarding** | 90–100% | **frozen** | 4 | ~480 | Garden |
| 16 | Medium | 55–75% | frozen | 5 | ~600 | Workshop |
| **17** | **Hard** | 30–50% | frozen, mystery, hidden | 5 | ~660 | Workshop |
| 18 | Easy | 80–95% | frozen | 4 | ~540 | Workshop |
| 19 | Medium | 55–75% | frozen, hidden | 5 | ~620 | Workshop |
| **20** | **Onboarding** | 90–100% | **key lock** | 4 | ~520 | Workshop |
| 21 | Medium | 55–75% | key | 5 | ~640 | Night Sky |
| **22** | **Hard** | 30–50% | key, mystery, hidden | 5 | ~700 | Night Sky |
| 23 | Easy | 80–95% | key | 5 | ~580 | Night Sky |
| **24** | **Onboarding** | 90–100% | **links** | 4 | ~550 | Night Sky |
| 25 | Medium | 55–75% | links | 5 | ~660 | Night Sky |

Levels 1–5 teach the base game with no features at all: that only the lowest pixel of a
column is pullable, that only the front board is pulled from, and that a color with no
container left is a dead end. Five levels is not padding — every later feature assumes
these are automatic.

## 5. Levels 26–40: the engine

Every feature is known. Difficulty now comes from **combining** them, not from growing the
level: two mild features are hard together, so boards and pixels grow gently.

| # | Type | Target | Features | Boards | Pixels | Theme |
|---|---|---|---|---|---|---|
| 26 | Medium | 55–75% | links, key | 5 | ~700 | Farmyard |
| **27** | **Very hard** | 15–30% | key, mystery, hidden | 5 | ~740 | Farmyard |
| 28 | Easy | 80–95% | hidden | 5 | ~600 | Farmyard |
| 29 | Medium | 55–75% | frozen, mystery | 5 | ~680 | Farmyard |
| 30 | Medium | 55–75% | key, links | 6 | ~720 | Farmyard |
| 31 | Medium | 50–70% | frozen, hidden | 6 | ~760 | Concert |
| **32** | **Hard** | 30–50% | frozen, links, hidden | 6 | ~790 | Concert |
| 33 | Easy | 80–95% | mystery | 5 | ~640 | Concert |
| 34 | Medium | 55–75% | links, hidden | 6 | ~720 | Concert |
| 35 | Medium | 50–70% | frozen, mystery, hidden | 6 | ~770 | Concert |
| 36 | Medium | 50–70% | mystery, links | 6 | ~800 | Winter Games |
| **37** | **Very hard** | 15–30% | frozen, links, mystery | 6 | ~830 | Winter Games |
| 38 | Easy | 80–95% | hidden, mystery | 5 | ~680 | Winter Games |
| 39 | Medium | 55–75% | key, links | 6 | ~750 | Winter Games |
| **40** | **Very hard** | 15–30% | key, links, mystery | 6 | ~900 | Winter Games |

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
