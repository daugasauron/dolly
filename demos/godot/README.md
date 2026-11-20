# Godot

Godot 4.7 from upstream's release, built inside Dolly by SCons with Dolly's
`cc`, as the `godot` package, with one patch
([`godot-dolly.patch`](godot-dolly.patch)): it names Dolly's WebGPU driver to
Godot, Forward+ starts SDFGI only where the device has image atomics,
which WebGPU does not (SDFGI also needs more storage textures than WebGPU
gives a shader stage), and the Project Manager draws on `gpu@0` as the editor
does, where upstream starts it on the Compatibility renderer, which here is a
software rasterizer: a hover took 0.6 s to show on it, 9 to 33 ms on `gpu@0`;
the editor's debugger listens on a local socket, as Dolly has no network ones, and its
Debug Adapter server, which listens on TCP for other editors, is left out. In Firefox, which has
neither of WebGPU's texture format tiers, SSIL, the depth-of-field blur, VoxelGI and 2D SDFs do
not draw: the first dispatch of each says so.
`amy install godot`, then
`godot --path DIRECTORY` runs a project on the page, drawn by Godot's
Mobile and Forward+ renderers through a RenderingDevice driver on `gpu@0`
where the browser grants WebGPU, and by its Compatibility renderer on Mesa's
OpenGL otherwise, and `godot --headless` runs one without drawing; `--script FILE` runs a script in the project of the
current directory. Its sound plays through `audio@0`. `godot-editor` is
Godot's editor: it imports a project's assets and exports its pack inside
Dolly, as it exported Dodge the Creeps for `amy install dodge-the-creeps`
([task](../../tasks/20261107-131836-godot/TASK.md)).

## Images

- `godot`: Godot 4.7's engine with GDScript, 2D and 3D with Godot's own physics, the fallback text server, its renderers on `gpu@0` and the Compatibility renderer on Mesa, and sound, which runs a project or the pack the editor exported.
- `godot-editor`: Godot 4.7's editor, which imports a project's assets and exports its pack inside Dolly, and draws its own window on the page, or on the X server DISPLAY names.
- `godot-editor-ui`: Godot's editor on the page at once, on a copy of Lantern Drift's project, the islands in its 3D view; quitting it leaves a shell.
- `spirv-wgsl`: A build stage: Tint, from Dawn, and SPIRV-Tools under Dolly's passes, which translate the SPIR-V Godot compiles its shaders to into WGSL for `gpu@0`.
- `dodge-the-creeps`: Dodge the Creeps, the game of Godot's first 2D tutorial, which Godot's editor imported and exported here; `dodge-the-creeps` plays it.
- `truck-town`: Truck Town, the demo projects' vehicle physics demo: a minivan, a semi-truck and a tow truck in a town at four times of day, drawn by Godot's Forward+ renderer on `gpu@0`; `truck-town` plays it.
- `lantern-drift`: Lantern Drift, Dolly's showcase game for Godot: a paper lantern glides through rings of light over a sky archipelago from sunset into night, drawn by Forward+ on `gpu@0`; `lantern-drift` plays it.
- `godot-lantern-drift`: Lantern Drift on the page at once; Q leaves a shell where `godot-editor -e --path ~/lantern-drift` opens a copy of its project in Godot's editor, the islands in its 3D view. The eye beside HUD in the Scene dock hides the game's display, F5 plays the game so, and Ctrl+S saves the scene.
- `airtime-godot`: Airtime: Foundry in Godot, the strafe trials of bhop on Airtime's own movement and course, drawn by Forward+ on `gpu@0` as a foundry at night over molten metal; `airtime-godot` plays it.
- `godot-airtime`: Airtime in Godot on the page, which starts at once; Q leaves a shell where `godot-editor -e --path ~/airtime` opens a copy of its project in Godot's editor, the course in its 3D view. The eye beside Hud in the Scene dock hides the game's display, F5 plays the game so, and Ctrl+S saves the scene.
- `voxel-flyover`: Voxel Flyover, a corgi's flight on a jet surfboard, with a pelican on a bicycle pedalling under it for the jets, over a planet of mountains, forests and sea that can be left: a sphere of 600,000 units which the GPU builds in its shaders, drawn by Forward+ on `gpu@0`, with a curved horizon, and whole from out of its air; `voxel-flyover` plays it.
- `godot-voxel-flyover`: Voxel Flyover on the page at once: the corgi flies itself until Enter, a click or a touch takes the board; the keys or a thumb then steer it and the mouse or a finger looks around, through chains of small clouds that climb out of the air, and on to the moon and back; Q leaves a shell.
- `blender-flyover`: Blender and Voxel Flyover in one image: Blender's window opens on the script that makes the flyover's flyer, the board, its jets, the corgi and the pelican on its bicycle, with the flyer it made in the 3D view; Run Script makes it anew, and `voxel-flyover`, after Blender quits, flies what it made.

## Lantern Drift

[`lantern-drift/`](lantern-drift) is a Godot project made for Dolly: scenes, scripts and
shaders, no art or sound files. Islands, pines, crystals, rings and sky lanterns are Godot's
primitive meshes under its materials and shaders; the sky, the cloud sea and the islands' rock
and grass are shaders; the bells, the crash and the wind are synthesised at start. It uses
Forward+'s volumetric fog (the sun's shafts between the islands, the lantern's and the rings'
glow in the haze), glow, SSAO, GPU particles, clustered lights and directional shadows, and the
sky darkens from sunset into night as the run goes on. Godot's editor imports and exports it
while the package builds. It drew 59 frames a second at 1600 by 900 in Chrome (NVIDIA RTX
5070, 2026-11-10). `-- --autopilot SECONDS` flies a run by itself, as the title screen does, and
prints its frame rate, rings and score.

## Voxel Flyover

