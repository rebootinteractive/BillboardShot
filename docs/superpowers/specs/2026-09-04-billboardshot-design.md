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

A gap inside a row that drains out of the bottom gets no side edges either, so the
ghost's feet do not sprout teeth. A gap that is closed off below — the notch between
the heart's lobes — is still traced.

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
- **Nobody fires while the player is dragging the carousel** (option "Hold fire while
  dragging", on by default), so aiming and shooting are separate acts. Momentum after
  release still counts as free time — firing resumes the moment the finger lifts.
- **Only one shooter per color may fire**: the one with the fewest charges left, ties
  going to the lower slot. Concentrating fire empties that shooter sooner and hands its
  deck slot back, rather than draining a color's shooters in lockstep. The active one
  is lit; the rest sit dark.
- **One shot spends one charge on one pixel.** A shooter takes the lowest-row target
  available in its color, the target nearest its own slot breaking ties, then waits
  out its cooldown and picks again. Shapes erode from the bottom edge upward in a
  level front rather than being carved into vertical stripes.
- Tiles are reserved the moment they are targeted, so two shooters cannot claim the
  same pixel and the one above it becomes shootable straight away.
- Shots are arcing homing projectiles (the target swings and rotates).
- A shooter that spends its **last charge leaves the deck**, freeing the slot.

## Ammo

**Zero sum.** The charges dealt out in a color add up to exactly that color's pixel
count, so every charge has a pixel waiting for it and there is no slack: a charge
stranded on a jammed shooter is a pixel that can never be cleared. Loads are uneven —
each shooter carries an arbitrary amount between the min and max charge settings, and
the split never strands a tail smaller than the min.

## End conditions

- **Win** — every billboard tile destroyed.
- **Lose (deadlock)** — nothing new can join the deck AND no shooter on it can reach
  a pixel any more. A shooter that is retiring, or that has just spent its last charge,
  suspends the test: its slot frees a frame later and the jam is not real. Reachable
  means its color sits at the bottom of some column somewhere. The arc does not enter
  this test: the player can always rotate a column into it.
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
