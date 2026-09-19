Original prompt: Prettify this prototype mobile hybrid color-sort puzzle, inspired by Colony Flow by ABI Games in palette and smoothness, without copying objects such as ants or adding UI. Improve visual feedback and animations, create a new branch, and run a local server for review.

- Created branch codex/soft-color-polish from feature/container-pull (clean working tree).
- Inspected mechanics: swipe carousel to focus boards; tap queue lanes to send matching collection bins to six slots; pixels pull from the lowest exposed row into bins.
- Reference: official Colony Flow Google Play screenshots. Direction: warm apricot/cream environment, saturated candy colors, rounded molded surfaces, soft contact shadows, springy collection feedback. Preserve existing game structure and HUD; no new UI.
- Using develop-web-game skill and its Playwright client (temporary external dependency, no production dependencies needed).

- Implemented cream/apricot scene, candy palette, rounded tiles/bins/rails, lit stage and soft shadows. Existing HUD restyled to match; local editor now opt-in via ?editor.
- Added damped bin compression, tap/denial response, eased bin hop, magnetic pixel flight with controlled rotation/stretch, slot color transitions, collection glints, completion burst, and quiet synthesized tones activated by interaction.
- Added deterministic ?test time stepping and render_game_to_text. Fixed pointercancel erroneously dispatching a bin.
- First TypeScript/production build passed. First browser run retried after Vite's initial dependency optimization reload; screenshot inspected. Refining overly bright lighting/shadows and increasing bin size for legibility.

- Final visual pass: softened shadow opacity, warmer mobile browser chrome, delayed victory overlay so final collection/celebration remains visible. Reused rotation/tint objects in frame loops.
- Verification passed: production TypeScript/Vite build; bundled skill client screenshot of active collection; mobile tap compression, pointercancel, dispatch, matching-pixel accounting and slot release; real swipe + snapping; drag suspends new pulls; full-deck rejection; default level playthrough to a legitimate jam and replay; one-board heart fixture to a win and replay; 375x667 and 390x844 mobile, 1280x960 desktop, and ?editor.
- No browser runtime errors. Four repeated restarts held geometry/texture counts at 32/7 in the one-board fixture. Production build has Vite's standard >500kB chunk notice (Three.js bundle); no build errors.
- QA screenshots and JSON results are in output/playwright/ (git-ignored). Temporary Playwright install/test runners live under /tmp/billboard-qa; no dependency changes.
- Server left running at http://localhost:5173/ (LAN http://192.168.1.177:5173/). Existing tuning panel: http://localhost:5173/?editor.
- No outstanding implementation TODOs. Physical-device performance/audio remain a useful follow-up; browser tests used Chromium emulation.

## User feedback revision
- Requested 3×3 container layers, stronger subject/background contrast, and a single smooth beveled billboard border.
- Added stable per-flight packing reservations, 3×3 X/Z cells with successive Y layers, proportional cube scaling during flight, and whole-layer visibility. Default retains 36 pixels (four layers); existing visibility tuning now advances in nine-pixel increments.
- Changed backdrop and stage to muted cool gray; reduced background striping and distant color desaturation for clearer color recognition.
- Replaced individually rounded edge segments with a continuous extruded silhouette strip, rounded path corners/end caps and four-step bevels, preserving the gameplay's open bottom.
- Production build and first bundled Playwright client run passed; active-collection screenshot inspected. Detailed layer-transition and all-shape border checks underway.
- Revision verification complete: all six shapes render exactly one valid continuous border mesh; idle and every rotated shape captured, with heart/mushroom borders inspected at mobile resolution.
- Packing verified visually and by game state at 9, 10, 18, and 27 landed pixels: three distinct X columns and Z rows, unique reservation indices, higher Y for the next layer, 30-pixel container retirement, successful level completion, and replay. No browser errors. Captures/results: output/playwright/layers-qa/.
- Initial detailed QA timed out because per-frame rendering in software Chromium was slower than the 30-second harness limit; rerun with batched deterministic steps passed. No gameplay workaround was applied.
- Local server continues at http://localhost:5173/; same codex/soft-color-polish branch. No outstanding work for this feedback revision.

