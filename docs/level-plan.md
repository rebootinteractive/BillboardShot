# The 40-Level Plan

What each level is for, how hard it should be, and which features it uses. The level
designer takes one row of the table as a slot and works from
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

That is why levels 1–15 do not look periodic. They are the onboarding funnel, with a
single hard level at 12 to prove the game has teeth. From 16 on, every feature is known
and the curve runs a clean five-level cycle.

## 2. Difficulty bands

The difficulty score is the average bot's win rate. See level-design-strategy.md.

| Type | Band | What it is for |
|---|---|---|
| Intro | 95–100% | The first levels. Almost unloseable. |
| Onboarding | 90–100% | A feature's first appearance. Very easy on purpose. |
| Easy | 80–95% | Relief after a peak. |
| Medium | 55–80% | The default level. |
| Hard | 30–50% | Every fifth level from 20. Labeled in game. |
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

## 3. The funnel: levels 1–15

Feature order runs uncertainty → goals → planning → constraint: you first learn not to
know what is coming, then to work toward something, then to plan two steps, and last to
have choices taken away.

| # | Type | Target | Feature | Boards | Pixels | Theme |
|---|---|---|---|---|---|---|
| 1 | Intro | 95–100% | — | 2 | ~200 | Orchard |
| 2 | Intro | 95–100% | — | 2 | ~250 | Orchard |
| 3 | Intro | 90–100% | — | 3 | ~300 | Orchard |
| 4 | Easy | 85–95% | — | 3 | ~350 | Orchard |
| 5 | Easy | 80–95% | — | 3 | ~380 | Orchard |
| 6 | Medium | 65–80% | — | 3 | ~420 | Orchard |
| 7 | **Onboarding** | 90–100% | **Hidden containers** | 3 | ~380 | Harbor |
| 8 | Medium | 60–80% | Hidden | 4 | ~470 | Harbor |
| 9 | **Onboarding** | 90–100% | **Mystery pixels** | 3 | ~400 | Harbor |
| 10 | Medium | 60–80% | Mystery, hidden | 4 | ~500 | Harbor |
| 11 | **Onboarding** | 90–100% | **Frozen board** | 4 | ~450 | Harbor |
| 12 | **Hard** | 30–50% | Frozen, mystery, hidden | 4 | ~560 | Garden |
| 13 | **Onboarding** | 90–100% | **Key lock** | 4 | ~470 | Garden |
| 14 | Medium | 55–75% | Key, hidden | 4 | ~540 | Garden |
| 15 | **Onboarding** | 90–100% | **Linked containers** | 4 | ~500 | Garden |

Levels 1–6 teach the base game with no features at all: that only the lowest pixel of a
column is pullable, that only the front board is pulled from, and that a color with no
container left is a dead end. Six levels is not padding — every later feature assumes
these are automatic.

## 4. The engine: levels 16–40

Every fifth level is a peak, alternating hard and very hard, with an easy level directly
after each peak. Features now combine, which is where difficulty comes from: two features
that are each mild become hard together, without the level needing to be bigger.

| # | Type | Target | Features | Boards | Pixels | Theme |
|---|---|---|---|---|---|---|
| 16 | Easy | 80–95% | Links, mystery | 4 | ~520 | Workshop |
| 17 | Medium | 55–75% | Links, hidden | 4 | ~580 | Workshop |
| 18 | Medium | 55–75% | Key, mystery | 5 | ~620 | Workshop |
| 19 | Easy | 80–95% | Frozen | 4 | ~540 | Workshop |
| 20 | **Hard** | 30–50% | Key, links, hidden | 5 | ~680 | Workshop |
| 21 | Easy | 80–95% | Mystery | 4 | ~560 | Night Sky |
| 22 | Medium | 55–75% | Frozen, hidden | 5 | ~640 | Night Sky |
| 23 | Medium | 55–75% | Key, links | 5 | ~660 | Night Sky |
| 24 | Medium | 50–70% | Mystery, frozen | 5 | ~700 | Night Sky |
| 25 | **Very hard** | 15–30% | Key, links, mystery | 5 | ~740 | Night Sky |
| 26 | Easy | 80–95% | Hidden | 4 | ~580 | Farmyard |
| 27 | Medium | 55–75% | Frozen, mystery | 5 | ~660 | Farmyard |
| 28 | Medium | 55–75% | Key, hidden | 5 | ~700 | Farmyard |
| 29 | Easy | 80–95% | Links | 5 | ~620 | Farmyard |
| 30 | **Hard** | 30–50% | Frozen, key, mystery | 6 | ~780 | Farmyard |
| 31 | Easy | 80–95% | Mystery | 5 | ~640 | Concert |
| 32 | Medium | 55–75% | Links, hidden | 5 | ~700 | Concert |
| 33 | Medium | 50–70% | Key, frozen | 6 | ~750 | Concert |
| 34 | Medium | 50–70% | Mystery, links | 6 | ~780 | Concert |
| 35 | **Very hard** | 15–30% | Frozen, key, links | 6 | ~820 | Concert |
| 36 | Easy | 80–95% | Hidden | 5 | ~660 | Winter Games |
| 37 | Medium | 55–75% | Key, mystery | 6 | ~740 | Winter Games |
| 38 | Medium | 50–70% | Links, frozen | 6 | ~790 | Winter Games |
| 39 | Easy | 80–95% | Mystery, hidden | 5 | ~700 | Winter Games |
| 40 | **Very hard** | 15–30% | All five | 6 | ~900 | Winter Games |

Level 40 is the only level that uses all five features at once, and it is the finale.

## 5. Length

Levels 8–10 of the MVP ran 100–160 seconds of engaged play and all three testers were
comfortable there, so that is the ceiling. Early levels should be far shorter: level 1
should be over in about 25 seconds. The report card estimates play time from the pixel
budget, so the Pixels column above is the real length control.

## 6. Themes and picture reuse

Eight themes, five levels each, drawn from the 191-picture library:

Orchard · Harbor · Garden · Workshop · Night Sky · Farmyard · Concert · Winter Games

A picture may not appear twice within eight levels, and at most twice across the forty,
the second time in a different color **and** a different job — plain board first, then the
locked, frozen or mystery board. Themes mostly enforce this on their own. At two uses per
picture the ~200 board slots need 100 distinct pictures, and the library has 191, so there
is room to refuse any picture that does not fit.

## 7. How the levels get built

In **batches of eight**, which is also the picture reuse window, so each batch draws on
fresh art. For each batch:

1. Write the eight briefs from the rows above.
2. `npm run level -- build`, fix every error, then `npm run level -- tune`.
3. Read the report cards: difficulty against the band, warnings, and whether each picture
   still reads as its subject.
4. **Play every level scored under 55% before it ships.** Both of the MVP's worst
   difficulty misses were in this range, and a bad estimate there is what makes a player
   quit.
5. Send the very hard levels (25, 35, 40) to several players and watch for churn — how
   many attempts before they stop, not just whether they win.
6. Review, then move to the next batch.