[`voxel-flyover/`](voxel-flyover) is a Godot project made for Dolly, of scripts and shaders alone.
Its world is a function of the place ([`terrain.gdshaderinc`](voxel-flyover/terrain.gdshaderinc)):
seas and continents, hills, a climate, and ranges of mountains whose spurs stand on their crests
and whose gullies on their spurs, from an integer hash. Nothing of the world is stored or built on
the CPU. Three grids of land follow the flight, of 257 by 257 points 1.5 units apart, as many 6
apart around them and 193 by 193 24 apart to the horizon, 2.3 km off. When the grids step after
the flight, one pass draws each grid's ground into a texture of a texel a point: the height and
the climate ([`ground.gdshader`](voxel-flyover/ground.gdshader)). The land's vertex stage raises
its points to it, blending into the coarser grid's toward its edge, and its fragment stage takes
the slope from the same texture and dresses the ground by it
([`land.gdshader`](voxel-flyover/land.gdshader),
[`ground.gdshaderinc`](voxel-flyover/ground.gdshaderinc)): meadow, heath or desert by the climate,
mottled and dotted with flowers, bare rock in strata where it is steep, snow where it is high and
lies, sand by the sea, veins of crystal that glow at night with a light that runs along them, and
the light that runs out over land and sea from under each cloud the flyer has flown through. A tree stands in
a plot of 4 units where the climate has one and the ground is not steep
([`flora.gdshaderinc`](voxel-flyover/flora.gdshaderinc),
[`trees.gdshader`](voxel-flyover/trees.gdshader)): a trunk and a ball, which the vertex stage
shapes into firs with tiers of boughs in the cold, broad lumpy crowns in the wet, in places in
blossom or autumn colours, slender spires in the desert, and groves that glow at night; the
fragment stage roughens a crown's light as leaves do. The sea mirrors the sky, with the sun's
glitter on its ripples and foam that glows at night along the shore
([`water.gdshader`](voxel-flyover/water.gdshader)). The sky follows the hour, with stars, a river of
them across the night, an aurora and the moon (a world of its own, below), and carries a layer of cloud lit from the sun's side, whose shade falls on the
ground ([`sky.gdshader`](voxel-flyover/sky.gdshader)). A day lasts two minutes: one light is the
sun and then the moon, with four shadow cascades over 420 units that every grid of land casts
into, 4x MSAA, SSAO, glow, haze that thickens toward the sea, and volumetric fog, in which the low
sun draws shafts and the board's searchlight shows at night.

Nothing appears or goes at once. The same trees are drawn by four grids, each a ring further from
the flyer with a simpler mesh: a crown of 12 rings to 80 units, of 5 to 232, of 3 without a trunk
to 420, and eight triangles to 690. Where two rings overlap, one's trees thin out pixel by pixel as
the other's fill in, both asking the same number of the pixel, and past the last ring the land's
shader paints the same crowns on the ground they stand on, round over their plots' edges, and
further still the colour of the climate's share of them. The land's grids blend their heights by
the distance from the flyer, which moves smoothly while the grids step, and a cloud
grows out of nothing as it comes and fades out of sight past 250 times its radius. A cloud takes its
glow and its ghost's amber by degrees, the light that bursts from it grows out of nothing and
is gone before the next sets off, and the light a cloud flown through sends over the ground fades with
its distance from the flyer. A tree thins out before the camera, which may fly through it. The camera follows a point that follows the next of its views, so it
neither sets off nor arrives at once, and the ground lifts it by degrees before it is reached.

