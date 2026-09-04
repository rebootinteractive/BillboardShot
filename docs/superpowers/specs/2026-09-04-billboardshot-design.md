# BillboardShot — approved design (2026-09-04)

Inspired by Cube Land (Rotate Lab) for the queue/deck bottleneck, and Pixel Flow for
pixel-grid billboard targets. Not a clone of either — selected mechanics only.

## Scene

Portrait phone frame. A **carousel**: N billboards hung from a ceiling ring by ropes,
placed at even angles on a circle around the Y axis, all facing outward. Each billboard
is a pixel-art shape (heart, tree, star, ...) on a grid of colored tiles. They dangle
and swing. Camera looks at the front of the ring, so 1-2 billboards are on stage.

Below, at the **same radius**, a curved **deck** of slots. Below that, **queue lines**
of colored shooters waiting.

## Inputs (two)

1. **Tap the front shooter of a queue line** -> it walks to the first free deck slot.
2. **Drag the upper area** -> spin the carousel by hand. Idle auto-rotation pauses
   while steering, resumes after a delay. Release imparts momentum.

## Firing (automatic)

A deck shooter looks **straight up** at whatever billboard column is above it (the
column is found by transforming the shooter's world position into the billboard's
local space, so swing and rotation are accounted for).

- It reads the column from the bottom up. If the lowest surviving tile matches its
  color it fires; otherwise it is blocked and waits for the carousel.
- It eats **consecutive same-color tiles up the column**, one charge each, skipping
  holes, stopping at the first surviving tile of a different color.
- Volley size = min(run length, charges remaining). Tiles are reserved immediately so
  two shooters cannot claim the same tile.
- Shots are arcing homing projectiles (the target swings and rotates).
- A shooter that spends its **last charge leaves the deck**, freeing the slot.

## End conditions

- **Win** — every billboard tile destroyed.
- **Lose (deadlock)** — deck full AND none of those shooters' colors exist anywhere on
  the remaining tiles.
- **Lose (out of ammo)** — queues empty, deck empty, tiles still standing.

## v1 scope

Single tunable level. No menu, no level editor. A collapsible debug panel with live
sliders for camera (fov / distance / pitch / target height), carousel, billboards,
swing, deck, queue and firing. **All debug settings auto-save to localStorage.**
Structural changes rebuild the level; feel/camera changes apply live.

## Known open concern

With automatic firing, the player's agency is (a) which colors stand on the deck and
(b) where the carousel points. If that reads as too passive, the first thing to try is
setting auto-rotate to 0 so spinning becomes a deliberate aiming act.
