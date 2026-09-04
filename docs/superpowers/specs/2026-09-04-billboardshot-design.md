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

Each billboard carries an **outline hugging its own silhouette** — top and side edges
only, never the bottom. The outline is traced downward from the top row and stops at
the first row narrower than everything above it: the sides may widen as they descend
but never pull back in. On the heart that ends the sides after the fourth row, where
the lobes give way to the taper.

The open bottom states the rule: a pixel is only shootable if it has a clear path down
and out — in grid terms, the lowest surviving tile of its column. The shooting arc is
deliberately **not drawn**.

Shooters do **not** fire straight up. There is one **shooting arc**: a global angular
window fixed in world space on the camera-facing side of the carousel. Any deck
shooter can hit any shootable pixel whose world angle falls inside that arc, wherever
it happens to be standing. Spinning the carousel is therefore the act of choosing what
is reachable.

- Each frame the game collects the shootable pixel of every column, keeps the ones
  inside the arc, and offers them to the shooters.
- A shooter takes the **lowest-row target available in its color**, so a shape is
  always eaten from its bottom edge upward. Bigger volleys break ties, then the target
  nearest the shooter's own slot.
- It then eats **consecutive same-color tiles up that column**, one charge each,
  skipping holes, stopping at a different color.
- Volley size = min(run length, charges remaining). Tiles are reserved immediately so
  two shooters cannot claim the same tile, and a column takes at most one volley per
  frame.
- Shots are arcing homing projectiles (the target swings and rotates).
- A shooter that spends its **last charge leaves the deck**, freeing the slot.

## End conditions

- **Win** — every billboard tile destroyed.
- **Lose (deadlock)** — nothing new can join the deck AND no shooter on it can reach
  a pixel any more, "reachable" meaning its color sits at the bottom of some column
  somewhere. The arc does not enter this test: the player can always rotate a column
  into it.
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