Nothing finer than a pixel is drawn as it is, since the flight would carry it across the pixels as
flicker. Each shader measures how much of its surface a pixel covers (the derivatives of the
place, or of the hairs' own coordinates) and lets detail finer than that give way to its mean: the
octaves of the ground's grain one by one, its flowers, the tilt of its light, the sea's three
sizes of ripple (whose lost slope becomes roughness, so the sun's glitter widens into a glare),
the clumps of a crown's leaves, and the fur's hairs, which merge into a coat of their mean
length. A vein of crystal and a far ring's hoop keep a width of a
pixel or a few and grow fainter in proportion; a wake seen on edge fades; the painted crowns merge
into their share's colour where a pixel covers a crown.

The flyer is a character of our own, made by Blender from a script,
[`flyer.py`](voxel-flyover/flyer.py), when the image is built, into the glTF file the game reads
as it starts ([`model.gd`](voxel-flyover/model.gd), Godot's `GLTFDocument`): a Pembroke corgi in
mirrored sunglasses and a red cape with a gold paw print, on a teal surfboard that two small jets
carry, and under the board a bicycle, on which a pelican in a cyclist's cap, flying goggles and a
scarf pedals for the jets. A chain runs from the chainring up to a sprocket on a shaft between the
two engines, and a fan turns in each engine's intake. The bicycle hangs from the board by its
rear axle and by two rods from its head tube that pass the rider's head on either side.

The script bakes three animations, which the game plays by their names. "pedal" is five turns of
the cranks and all they drive: the legs, laid from hip to knee to pedal, the chain's sixty links
round the chainring and the sprocket, the shaft, the fans and the wheels, so nothing slips, and
the pelican rocking on its saddle. "steer" turns the handlebar, the fork and the front wheel in
the head tube, with the leading edge of each wing laid from shoulder to elbow to the wrist at a
grip and its black-tipped flight feathers along it. "alive" is eight seconds of the pelican
looking about, blinking and clapping its bill, and of the corgi panting, tilting its head and
looking down at the pelican. The game seeks "pedal" by the cranks' angle, which turns faster the
faster the board flies, and "steer" by the flight's turn, and plays "alive" round.

Parts the script marks in their extras get the game's own surfaces. A coat is fur in 18 shells
([`fur.gdshader`](voxel-flyover/fur.gdshader)): each furred part is drawn again and again a little
further out along its normals, keeping the pixels where a hair is that long, in the colours the
script painted on its vertices (the corgi's tan back and white chest, belly, blaze and muzzle),
and the hairs lean and shiver in the air the flight drives past. A cloth, the cape, the corgi's
tongue, the ends of the scarf and the pelican's long feathers, flutters and swings out of a turn
in its vertex stage ([`cape.gdshader`](voxel-flyover/cape.gdshader)). The corgi crouches lower the
faster it goes and the harder it turns, leans and looks into its turns, and its ears lie back;
each jet leaves a wake, a ribbon the vertex stage lays along the places the board has been
([`wake.gdshader`](voxel-flyover/wake.gdshader)); the flames
([`flame.gdshader`](voxel-flyover/flame.gdshader)) lengthen with each stroke of a leg and carry a
ring of brighter gas for it, the nozzles glow with it, and a pulse runs down each wake.

### The flyer in Blender

`blender-flyover` holds Blender and the game on one filesystem. Blender's window opens on its
Scripting workspace, `flyer.py` in the Text Editor and the flyer it made in the 3D view; Run Script
(Alt+P) makes the flyer anew and writes `/usr/share/voxel-flyover/flyer.glb`, which the game reads
the next time it starts. `blender -b --python /usr/share/voxel-flyover/project/flyer.py` does the
same without the window. The steps of a video of it:

1. Open `blender-flyover`: Blender shows the script and the flyer.
2. In the Text Editor, change `CAPE = (0.8, 0.05, 0.08)` near the top to another colour, such as
   `(0.1, 0.3, 0.9)`, and press Alt+P: the cape in the 3D view turns blue.
3. Quit Blender (Ctrl+Q) and run `voxel-flyover`: the corgi flies in a blue cape, the pelican
   pedalling and steering under it.

The world has a year of three days and weather. The seasons are three shares the shaders are
told: more groves blossom in spring and more turn in autumn, each tree in its own time; in winter
the broad crowns are bare, snow comes down the slopes and lies on crowns and roofs, and the rain
is snow ([`flora.gdshaderinc`](voxel-flyover/flora.gdshaderinc)). Under the deep of a cloud it
rains: the land is darker and glossier, the sea pocked, and drops fall through a box of air
around the camera ([`rain.gdshader`](voxel-flyover/rain.gdshader)): each a card that faces the
camera, a thin soft streak along its way for a drop and a soft round dot for a flake. The wind
carries them and the flight slants them back by no more than half of their fall, so they come
down on the screen. With the sun out a rainbow stands opposite it. Low clouds drift under the
high layer ([`cloud.gdshader`](voxel-flyover/cloud.gdshader)): clusters of soft balls, one for a
cell of a grid, that the board flies under, beside and through; a ball draws in before the
camera and the air whitens inside one. Mist of the same balls, flat, lies on the sea and the low
ground, and the haze over the sea thickens with it at dawn. Where it rains a curtain hangs from
the cloud to the ground, seen from afar ([`curtain.gdshader`](voxel-flyover/curtain.gdshader)),
and the wind's gusts cross the grass, the crops and the sea as paler and rougher bands, and bend
the trees' crowns on a strong adapter. The deepest clouds stand together as a storm and are lit
from within by lightning now and then. High over the clouds lie thin streaks of cloud that hold
the sun's fire after the ground has lost it. The open sea has a swell whose crests break white
in a gust, surf rolls in lines over the shallows, light dances on their bed, and the sea is
turquoise in the hot countries and grey-green in the cold ones.

The desert's sand lies in rippled dunes, its veins are lava, its rock is sandstone in red and
paler bands, and at night a shooting star crosses
every six seconds. In the desert's low level basins the ground is a white crust of salt cracked
into plates, glossy after rain. Between the desert and the meadows lies savanna, grass with a few flat-headed
trees, gold for most of the year and green in spring and after rain. In warm dry farm country a
field in three is flowers in rows in spring and summer: lavender, sunflowers or poppies. Low wet ground by the sea
is marsh, with few trees and pools that mirror the sky. In winter the pools and the seas of the
cold lands carry ice ([`water.gdshader`](voxel-flyover/water.gdshader)), and a town's lamps are
each lot's own colour. A shower leaves the ground wet behind it for three quarters of a minute.
A cloud flown through warms the ground some 90 units around the place under it: the snow and the ice draw back there and
more flowers stand. A hollow of the ground is wetter and darker than a spur and keeps its snow
longer (the difference of the ground's two textures).

The world is large by slow fields (`slow` in
[`terrain.gdshaderinc`](voxel-flyover/terrain.gdshaderinc)): two octaves of noise each, of 1.9,
2.7, 4.7, 5.1, 6.3, 7.3, 11, 19 and 53 thousand units, each turned and placed by itself, so their
combinations do not come round again. Oceans and continents of 7.3 thousand units and lands of
2.7 thousand shift the coasts of 520, so an ocean has islands only; the relief of a region makes
its ranges low or high; a massif, rare, raises its peaks to two and a half times
(the nearest is some eleven thousand units from the start); rivers at the sea's level follow a
meandering noise's contour through valleys, widen into lakes in some stretches, and narrow to
their springs in the hills. A river flows: on its water the ripples and streaks of foam run along
its contour (`river_flow` in [`water.gdshader`](voxel-flyover/water.gdshader), a flow map's two
phases, so they run on without stretching), each river one way all along. Where a grid's ground
is too coarse to cut a river (cells of 96 units and more) it is drawn as a line of water along
its contour, as wide as the river or a pixel and as strong as the share of the pixel it covers, out
to pixels of 250 units (`land.gdshader`); lakes above the sea, waterfalls, bridges and rivers seen
from orbit are `tasks/20261119-083500-planet-rivers-2`'s. Warmth and
moisture have countries of 19 and 11 thousand units; and a realm of wonders, a tenth of the
world at 53 thousand (the nearest fourteen thousand north of the start), has a sea alight at
night, groves that mostly glow and bright veins. The ground's textures also carry the realm, and
keep heights around 110 so the half floats stay fine on a massif. Where a field of 4.7 thousand
units is high in a hot dry region the land is mesa country (`mesa_on`): a level desert floor out
of which mesas and buttes stand, flat tops in one tier or two over cliffs some 34 units high,
which the rivers cut into canyons (11.5% of the land within 40,000 units of the start; the nearest
2,000 units from it). In the warm open ocean, where a field of 6.3 thousand units is high, the deep
floor rises in seamounts, and around their peaks the contour of a noise of 1,100 units is a reef
that breaks the surface in sandy islets around a shallow turquoise lagoon (`with_atolls`; an atoll
is a contour, not a shape put on a lattice, so none is cut where a lattice's cells meet on the
sphere). terrain.gd computes both, so the board flies over the buttes and the islets.

Towns stand on some low plains ([`city.gdshader`](voxel-flyover/city.gdshader)), of eight kinds by
their climate, their ground and the culture of their region (`town_kind`): a city of towers (three in ten end in a point of green copper or slate) on
blocks of four lots by five between asphalt avenues; a town of gabled timber-frame houses under
red tiles; a desert town of mud-brick cubes, some under whitewashed domes; a village of dark
timber under steep turf roofs in the cold; a town of walls between red posts under wide roofs
with upturned eaves; thatched houses on posts over the shallows of a warm wet coast; a
whitewashed town with blue domes on a warm coast; round thatched huts on the savanna. All are
one mesh, four walls and a roof of 4 by 4 squares, that the vertex stage shapes by the kind;
the fragment stage draws storeys, windows lit at night, frames, planks, tiles, turf or thatch.
The buildings are drawn to 1,600 units (a weak adapter draws fewer), the same lots the same
buildings at every distance, lower the further they are; beyond 33 lots the mesh has a plainer
roof whose shape the near roofs take before they meet. No tree stands in a town or near it, and
few on its fields, which lie in strips between hedges, green in spring and gold by late summer,
or on warm wet slopes in terraces along the contours that are flooded in spring.

A plot of 260 units has one landmark at most, by its place (`landmark` in
[`terrain.gd`](voxel-flyover/terrain.gd), built by [`landmarks.gd`](voxel-flyover/landmarks.gd)):
a lighthouse with turning beams, a windmill among fields, the tower of a town's kind, an arch of
stone in the desert, giant mushrooms that glow in a marsh, a ring of standing stones, crystals in
the mountains, a gate on open ground, a wreck on a shore, a keep with its fallen wall on a hill,
a stepped mound in the hot wet lands, a tree far older than its wood, a cinder cone that smokes in the dry lands, an island that floats in the board's way, which passes over or under it. The forms
take after kinds of building found in many places; none copies a building. Rarer and seen from far
off, the spires of an old world stand on open land ([`spire.gdshader`](voxel-flyover/spire.gdshader),
`spires_near`): slender towers of pale stone 240 to 360 units high, over everything else, with
three balconies and a crystal at the top that glows at night; one for a cell in five or six of a
lattice of 6,000 units in the planet's own axes, so each stays where it stands when the chart's anchor
moves. They grow out of nothing from 24,000 units off and sink back from 25,000 to 40,000 units up,
are placed anew every 1,500 units flown, and are among what the flight looks ahead for. Life is
met by place too, each a grid whose shader places its cell's own: sailing boats
([`afloat.gdshader`](voxel-flyover/afloat.gdshader)), gulls over the coasts and wedges of geese in
spring and autumn ([`wings.gdshader`](voxel-flyover/wings.gdshader)), balloons
([`aloft.gdshader`](voxel-flyover/aloft.gdshader)), whales that blow
([`whale.gdshader`](voxel-flyover/whale.gdshader)), herds on the open land
([`herd.gdshader`](voxel-flyover/herd.gdshader)), dolphins that come up and leap beside a board
that skims the sea, fireflies over the warm wet land at night
([`fireflies.gdshader`](voxel-flyover/fireflies.gdshader)), and at night fireworks over the towns, and over
the towns of red posts and upturned eaves sky lanterns that rise all night and drift with the wind
([`fireworks.gdshader`](voxel-flyover/fireworks.gdshader)). A house that is not a city's tower
stands a little off its lot's middle at an angle of its own, so a village is not a grid.
Trees stand in woods with glades between them (patches cut from the climate's two fields, which
the ground's texture already holds), and among the broad crowns stand palms in the hot wet
lowlands, cypresses where it is warm and dry, and birches toward the cold. The game makes its
sounds before the flight: the jets' drone, a note for each ring of a chain, the rain's patter and the
wash of the sea under a low flight.

The board has one speed, 30 units a second, whatever it does, and the keys steer it as in
v0.1.7 (`hand` in [`main.gd`](voxel-flyover/main.gd)): the arrows or A and D turn its heading,
by degrees up to 0.55 radians a second, and the arrows or W and S raise and lower its nose, no
faster than 0.9 radians a second, the longer the further, to 86 degrees, almost straight up or
down, so the board climbs out of the air. Let go, it turns no more and its nose comes level. Only
a cloud gives more speed (below), which wears off (to 1/e in two and a half seconds). The pelican
pedals as fast as the board flies.

The mouse only looks: it turns the view around the flyer and over or under it, 0.0035 radians a
pixel of the motion the page gives, and leaves the heading as it is; let go, the view comes back
behind the board. Firefox reports the pointer's way to where it was captured as the first motion
after the capture, when the mouse next moves (320 and 115 pixels for a move of 8): that motion is
left. The wheel or Z and X zoom; L lets go of the board and gives the pointer back, as does the
browser's own end of the capture (its Escape, which the game does not bind); Q quits. The keys
show when the board is taken and fade after nine seconds. The ground is not flown
through: the flight looks along its turn for the ground and the roofs ahead and raises the nose
in time to clear them, a second and a half ahead while the corgi flies itself and the last 0.7 s
in the player's hands; coming down onto the ground or the sea, the board is held ten units over
it and its nose comes level. The camera follows the board's heading and pitch a little late, the
mouse's look turned on from there, and it is lifted over the roofs around it. The view
widens and streaks of air show ([`speed.gdshader`](voxel-flyover/speed.gdshader)) as the board
goes faster than 34 units a second. Low over the sea dolphins come up beside the board, and a
flock of birds ([`bird.gdshader`](voxel-flyover/bird.gdshader)) falls in behind it when it
passes; in rain or snow the birds close up and fly low. The flyer's wash bends the crowns it
passes low over.

The rewards are small round clouds to fly through, in chains that climb out of the air
(`chain_start`, `lay_chain`, [`wisp.gdshader`](voxel-flyover/wisp.gdshader)). Seven plots of
1,200 units in ten have a chain of six. Its first cloud hangs 40 to 200 units over what stands
under it, 7 units of radius, and is the one there is until it is flown through. Then the rest
are laid from there, the way the board flew through it, as a hand on the keys flies them: each
next is where the board arrives in 3.5 seconds (the last in up to 4.5, over the air) at the boost
the chain has earned, up a way that steepens from 30-45 degrees by 5 degrees a cloud, turned by
20 to 60 degrees at each, at six tenths of the keys' fastest turn and climb. So a chain is flown
from whichever way its first cloud is met, and the keys have room to spare. A cloud flown through
gives the board 20 units a second of speed over the cruise, which wears off (to 1/e in 2.5 s),
and each next of a chain, flown through within 5 seconds of the one before, doubles it: 40, 80,
160, 320, 640. Since the board is also faster the higher it is, a chain climbs ever faster: laid
from a level flight at the cruise, its fifth cloud is 1,800 to 19,700 units up (5,100 the
median), and its sixth at 60,000, over the air (of 400 plots around the start, 285 have a chain;
the rest of a chain takes 2.1 ms to lay, 4.9 at most, on the frame its first cloud is flown
through). A cloud's radius grows with the height as the board's speed does, so each is as easy to
hit at its own height.

Every cloud that is there counts, and a single one is worth taking: it counts a point and gives
the boost. Each chain shows one cloud, its next: its first, and once that is flown through, the
cloud after the last flown through. The next cloud of the chain the board is in grows out of
nothing and beats, faster as the chain's time runs out, and the one after it shows faintly and
counts too, so the way the chain goes is seen. A cloud flown through goes; a chain let lapse keeps
its next cloud, a cloud to start a chain at, and the rest is laid anew from there when it is
flown through, as from a first cloud (so is a chain met while another goes on, which carries the
chain on). A cloud is flown through within 1.6 of its radii of its middle (`CLOUD_REACH`), all of
its drawn ball, and the way the board went since the last frame is what is tested, so a cloud
passed at speed between two frames counts, as one does on the frame the chart's anchor moves.
Each counts as many points as the chain has clouds, so a chain of six is worth 21. A chain takes
a hand that turns the board at each cloud: flown straight on, the next is missed; the corgi with
`--chain 1`, which holds the keys toward each next cloud (`chase`), flies chains of six in 3.5
seconds a cloud. The score swells, what the cloud added rises from the middle of the screen and
fades, the chain shows under the score with its time left in an arc around the score's ring, and
a note rises with it.

"Dead" clouds, found on 2026-11-19 (the owner: "sometimes they don't do anything"): a cloud
counted within one radius of its middle while its drawn ball bulged to 1.55 radii, and the corgi
flown through every cloud of a chain 1.3 radii off its middle took none of them; a cloud flown
through stayed as a faint ghost of its full size that counted nothing; the faint cloud after the
next showed at its full size and counted nothing; a chain let lapse faded its next cloud, which
counted nothing as it went; and on the frame the chart's anchor moved, high up, the way flown that
frame was not tested.

A cloud is a ball that boils in lobes, turns and breathes, swirled through with hard bands of
every colour, a sixth of the colour wheel each, with a dark seam between each two
([`wisp.gdshader`](voxel-flyover/wisp.gdshader)). It is lit from within in its colours and
brightest at its rim, each band in its own hue (two hues there would add up to white), and never
so bright that the tone mapping whitens it; the environment's glow blooms it, and no fog veils it.
Five sparks, each its own colour round the wheel, whirl around it on tilted rounds. A haze of its
colours lies around it, faint by day (added to a bright sky it only whitens) and a glow by night
([`halo.gdshader`](voxel-flyover/halo.gdshader)). Far off it is drawn no smaller than a
two-hundredth of its distance, a point of colour that is seen; near, it is its own size, which its
reach covers. Flown through, it goes. All of them are instances of one mesh, placed, grown and lit
by its shader (what the two share is [`wisp.gdshaderinc`](voxel-flyover/wisp.gdshaderinc)), which
carries each onto the sphere, so they cost the renderer two things to draw: the clouds and their
haze.

The board flies up to 420 units, over the low clouds and under the high layer. At sunrise and
sunset the sky is in bands (fire at the horizon on the sun's side, rose over it, violet higher,
and opposite the sun the earth's shadow under a rose band), the sun's disc is larger with a band
of light along the horizon, and the clouds are lit from below
([`sky.gdshader`](voxel-flyover/sky.gdshader)). A landmark's still parts are one mesh
(`Parts.bake`): the renderer's time goes by the number of things it draws.

While the game flies itself the camera shows the world: a round of 68 seconds of wide views
behind, beside, above and ahead of the flyer that glide into one another, and five seconds
close beside the pelican.

What an adapter draws is a ladder of seven levels (`LEVELS` in
[`main.gd`](voxel-flyover/main.gd)): the scene's size (scaled up smoothly), four samples a pixel
or one with smoothed edges, the fog's shafts and ambient occlusion, the shadows' cascades, reach
and map, the sky's light, the coats' shells, and how many of the trees' grids are drawn before
the land paints their crowns. The game starts at the top and goes down while a frame takes the
GPU over 14 ms by Godot's timer, and below the last level holds an even rate. Asking that timer
is not free: Godot reads a frame's timestamps back before the next, and in its WebGPU driver for
Dolly the game's thread then waits for the GPU every frame, which took the planet from 56 frames
a second to 35 on the RTX 5070 (2026-11-17, two cores). So the game asks only for an answer
(`pace`): at the start; when most of a second's frames came late; and below the first level every
ten seconds, for whether the level above would fit. The answer is the least of fourteen frames,
since another program on the same GPU makes frames long, not every one of them, and the picture
is not to change for that. Once a level has held, the game leaves it only for an answer half as
much again over the budget: it is rather slower than softer. It goes a level up when the answer,
times what that level costs more, is under the budget; a level that then proves too much has
told what it costs, and is tried again when that would fit. The change between the second and
the third level is made only in a flight's first ten seconds: a pixel has four samples on one
side of it and one on the other, every pipeline is made for its samples, and the first such
change was 5.8 s without a frame in Chrome. (Until 2026-11-17 a level up took a
minute of answers under 4.9 ms, a third of the budget, and the second level costs the RTX 5070
7.5 ms, the first 7.9: a game that another program on the GPU had once slowed stayed on the
level it fell to, softer, and at the last level it stayed held to 30, 20 or 12 frames a second,
since that hold was never let go. The levels' costs on that card are 7.9, 7.5, 2.9, 1.6, 1.5,
1.4 and 0.9 ms, and on the integrated AMD GPU 246, 205, 75, 42, 36, 34 and 18.) The game's step is the time of its last frames together, not of the
last alone: the page shows frames evenly, one at each of the display's, but they are made
unevenly. No level thins
anything by a screen-door of pixels: where two grids of trees overlap, the coarser tree grows
inside the finer one, which then draws back. In Firefox on an integrated AMD GPU, where the
first level drew 5 frames a second 200 ms apart, the game settles on the last level within four
seconds and draws 30 a second 33 ms apart, as it does in Chrome on that GPU (2026-11-15); on the
NVIDIA RTX 5070 it stays on the first, at 60 in Chrome and 59 in Firefox with the GPU at 5.5 ms
a frame.

Most of the start is the engine making its shaders: Godot compiles every variant of each shader
in the program (glslang in Wasm), gpu@0 makes a shader module of each, and the browser compiles
the pipelines drawn, some 200 ms each in Chrome (`tasks/20261119-140500-flyover-start`). Each kind
of standard material is a shader of its own to the engine, so the lit ones of Blender's flyer and
of the painted parts (the landmarks, the jets, the dolphins) have the same features (`Parts.lit`:
cull disabled, the mesh's vertex colours, white where it has none, and emission, black where it
has none), which change nothing that is seen: one shader where they were three, and the flight
makes no shader once it is under way. The coats' skins keep their back faces culled: drawn, they
show through the fur.
### The planet

The world is a planet: a sphere of 600,000 units (a lap along the ground at the board's 30 a
second would take 35 hours) with a horizon that curves, and space over it. Until 2026-11-17 the
game's world was an endless plane; what the planet leaves for later is in its tasks
(`tatr ls :planet`).

The game computes in a flat chart: x and z are distances along the ground from the chart's
anchor, a point of the planet, and the flight, the grids and everything that stands on a lattice
(plots of trees, lots of towns, fields) are as on a plane. Two things put it on the sphere
([`terrain.gdshaderinc`](voxel-flyover/terrain.gdshaderinc)):

- The slow fields of the world (heights, climate, towns, clouds) are evaluated at the point of
  the sphere a chart's place is (`planet_at`), with noise in three dimensions, so they have no
  seam and are the same from every chart. The planet adds fields of its own size: continents and
  oceans, belts of mountains, the weather of whole regions, and the cold of its poles, where the
  snow lies down to the sea and the sea is ice.
- Every vertex stage carries its chart place onto the sphere, relative to the flyer (`lift`).
  Godot here computes in float32, whose steps are a sixteenth of a unit at the planet's radius:
  near the flyer the ground falls away by `2 R sin²(d / 2R)`, computed without the difference of
  two large numbers, and far off the place is turned from the anchor's axes into the flyer's,
  where such steps are nothing. So the flyer's own surroundings stay as flat and as exact as
  a plane's, and the planet is drawn around them.

Eight grids of land instead of three reach round the planet
([`main.gd`](voxel-flyover/main.gd)'s `RINGS`): three to 2,300 units, then cells of
96, 384 and 1,536 units to 147,000, each with its ground in a texture drawn as it steps, and two
of 6,144 and 24,576 that read a texture of the whole planet by longitude and latitude, drawn once
at the start ([`ground.gdshader`](voxel-flyover/ground.gdshader)'s `whole`). A ground read
coarsely is the mean of what is finer than it is read (`fbm3_seen`): far ground does not sparkle
with detail its points cannot hold, and a range that rises over the horizon gains its spurs as
it nears. A grid's own detail gives way to the coarser grid's by the distance from the flyer, and by the flyer's height: 300 of its cells up a grid shows the next one's
ground and is no longer drawn. Far grids draw the sea themselves, level, with its glint. The near
sea, a plane 8,000 units across that follows the flyer, stands in for the first three grids, which
draw none: it is shown while grid 2 is (to 7,200 units up; from 5,000 it takes the far grids' sea's
look, level and without foam, so nothing changes where it gives way to them), it takes the far
sea's blue from out
of the air and its polar ice, and its depth, foam and ice come from the ground the grids read, to
some 2,300 units from the flyer, and past that from grid 3's, which reaches 9,000. (Until
2026-11-18 it read the near grids' textures to its rim, where they wrap around the chart: the far
sea had the depth of other places, white patches of foam and ice with straight edges, which
changed as grid 2 stepped and showed as lines in a recorded tour; and over 7,200 units it read
a texture no longer drawn.)

A board that climbs past 420 units is faster the higher it is (twice as fast every 110 units
over 420, in every direction): the one place its speed changes by its
height alone, as the scale of what it flies over changes. With its nose 30
degrees up it is out of the air (50,000 units) a minute after
it left the ground. The haze thins with height, the sky's shader
([`sky.gdshader`](voxel-flyover/sky.gdshader)) takes the air a ray looks through from the
camera's height (a closed form for an air that thins by 1/e every 7,000 units): the zenith goes
dark first, the stars come out by day, and from outside the air is a rim around the planet, lit
by the sun of the place where the ray passes nearest the ground, so the rim has its day, its
night and its sunsets. The sun is fixed to the planet, which has a day side and a night side.
From over the cloud layer the land's and the sea's shaders lay the layer's clouds over them
(`from_above`), and from out of the air a veil of the planet's own, thin straight down and thick
toward the rim; at night a settled region's towns are one glow. A height is taken off
everything drawn once the flyer is high (`lowered`), so a close view of the corgi does not shake
at a million units, and what follows the flyer (camera, wakes, birds) is carried along with it.

High up, where nothing that stands on the chart's lattice can be seen (over 8,000 units), the
chart's anchor moves under the flyer once it is 120,000 units from it: the new chart's axes are
the old one's at that place, so the heading stays. A dive from orbit so comes down in a chart
whose anchor is near, anywhere on the planet.

The moon is a second world (`moon_on` in [`terrain.gdshaderinc`](voxel-flyover/terrain.gdshaderinc)
and [`terrain.gd`](voxel-flyover/terrain.gd)): a third of the planet's radius, 200,000 units, its
middle 2 million units from the planet's (the game's distance; its ground has the planet's scale),
fixed to the west-north-west of the start, 26 degrees over its horizon there, a disc of 14 degrees
half lit at nine in the morning: the sun gives it phases. Its ground is rolling highlands, seas of
old lava that lie lower and flatter and darker, a grain of small bumps, and craters at three sizes,
each a bowl with a raised rim in a cell of a lattice of its size; grey dust, bright around the
craters it was thrown out of, darker over the seas; no sea of water, no air, no
life. Its ground is drawn once at the start into a texture of the whole moon, as the planet's is.
From the planet the sky draws the moon from that texture, lit by the sun and veiled by the air by
day, and from the moon the planet from its own, with its seas, woods, deserts, snow, the air's rim
and its towns' lights at night ([`sky.gdshader`](voxel-flyover/sky.gdshader)'s `world_seen`).

The board flies to it as it leaves the planet, faster the higher it is over the world it is near.
Once it is nearer the moon's ground than the planet's (`cross_bodies`), the flight is near the
moon: the moon's chart takes it, with its anchor under the board, the grids draw the moon's ground,
and the planet is in the sky; the way back is the same. Nothing seen moves at the crossing: it
comes far from both, some 600,000 units over each, where both are drawn by the sky (from four fifths
of a world's radius over it its far grids go pixel by pixel to the sky's drawing of it,
`set_bodies`), and what the flight carries (the way the board flies, the camera, the board as it
is seen) is turned from the old chart's axes into the new one's. Its up is the other way there, so
the board and the camera turn over to it by degrees in the three seconds after. Toward the crossing
the camera looks down at the world it is near less, and there not at all; the stars are fixed in
the worlds' axes, not the chart's; the far world hides the sun where it stands before it; and a
grid seen again after a crossing shows from the frame after its ground is drawn anew.
`voxel-flyover -- --autopilot SECONDS --moon SECOND` flies by itself to the moon, down to fly low
over its ground for fifteen seconds, and back to the planet's.

`voxel-flyover -- --autopilot SECONDS --tour SECOND` leaves the planet by itself and comes back;
`--high HEIGHT` starts at a height and keeps it.

[`terrain.gd`](voxel-flyover/terrain.gd) computes the world's function for the flight, with the
same integer hash, so the board clears the ground the GPU draws and its clouds hang clear of it. The flight looks at the ground at some thirty places a frame, nearly all beside those of
the frame before: it takes the height between the points of a lattice of 4 units, each computed
once, and a lot's building once (`ground`, `tops`), which is 0.9 ms of script a frame where
computing each place took 7, and a frame of 35 to 58 ms each time the look ahead came to a new lot. The corgi flies itself until Enter or a click takes the board, and until then the camera glides between five views of it, one of them
the pelican's. It turns the heading and the pitch by degrees toward the
way it wants (`fly_itself`): it makes for the first clouds of chains.
The click also gives the game the pointer (the page captures it at a person's click alone), and
the mouse then turns the view; its first motion after the capture is left, since Firefox reports
a jump there. The player's camera looks the way the board is headed, from
behind and over the flyer, so what the board will reach is in the middle of the screen, over the
corgi's ears. The numbers on the screen are the score's: the points, the chain's clouds, and what
a cloud added. On a touchscreen nothing needs a key ([`touch.gd`](voxel-flyover/touch.gd)): the
first touch takes the board; then the left thumb has a stick where it comes down on the lower left
of the screen, which steers as the keys do, sideways to turn and up to climb, down to dive; a
finger elsewhere turns the view as the mouse does (a drag across the screen's shorter side as
1,080 pixels), two fingers zoom as they move apart or together, and the ring with a cross at the
top right gives the board back.
Their sizes go by the screen's shorter side, and a screen held upright takes its angle of view
across, so the flyer and the land beside it stay in it. The game draws 1920 by 1080, which the page fits
into a screen that lies on its side; on a screen held upright it sizes its window to the screen,
in its shape, with no more pixels than 1080 by 1920 (in Firefox no frame is drawn once a surface
of `gpu@0` is sized again, so there the game needs a screen on its side: found 2026-11-17, not
looked into further).
`-- --autopilot SECONDS` prints its frame rate, how even its frames were (median, 95th and 99th
percentiles, maximum, and the frames of over twice and four times the median), the time a frame
took the GPU and the renderer (asked over the flight's last second and a half, whose frames are
not among those counted), the clouds it flew through and what its frame shows.

The world was blocks, then hexagonal columns, and is now smooth land. Its 1920 by 1080 frames take
the GPU 5.2 to 5.5 ms by Godot's own measure and its renderer's thread 0.6 to 0.8 ms, and it draws
60.0 frames a second in Chrome 156 and 59.0 in Firefox, the display's rate (the test, NVIDIA RTX
5070, 2026-11-14), and 60.0 in Chrome while its screen was recorded. Those are a quiet machine's:
beside other work the same test gave 59.2 and 57.7 at a load of 2.7, and 25.9 in Chrome at a load
of 8, where the renderer's thread took 2.8 ms a frame. What was measured on the way, in Chrome:

- Hexagonal columns whose vertex stage computed the terrain's function took 15.6 ms a frame: every
  vertex of every column ran it again in the depth pass, the colour pass and each shadow cascade.
  Reading it from a texture drawn once a step: 9.1 ms; with shorter column sides and two shadow
  cascades, 6.6. In a V8 sampling trace of that flight the game's thread waited in nine samples of
  ten, for the page's next frame or a lock, so the processor does not set the rate.
- The smooth land has 0.3 million triangles where the columns had 3.4: 3.2 ms a frame with two
  cascades over 170 units, 4.3 with four over 420, and 4.6 with 4x MSAA in place of FXAA.
- Trees to 690 units in four rings of detail, where two grids drew them to 256, and the corgi's
  fur: 6.1 ms. One grid of plain crowns for the shadows of all of them, and a slope read from two
  heights more where it was four: 5.4.
- On an Xvfb display Chrome's Vulkan swapchain showed a full-screen page at 27 to 35 frames a
  second whatever it drew, an empty WebGPU canvas too, and 60 at 1280 by 720. With
  `--disable-vulkan-surface` Chrome copies each frame to the X server itself: 60 frames a second
  at 1920 by 1080, of which a capture of the screen at 60 saw 237 in 240. The test and the
  recording run so. The first version of the game drew 42 and 34 frames a second on the swapchain,
  and 60 with the flag. A display the GPU drives was not measured.

Both games build their worlds in scripts as they start. The builders ([`world.gd`](lantern-drift/world.gd)
with its islands and rings, Airtime's [`foundry.gd`](airtime/foundry.gd) and [`pads.gd`](airtime/pads.gd))
are tool scripts, so Godot's editor runs them too and its 3D view shows what the game starts in;
what they build there is not the scene's and is not saved with it.

## Building

Godot's build is SCons over its own platforms, each a directory of
`platform/`. Dolly's is [`platform/`](platform), placed as `platform/dolly`
([`prepare-sources.sh`](prepare-sources.sh)):

- [`detect.py`](platform/detect.py) names Dolly's `cc`, `c++` and `ar`
  (LLVM's, which writes its own index, so no ranlib), the `wasm64`
  architecture, an export template's build (`template_release`) and the
  Compatibility renderer, with Mesa's EGL and its softpipe driver linked in,
  beside the RenderingDevice driver on `gpu@0`
  ([`rendering_device_driver_webgpu.cpp`](platform/rendering_device_driver_webgpu.cpp),
  [task](../../tasks/20261108-040718-godot-gpu/TASK.md)) and the translator of
  Godot's SPIR-V into WGSL ([`spirv-wgsl`](spirv-wgsl)).
- [`os_dolly.cpp`](platform/os_dolly.cpp) is the operating system as Godot
  sees it: Godot's Unix driver for files, clocks and processes, Dolly's name
  and feature (`OS.has_feature("dolly")`), the program's path from
  `/proc/self/exe`, the XDG directories as on Linux, and the main loop, which
  runs until the project quits. [`godot_dolly.cpp`](platform/godot_dolly.cpp)
  is `main`.
- [`display_server_dolly.cpp`](platform/display_server_dolly.cpp) is the
  window: the page's canvas through `display@0`, keys, text, the pointer and
  the wheel of `input@0` (keys mapped by Godot's web platform's table; a thread of
  its own stamps each record with the time it came, by which a second press within
  400 ms and 5 pixels is a double click, also where a frame takes a second), the
  fingers of `touch@0` as Godot's screen touches and drags (each with the lowest
  free index from its down to its up, the first's second down within 400 ms and 5
  pixels a double tap; Godot makes the mouse of the first where a project leaves
  `emulate_mouse_from_touch` on, its default), and an
  OpenGL 3.3 core context on Mesa's surfaceless EGL platform. Godot draws into
  a pbuffer of the window's size; each frame is read back, turned upright and
  presented, and with vsync Godot then waits for the page's next animation
  frame. Where `DISPLAY` names an X server (`x11-desktop`), the window is one of
  its windows instead, through [`x11-window`](../x11/README.md), whose records are
  `input@0`'s: the window manager moves, resizes and closes it, and frames
  RenderingDevice draws into a texture are read back and put in it. Its clipboard
  is `clipboard@0`'s ([input](../../docs/input.md#clipboard)), and the program's
  own beside a program that holds that; the screen is never kept on, as on
  Godot's web platform.
- [`audio_driver_dolly.cpp`](platform/audio_driver_dolly.cpp) plays Godot's
  mix as `audio@0`'s stereo float PCM at 48 kHz: a thread of its own keeps
  100 ms queued ahead of the page, as the SDL port does.
- [`SCsub`](platform/SCsub) links the program, with Godot's GLAD loader,
  which takes OpenGL's functions from `eglGetProcAddress`.

The recipe builds with the `mesa` package ([Ghostty's GTK demo](../ghostty-gtk/README.md))
and leaves out the modules a 2D project does not need
(`modules_enabled_by_default=no`): GDScript, 2D physics and the fallback
text server with FreeType, and no 3D, 761 units in place of Godot's 2,097.
In a session in Chrome they compiled in 5 min 43 s at four jobs. A GDScript
loop of primes and dictionary updates took 1.19 s in Chrome and 0.32 s in
Godot's own Linux build (2026-11-07).

Softpipe runs every shader in its interpreter on the CPU: a scene of a
background, a textured sprite and a label draws at 11.7 frames a second at
640 by 360 and 42.2 at 320 by 180, with or without vsync (Chrome, 2026-11-08);
in the test, 12.0 in Chromium and 12.8 in Firefox.
Its frame matches the one Godot's Linux build draws on llvmpipe except for
rounding: 5,366 of 230,400 pixels differ, 111 by more than 32 levels, all in
the label's last two words.

The editor ([`Dollyfile-godot-editor`](Dollyfile-godot-editor)) is the same
release on the same platform with Godot's default modules, 2,561 units,
less two: Basis Universal, whose encoder names a header of Linux's that
Emscripten's libc and Dolly's leave out (`sys/timex.h`), and Jolt Physics,
which knows WebAssembly only as Emscripten (3D physics is Godot's own). It
compiled in 26 minutes in the image build, a 182 MB program. Its debugger listens on a local
socket (below). The GDScript language server and the Debug Adapter server serve other editors
over TCP, which Dolly does not have: the language server's one module of its own, JSON-RPC, is
not built (upstream's switch), and the patch leaves the adapter out. The template packages the
modules an exported game loads beside the engine's: Ogg Vorbis, MP3, WebP,
regular expressions and glTF, which Voxel Flyover reads its flyer with.

[`Dollyfile-dodge-the-creeps`](Dollyfile-dodge-the-creeps) takes the game
from the demo projects' release as published, gives it an export preset,
which the release does not carry, and has the editor import its assets and
export its pack while the package builds.

What the platform decides ([process model](../../docs/process-model.md)):

- Threads: Mesa is built with `-pthread`, so Godot is too (`threads@0`).
- One window, the page's canvas, which scales the frame; Godot's window
  size is the project's. On an X server, one window there.
- Keys: the editor's and the Project Manager's Ctrl+C is Copy, as in a window on
  a desktop: while it has the page they clear `ISIG` on their terminal, so the
  interrupt key is theirs ([process model](../../docs/process-model.md)), and
  their Quit ends them. A game keeps Ctrl+C as the terminal's interrupt.
- Sockets: Godot links Dolly's local stream sockets (`sockets@0`). The editor's
  debugger listens at `/tmp/godot-debugger-PID.sock` (the patch: upstream's default
  is TCP, which has no network here), and a game the editor runs connects there:
  its output, errors and breakpoints reach the editor.
- Processes start with `posix_spawn`, as Dolly has no `fork`. An instance of
  Godot asked for without its PID (the Project Manager opening a project,
  the editor's restart or its return to the project list) takes the
  program's place by `execv` when the program ends that frame, as Godot's
  web editor runs a new editor in its canvas once the old one exits: one
  surface and one foreground. If the program goes on, it is a child.
- An export template runs only the pack beside it unless it is built with
  `disable_path_overrides=no`, which lets `--path` and `--script` name a
  project. A project the editor has not imported has no
  `.godot/global_script_class_cache.cfg`; the template says so ("Could not
  load global script cache") and runs it.
- Godot reads `CLOCK_MONOTONIC_RAW` where the headers define it, and its
  Unix file access links the extended-attribute calls: Dolly's libc reads
  that clock from the monotonic one and fails the calls with `ENOTSUP`.
- SCons takes a compiler on `PATH` only by its execute bit, which Dolly does
  not keep; the platform names the compiler.

Test: [`test/godot-browser.mjs`](test/godot-browser.mjs) installs the
package into `default`, runs a project headless whose script computes,
emits a signal, adds a node, sleeps, waits on a timer, writes and reads JSON
under `user://` and quits with a status of its choosing. Then a 2D scene
draws on the page: the test waits for it on the canvas, hears its tone on the
right channel only, sends a key and a click that its script reports, and the
script checks pixels of its frame, in Chromium and Firefox.

[`test/godot-editor-browser.mjs`](test/godot-editor-browser.mjs) installs the
editor and the game: the editor imports an SVG into a project and exports
its pack, which `godot` runs; the game shows its title on the page and
starts on Enter, its score counting; and the editor opens its own window on
the page and shows its 2D view at a click on the tab, in Chromium (46.3 s)
and Firefox (50.4 s).

[`test/godot-gpu-browser.mjs`](test/godot-gpu-browser.mjs) runs Godot's
RenderingDevice on `gpu@0` (`platform/rendering_device_driver_webgpu.cpp`) on
a hardware adapter, in Chrome and the installed Firefox on a display: a 2D
scene on the Mobile renderer, a 3D scene with a sky, light and shadow, and
the editor, each reading its own frame back.

[`test/godot-projects-browser.mjs`](test/godot-projects-browser.mjs) opens each game's project
in the editor as a newcomer does, on a hardware adapter, in Chrome and Firefox: a probe plugin
counts the meshes the scene shows and the colours of the 3D view; the HUD is hidden with its eye,
the game runs with F5 and the scene is saved; a node's name copied in its rename field is the
browser's clipboard's and pastes into another's, and the browser's text pastes as a third's.
Both games passed in both browsers on 2026-11-13, the editor's log without an error.

[`test/godot-flyover-browser.mjs`](test/godot-flyover-browser.mjs) opens `godot-voxel-flyover` from
the front page's list of applications, on a hardware adapter, in Chrome and Firefox: the game
draws on `gpu@0`, Enter takes the board, a click captures the pointer, 300 pixels of the mouse
turn the view some 60 degrees and leave the heading as it was, and L gives the pointer back; a click
captures it again, D held turns the board right and W held raises its nose to its limit, almost
straight up; Q leaves the shell. A flight by itself through a morning, from before a chain's first
cloud, flies through it
and reports even frames and a frame with the sky along its top; one that flies on through the
chain as a quick hand would chains five clouds or six and is over the air; and one that leaves the
planet by itself reports a height of over 150,000 units, a chart whose anchor moved on the way,
and a frame with the planet's colours; one flies to the moon, low over its ground, and back to the
planet's, crossing twice.
[`test/godot-flyover-touch-browser.mjs`](test/godot-flyover-touch-browser.mjs) plays it with
fingers alone on a phone's screen (Chrome's touch events, Firefox's touch PointerEvents): held
sideways, a tap takes the board, the left thumb's stick up and to the right turns it and climbs
it while a second finger turns the view, and two fingers apart zoom; held upright (in Chrome), a
tap takes the board and the ring gives it back.

[`test/godot-airtime-browser.mjs`](test/godot-airtime-browser.mjs) opens `godot-airtime` from the
front page, on a hardware adapter, in Chrome and Firefox: a click on the crosshair captures the
pointer, 300 pixels of the mouse to the right and 100 up turn the view 19 and 6 degrees, and Q
prints that and leaves the shell.

[`test/godot-x11-browser.mjs`](test/godot-x11-browser.mjs) installs the editor and Lantern Drift
with amy in `x11-desktop`'s xterm: the game and then the editor open windows of their own on the
X server, take keys and the pointer, and close at twm's Delete. On 2026-11-13 (NVIDIA RTX 5070)
the game's window drew 12 to 14 s after its command and the X server showed 28.2 frames a second
of it in Chrome and 49.0 in Firefox; the editor's window drew 53 s after its command.
