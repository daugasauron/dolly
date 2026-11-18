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

1. The controls: `1e9e49edd`. Chrome: the flyover test's mouse checks passed (L gave the pointer
   back, the second capture worked, the nose stood at 80 to 86 degrees) and its old ring check
   failed (the corgi of before passed the fighter's rings against their courses), which step 2
   replaces; the touch test passed (the drag raised the nose 26 degrees, the board climbed to
   190, the pinch zoomed, the ring gave the board back). Firefox: through step 3's round, which
   runs the same checks on the same controls.
2. The clouds: `dbf730122`. Chrome: the flyover test passed (pitch 85 after L and the second
   capture, the morning's first cloud, a chain of six to 228,107 units, the tour) and the touch test
   (the drag raised the nose 30 degrees, the board climbed to 201). Firefox: the flyover test failed
   on the test, Firefox refusing the mouse's move to 450 pixels over the page (900 up from the
   middle); the pull now goes from the display's foot to its top, in step 3's round.
3. The moon: committed with its image's source; its round (both browsers, all of the above and the
   voyage) running.

## 3. The moon

A second world, made of what the planet has (terrain.gdshaderinc and terrain.gd behind one switch,
`on_moon`, and the radius as a uniform and a static variable): radius 200,000 units, its middle 2
million from the planet's, to the west-north-west of the start, 26 degrees over its horizon there
(half lit at nine in the morning; the sun gives it phases). Its ground (`moon_on`, in both languages):
rolling highlands, low dark seas of lava, a grain, and craters at three sizes (2,400, 420 and 90
units a cell; a bowl and a raised rim in one cell in two), the small ones their mean where the
ground is read coarsely. A texture of the whole moon is drawn at the start, as the planet's is.

The sky (`world_seen`) draws the other world from its texture, lit by the sun, the planet with its
seas, woods, deserts, snow, the air's rim and its towns at night; the planet's air veils the moon
by day. On the moon the sky has no air, the land is grey dust (land.gdshader's last lines), and
there is no sea, fog, rain, cloud, life, chain, spire or landmark.

The crossing (`cross_bodies`): once the board is nearer the other world's ground than this one's,
the other world's chart takes the flight, its anchor under the board, its axes the old ones laid on
the new up; the way the board flies, the camera and the board as seen are turned into the new
axes. It comes some 600,000 units over each world, where both are the sky's drawings: from two
thirds of a world's radius over it its far grids go pixel by pixel to the sky's drawing of it
(`set_bodies`, land.gdshader's `solid`). The new up is the other way, so
the board and the camera turn to the new axes by degrees in the three seconds after the crossing.

`--moon SECOND`: the corgi flies to the moon (with a chain's boost), down to its ground, over it
for fifteen seconds, back, and down to the planet's day side. Headless: two crossings, 87 units over the
moon's ground at the lowest, 22 over the planet's after, all in some 60 s.

## 2. Clouds that chain out of the air

The rings, their courses and `ring.gdshader` are gone. Seven plots of 1,200 units in ten have a
chain of six clouds (`chain_start`, `chain_step`, laid a cloud a frame): the first 40 to 200 units
over what stands under it; each next where a board flying straight on from the cloud before at the
boost of a chain of so many arrives in 3.5 s (the last in up to 4.5, over 55,000 units), up a way
that steepens from 30-45 degrees by 5 a cloud and bends by 35 to 80 degrees. The boost is 20 for
a single cloud and doubles with each next of a chain flown within 5 s (40, 80, 160, 320, 640);
with the board's speed by its height, a chain's fifth cloud is 2,200 to 31,000 units up (6,200
the median) and its sixth at 60,000. A cloud's radius is 7 units times that speed's factor. Only
the first cloud of a chain is always there; the next of a chain going on grows out of nothing and
beats, the one after shows faintly, and an arrow at the screen's edge points to the next while it
is off the screen. The chain being flown is carried through a move of the chart's anchor.

Measured headless (the probe's `--survey 20`, `--pilot`): of 400 plots around the start 285 have a
chain; one takes 1.9 ms to lay (median), 6.3 at most, a cloud a frame. The corgi with `--chain 1`
chains six and reaches 232,000 units. A hand that moves the mouse up to 40 pixels a frame chains
six: the clouds at 3.8, 7.3, 10.8, 14.3, 17.8 and 19.1 s, at 141, 209, 318, 528, 4,996 and 58,132
units, boosts 20 to 640. So does one of 12 pixels a frame, and one that sees each next cloud 0.6 s
late: a chain takes a hand that finds each next cloud and steers to it within the chain's time,
not a fast one, and nothing done after the first misses the second. The plain corgi from before a
chain (`--cloud 1`) flies through its first cloud.

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
