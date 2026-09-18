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
| 1 | ~200 | Orchard | pear (100), cherries (85) | 185 |
| 2 | ~240 | Orchard | apple (135), strawberry (99) | 234 |
| 3 | ~290 | Orchard | lemon (106), grapes (92), chestnut (85) | 283 |
| 4 | ~330 | Orchard | watermelon (105), carrot (103), broccoli (112) | 320 |
| 5 | ~370 | Orchard | avocado (125), peach (132), cherry-blossom (118) | 375 |
| 6 | ~410 | Harbor | crab (130), sailboat (130), dolphin (135) | 395 |
| 7 | ~390 | Harbor | shark (133), seal (123), jellyfish (106) | 362 |
| 8 | ~460 | Harbor | turtle (113), fish (96), lobster (131), otter (107) | 447 |

23 pictures, each used once.

## Used so far

pear, cherries, apple, strawberry, lemon, grapes, chestnut, watermelon, carrot, broccoli,
avocado, peach, cherry-blossom, crab, sailboat, dolphin, shark, seal, jellyfish, turtle,
fish, lobster, otter

## Not available for reuse until

Every picture above is first used in levels 1–8, so none may appear again before level 16,
and each may be used only once more across the whole game.
