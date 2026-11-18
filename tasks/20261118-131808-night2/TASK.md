# Voxel Flyover: the controls of before, clouds that chain to space, and the moon

- STATUS: OPEN
- PRIORITY: 300
- TAGS: godot,demo,planet

The owner (2026-11-18, 21:50): "The controls are awful, I want to go back to how it worked
before, btu I want the maximum up/down angle to be increased so it's possible to go almost
straight up. The mouse should be free to look around. Also there's way too many circles and they
look awful. Make them like sperical somehow like a small cool/weird looking cloud instead. Also,
chaining 2 or 3 should exponentially increase the speed boost. This makes it so there can be way
fewer but still chainable. Also they should be at different altitudes, not all at the surface.
Something like, if you manage to chain 5-6 you're outside the atmosphere." "One more thing
regarding the voxel flyover. I want to add the moon as a separate planet, and it should be
possible to go there and back!" And (22:30): "Do NOT use escape as a keybinding (currently give
back control). Just use another key". The brief: `work/briefs-2026-11-18/planet-night-2.md`.

Done when, each in Chrome and Firefox on the GPU, committed in this order:
1. the mouse steers as at `71a4f4247` (346f0cbad's mouse fixes kept), the nose goes to almost
   straight up, nothing turns the view back, and no key of the game is Escape;
2. the rewards are few small round clouds; a chain's boosts grow exponentially and a chain of 5 or 6
   leaves the air; a single cloud is worth taking, and a chain takes a skilled hand;
3. the moon is a second world to fly to from orbit, over or onto, and back, as smooth as the way to
   orbit.

## State (2026-11-18)

1. The controls: done in the source, its tests running.
2. and 3. To do.

## 1. The controls of before

The fighter of `7020f7a96` (stick, rudder, throttle, thrust and drag) is gone, and with it the
scrape and the hand-over's levelling. The heading and the pitch are the board's state again: the
mouse turns them 0.0025 radians a pixel, the pitch to 1.5 radians (86 degrees) up or down, and
nothing turns them back; the board flies at 30 units a second and a ring's boost (26, and 1.5 for
each ring of the chain before it) wears off in 2.5 s. The camera looks the way the board is headed
at once, its up the board's, so it does not turn over near straight up. A finger's drag steers as
the mouse does (touch.gd of `71a4f4247`, with the chain's arc). Firefox's first motion after a
capture is still left (`moved_since`). L lets go of the board and gives the pointer back; the
browser's own end of a capture (its Escape) does the same through `hold_pointer`, and the game binds
no Escape. The tests: the flyover test captures, gives the pointer back with L, captures again,
and pulls 900 pixels, which must leave the nose at 80 to 86 degrees; the touch test of `71a4f4247`.
