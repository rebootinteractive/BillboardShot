# Picture allocation

Which library picture each level uses. Kept centrally because the reuse cap is a global
rule and batches are built in parallel: a picture may not appear twice within eight
levels, and at most twice across the forty, the second time in a different color **and** a
different job. See docs/level-plan.md, "Themes and picture reuse".

A batch designer may only use the pictures allocated to its levels. If one does not work,
say so in the hand-back rather than borrowing from another level — the replacement is
allocated here first.

## Batch 1 — levels 1–8

Sizes are the picture's pixel count; the level's total should land near its budget.

| # | Budget | Theme | Pictures (pixels) | Total |
|---|---|---|---|---|
| 1 | ~100 | Orchard | pear (100) | 100 |
| 2 | ~210 | Orchard | strawberry (99), lemon (106) | 205 |
| 3 | ~310 | Orchard | apple (135), grapes (92), chestnut (85) | 312 |
| 4 | ~330 | Orchard | watermelon (105), carrot (103), broccoli (112) | 320 |
| 5 | ~370 | Orchard | avocado (125), peach (132), cherry-blossom (118) | 375 |
| 6 | ~410 | Harbor | crab (130), sailboat (130), dolphin (135) | 395 |
| 7 | ~390 | Harbor | shark (133), seal (123), jellyfish (106) | 362 |
| 8 | ~460 | Harbor | turtle (113), fish (96), lobster (131), otter (107) | 447 |

22 pictures, each used once.

Levels 1–3 are shaped by their tutorials rather than by their pixel budget. Level 1 has a
single board because it teaches tapping and there is nothing to turn to; level 2 needs two
boards whose colors are obviously different, so the player can see that turning the
carousel reached something new — a red strawberry in front and a yellow lemon behind it.
That is why the apple moved to level 3: an apple and a strawberry are both red, and level 2
would have taught nothing.

## Batch 2 — levels 9–16

| # | Budget | Theme | Pictures (pixels) | Total |
|---|---|---|---|---|
| 9 | ~500 | Harbor | octopus (170), tropical-fish (166), swan (97), life-ring (68) | 501 |
| 10 | ~470 | Harbor | whale (185), lighthouse (103), canoe (90), shrimp (87) | 465 |
| 11 | ~420 | Garden | butterfly (206), hibiscus (109), potted-plant (104) | 419 |
| 12 | ~570 | Garden | snail (214), beetle (162), ant (136), clover (55) | 567 |
| 13 | ~500 | Garden | sunflower (144), blossom (135), mushroom (117), tulip (93) | 489 |
| 14 | ~535 | Garden | rosette (145), honeybee (134), palm-tree (127), pine-tree (127) | 533 |
| 15 | ~400 | Garden | ladybug (108), cactus (107), rose (95), spider (92) | 402 |
| 16 | ~585 | Workshop | ruler (144), hammer (133), paintbrush (120), screwdriver (100), flashlight (86) | 583 |

32 pictures, each used once, none shared with batch 1.

Level 15 is budgeted at ~400 rather than the plan's ~480. Onboarding levels should be
short as well as easy — level 7 came out at 362 and plays right — and the garden pictures
that suit a frozen board are small ones.

Level 11 introduces mystery pixels, so its hidden group must be one the facts mark
`mystery ok`. Check with `npm run level -- facts butterfly hibiscus potted-plant` before
choosing; if none of the three can hide a group, say so rather than hiding one that
reveals at the start.

## Batch 3 — levels 17–24

| # | Budget | Theme | Pictures (pixels) | Total |
|---|---|---|---|---|
| 17 | ~650 | Workshop | gear (192), camera (167), magnet (144), light-bulb (80), scissors (70) | 653 |
| 18 | ~555 | Workshop | door (200), house (170), bell (115), umbrella (68) | 553 |
| 19 | ~615 | Workshop | abacus (201), alarm-clock (197), graduation-cap (87), toothbrush (78), headphones (50) | 613 |
| 20 | ~465 | Workshop | treasure-chest (168), gift (154), guitar (95), key (47) | 464 |
| 21 | ~650 | Night Sky | alien (198), planet (182), rocket (132), satellite (84), moon (56) | 652 |
| 22 | ~680 | Night Sky | airplane (182), rainbow (179), helicopter (132), hot-air-balloon (118), kite (68) | 679 |
| 23 | ~595 | Night Sky | storm-cloud (146), sun-cloud (146), rain-cloud (140), tornado (118), droplet (46) | 596 |
| 24 | ~400 | Night Sky | castle (164), telescope (100), ufo (83), comet (51) | 398 |

37 pictures, each used once, none shared with batches 1 or 2.

Level 20 introduces the key lock, so the **treasure chest is its locked board** and the
`key` picture sits on an open one — the lesson reads itself. Levels 20 and 24 are
onboarding and are budgeted short as well as easy, like levels 7 and 15 before them.

Level 23 is deliberately all weather, which gives the Night Sky block a change of
texture halfway through.

## Used so far

Batch 1: pear, strawberry, lemon, apple, grapes, chestnut, watermelon, carrot, broccoli,
avocado, peach, cherry-blossom, crab, sailboat, dolphin, shark, seal, jellyfish, turtle,
fish, lobster, otter

Batch 2: octopus, tropical-fish, swan, life-ring, whale, lighthouse, canoe, shrimp,
butterfly, hibiscus, potted-plant, snail, beetle, ant, clover, sunflower, blossom,
mushroom, tulip, rosette, honeybee, palm-tree, pine-tree, ladybug, cactus, rose, spider,
ruler, hammer, paintbrush, screwdriver, flashlight

Batch 3: gear, camera, magnet, light-bulb, scissors, door, house, bell, umbrella, abacus,
alarm-clock, graduation-cap, toothbrush, headphones, treasure-chest, gift, guitar, key,
alien, planet, rocket, satellite, moon, airplane, rainbow, helicopter, hot-air-balloon,
kite, storm-cloud, sun-cloud, rain-cloud, tornado, droplet, castle, telescope, ufo, comet

**cherries** was allocated to level 1 and is now free again.

## Not available for reuse until

Batch 1's pictures are free again from level 17, batch 2's from level 25 and batch 3's
from level 33 — eight levels after their first use. Each may be used only once more across
the whole game, and the second use must change both the picture's color and its job on the
board.