## Cleared billboard lifecycle
- Requested empty frames to drop and surviving billboards to keep equal gaps.
- Empty frames now detach from the carousel and fall/tilt/fade over 0.8 seconds after the last pixel arrives. Their associated spokes disappear; collected pixel resources stay alive until restart because bins still use them.
- Survivors retain cyclic order and ease into equal angular spacing over 0.65 seconds, bringing a surviving neighbor to the front. Pulls pause during this movement.
- Swipe snapping now selects an actual surviving target angle, including layout offsets, instead of snapping to the original board count. Falling frames stay independent of carousel input.
- Build and bundled Playwright client passed. Targeted browser checks passed for actual final-pixel arrival → falling frame → removal, equal spacing at 5/4/3/2/1 survivors, swiping during the drop, final win/replay, and restart during a drop. Three restarts held resources at 87 geometries/16 textures with zero detached frame leftovers. No browser errors. Screenshots inspected in output/playwright/drop-reflow/.
- Final continuation checks passed: one container collected the last pixel from all six boards as the ring redistributed 6→5→4→3→2→1→0, then reached a win. Two boards cleared during overlapping layout animations also settled into four equal gaps. No errors or outstanding TODOs; server remains at http://localhost:5173/.

## Second visual pass — key and lock (2026-09-19)
- Created `codex/key-lock-polish` from the current clean `develop`. Used the new `mvp/level-04` / “Key to the Coop” level as the primary reference.
- Replaced crossed flat bars with molded, cream-edged padlocks and draped, alternating rounded chain links attached to the existing frame silhouette. Gold, silver and bronze share the game's materials; hardware scales down on short boards.
- Gave keys a deeper beveled shape and a contrasting inset in their cream backing. Key flights shed the backing, arc toward the matching lock, align to its face and make a quarter-turn. The shackle opens, then the loose chain and lock drop and fade. Unlock glints match the actual key color.
- Kept rules and level data intact; frozen-board visuals still use their existing path. Added lock visual phase to the existing debug text state, with explicit resource disposal on unlock/restart.
- Validation: TypeScript/Vite build and diff whitespace check passed. Skill Playwright client plus mobile Chromium screenshots inspected. Actual container taps and solver focus sequences won Key to the Coop (503 pixels), Key Locks (gold then silver) and Frozen Board; locked boards yielded no targets throughout. All key animation phases observed, no browser errors.
- Restarting five times during shackle release kept renderer memory at 114 geometries / 16 textures. Inspected short-board silver/bronze/gold hardware and unlocking closeups. QA artifacts in ignored `output/playwright/key-lock-*`; temporary runners in `/tmp/billboard-qa`.
- Server remains at http://localhost:5173/?sandbox=mvp/level-04 . No new UI or dependencies. Existing Vite large-chunk notice remains; no build errors. No outstanding implementation TODOs; physical-device feel can be reviewed next.

## Rear chain follow-up (2026-09-19)
- Added matching chains and outward-facing cream anchors to the backs of key-locked billboards. Rear links join at the center; the existing padlock stays on the front. Both faces share the same instanced chain mesh, materials and release timing.
- Verified the chain is visible on the unfocused chicken from the normal carousel view, plus square-on rear/front screenshots, rear chain separation/drop and complete cleanup. Build and whitespace checks passed; browser had no errors. Three animation-interrupted restarts retained stable graphics memory. Screenshots: `output/playwright/rear-chain`.

## Frozen visual pass (2026-09-19)
- Committed the accepted key/lock work, including rear chains, as `21120e6` (`Polish keys and padlocks with chains on both billboard faces`).
- Replaced the rectangular frozen overlay with `BoardIce`: a beveled, extruded shell traced from the occupied artwork cells, preserving holes and disconnected islands. Both front and rear carry the icy surface and correctly oriented counter labels sharing one texture.
- Added a physical ice shader with soft facets, glossy streaks, frosted grazing edges, impact waves and damage-driven fracture lines. Projectiles choose occupied surface points on the side facing the launching container; feedback originates at the actual impact point.
- Partial hits decrement both labels, pulse them and shed chips. The final hit flashes the cracked shell, removes it and scatters solid ice shards from both faces. A bounded 96-instance pool keeps the effect contained; all shell/shader/label/shard resources are disposed on completion or restart. Frozen rules/counts and level data remain unchanged.
- Validation: TypeScript/Vite build and whitespace check passed. Skill client, mobile front/back/partial hit/shatter screenshots and desktop view inspected. Full actual-tap playthroughs won Frozen Board, Key to the Coop and Key Locks; frozen/cracked/shattering phases observed, locked boards remained untargetable, no browser/shader errors.
- Additional checks passed for rings/holes, diagonally touching islands, separate islands and concave silhouettes. Four restarts during fracture held graphics memory at 101 geometries / 17 textures. Front/back impact sides and shared indicator updates verified.
- Artifacts in ignored `output/playwright/ice-*`; QA scripts remain in `/tmp/billboard-qa`. Frozen changes are left uncommitted for visual review. Preview: http://localhost:5173/?sandbox=frozen-board . Existing Vite chunk-size notice remains, no new dependencies or UI controls.
