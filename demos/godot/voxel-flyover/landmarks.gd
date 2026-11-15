extends RefCounted
## Landmarks: the things a flight comes upon, one at most for a plot of the world, of a kind that
## fits its place (terrain.gd's landmark): a lighthouse on a coast, a windmill among fields, the
## tower of a town's kind, an arch of stone in the desert, giant mushrooms in a marsh, a ring of
## standing stones in the cold, crystals in the mountains, a gate on open ground, an island that
## floats over the sea. Each is built of painted primitives when its plot comes near, and some
## move or glow: `tend` turns the sails and the lamp and lights what glows at night.
## The forms take after kinds of building found in many places; none copies a building.

const Parts := preload("res://parts.gd")
const Terrain := preload("res://terrain.gd")


static func cylinder(top: float, bottom: float, sides := 12) -> CylinderMesh:
	var mesh := CylinderMesh.new()
	mesh.top_radius = top
	mesh.bottom_radius = bottom
	mesh.height = 1.0
	mesh.radial_segments = sides
	mesh.rings = 0
	return mesh


## A part that glows at night: its material joins the landmark's "lights".
static func glowing(mark: Node3D, to: Node3D, mesh: Mesh, colour: Color, place: Vector3, turn := Vector3.ZERO, size := Vector3.ONE) -> MeshInstance3D:
	var material := Parts.paint(colour, 0.4, 1.0)
	var lights: Array = mark.get_meta("lights")
	lights.append(material)
	return Parts.part(to, mesh, material, place, turn, size)


## Builds the landmark terrain.gd found: [place, base, kind, the town's kind, top, radius, own].
static func build(found: Array) -> Node3D:
	var mark := Node3D.new()
	var place: Vector2 = found[0]
	var kind: int = found[2]
	var own: float = found[6]
	mark.position = Vector3(place.x, found[1], place.y)
	mark.rotation.y = own * TAU
	mark.set_meta("lights", [])
	mark.set_meta("kind", kind)
	var box := BoxMesh.new()
	var ball := SphereMesh.new()
	ball.radial_segments = 16
	ball.rings = 8
	var white := Parts.paint(Color(0.93, 0.92, 0.88), 0.7)
	var stone := Parts.paint(Color(0.42, 0.38, 0.34), 0.9)
	var dark := Parts.paint(Color(0.12, 0.1, 0.1), 0.6)
	var red := Parts.paint(Color(0.72, 0.1, 0.07), 0.6)
	match kind:
		Terrain.LIGHTHOUSE:
			# A white tower with red bands, a gallery, a lantern and its turning beams.
			Parts.part(mark, cylinder(1.8, 3.2, 16), white, Vector3(0, 12, 0), Vector3.ZERO, Vector3(1, 26, 1))
			for band: float in [6.0, 15.0]:
				Parts.part(mark, cylinder(2.5 - band * 0.05, 2.75 - band * 0.05, 16), red, Vector3(0, band, 0), Vector3.ZERO, Vector3(1, 3.5, 1))
			Parts.part(mark, cylinder(2.9, 2.9, 16), dark, Vector3(0, 25.2, 0), Vector3.ZERO, Vector3(1, 0.5, 1))
			glowing(mark, mark, cylinder(1.3, 1.3, 12), Color(1.0, 0.9, 0.6), Vector3(0, 27, 0), Vector3.ZERO, Vector3(1, 3, 1))
			Parts.part(mark, cylinder(0.0, 2.0, 12), red, Vector3(0, 29.6, 0), Vector3.ZERO, Vector3(1, 2.2, 1))
			var lamp := Node3D.new()
			lamp.position = Vector3(0, 27, 0)
			mark.add_child(lamp)
			var beam := StandardMaterial3D.new()
			beam.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
			beam.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			beam.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
			beam.cull_mode = BaseMaterial3D.CULL_DISABLED
			beam.albedo_color = Color(1.0, 0.92, 0.7, 0.0)
			mark.set_meta("beam", beam)
			mark.set_meta("turns", lamp)
			for way: float in [-1.0, 1.0]:
				var ray := Parts.part(lamp, cylinder(3.2, 0.4, 10), beam, Vector3(way * 60, 0, 0), Vector3(0, 0, way * -90), Vector3(1, 120, 1))
				ray.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		Terrain.WINDMILL:
			# A tapered tower under a cap, and four sails that turn in the wind.
			Parts.part(mark, cylinder(2.2, 3.6, 8), white if own > 0.5 else stone, Vector3(0, 7, 0), Vector3.ZERO, Vector3(1, 14, 1))
			Parts.part(mark, cylinder(0.3, 2.6, 8), dark, Vector3(0, 15.4, 0), Vector3.ZERO, Vector3(1, 2.8, 1))
			var hub := Node3D.new()
			hub.position = Vector3(0, 14.2, -2.9)
			mark.add_child(hub)
			mark.set_meta("sails", hub)
			var cloth := Parts.paint(Color(0.85, 0.8, 0.68), 0.8)
			for sail in 4:
				var arm := Node3D.new()
				arm.rotation.z = sail * PI / 2.0
				hub.add_child(arm)
				Parts.part(arm, box, dark, Vector3(0, 5.5, 0), Vector3.ZERO, Vector3(0.3, 11, 0.3))
				Parts.part(arm, box, cloth, Vector3(1.1, 6.5, 0.1), Vector3.ZERO, Vector3(2.0, 8, 0.12))
		Terrain.TOWER:
			build_tower(mark, found[3], own)
		Terrain.ARCH:
			# An arch of the desert's stone: a ring half in the ground, weathered thin at its top.
			var ring := TorusMesh.new()
			ring.inner_radius = 0.72
			ring.outer_radius = 1.0
			ring.rings = 24
			ring.ring_segments = 8
			var size := 18.0 + 22.0 * own
			Parts.part(mark, ring, Parts.paint(Color(0.62, 0.3, 0.16), 0.95), Vector3(0, -size * 0.12, 0), Vector3(90, 0, 0), Vector3(size, size * 0.55, size * 1.15))
		Terrain.MUSHROOMS:
			# Giant mushrooms: pale stalks under wide caps whose undersides glow at night.
			for stalk in 5:
				var tall := 9.0 + 22.0 * Terrain.cell_hash(stalk * 7 + int(own * 1000.0), 3)
				var at := Vector3(cos(stalk * 2.4) * (3.0 + stalk * 2.6), 0, sin(stalk * 2.4) * (3.0 + stalk * 2.6))
				Parts.part(mark, cylinder(0.5, 1.0, 8), white, at + Vector3(0, tall / 2.0, 0), Vector3.ZERO, Vector3(tall * 0.09, tall, tall * 0.09))
				glowing(mark, mark, ball, Color(0.3, 0.9, 0.85) if own > 0.5 else Color(0.95, 0.4, 0.8), at + Vector3(0, tall - 0.2, 0), Vector3.ZERO, Vector3(tall * 0.62, tall * 0.1, tall * 0.62))
				Parts.part(mark, ball, Parts.paint(Color(0.7, 0.16, 0.2) if own > 0.5 else Color(0.35, 0.2, 0.6), 0.6), at + Vector3(0, tall, 0), Vector3.ZERO, Vector3(tall * 0.66, tall * 0.3, tall * 0.66))
		Terrain.STONES:
			# A ring of standing stones, and a lintel over two of them.
			for index in 9:
				var around := index * TAU / 9.0
				var tall := 5.0 + 3.0 * Terrain.cell_hash(index + int(own * 1000.0), 11)
				Parts.part(mark, box, stone, Vector3(cos(around) * 11.0, tall / 2.0 - 0.5, sin(around) * 11.0), Vector3(0, -rad_to_deg(around), 3.0 * (index % 3 - 1)), Vector3(1.5, tall, 2.6))
			Parts.part(mark, box, stone, Vector3(10.4, 7.6, 3.7), Vector3(0, -20, 0), Vector3(1.7, 1.3, 9.5))
		Terrain.CRYSTALS:
			# Crystals: pointed columns that lean out of the rock and glow at night.
			var colour := Color(0.3, 0.85, 1.0) if own > 0.5 else Color(0.95, 0.35, 0.9)
			for shard in 7:
				var tall := 7.0 + 20.0 * Terrain.cell_hash(shard * 5 + int(own * 1000.0), 7)
				var lean := Vector3(22.0 * sin(shard * 1.9), 0, 22.0 * cos(shard * 2.7))
				var at := Vector3(sin(shard * 2.2) * shard * 1.5, 0, cos(shard * 2.2) * shard * 1.5)
				var column := Node3D.new()
				column.position = at
				column.rotation_degrees = lean
				mark.add_child(column)
				glowing(mark, column, cylinder(1.0, 1.0, 6), colour, Vector3(0, tall * 0.4, 0), Vector3.ZERO, Vector3(tall * 0.11, tall * 0.8, tall * 0.11))
				glowing(mark, column, cylinder(0.0, 1.0, 6), colour, Vector3(0, tall * 0.9, 0), Vector3.ZERO, Vector3(tall * 0.11, tall * 0.2, tall * 0.11))
		Terrain.GATE:
			# A gate on open ground: two leaning posts, a beam across them and a longer one over it.
			for side: float in [-1.0, 1.0]:
				Parts.part(mark, cylinder(0.45, 0.6, 10), red, Vector3(side * 4.2, 5.0, 0), Vector3(0, 0, side * 3.0), Vector3(1, 10.5, 1))
			Parts.part(mark, box, red, Vector3(0, 7.6, 0), Vector3.ZERO, Vector3(9.6, 0.7, 0.7))
			Parts.part(mark, box, dark, Vector3(0, 10.4, 0), Vector3.ZERO, Vector3(13.0, 0.9, 1.3))
			Parts.part(mark, box, red, Vector3(0, 9.7, 0), Vector3.ZERO, Vector3(11.4, 0.6, 0.9))
		Terrain.FLOATING:
			# An island that floats: rock that narrows downward under a grassy top, a few trees, and
			# a thread of water that falls from its rim.
			var across := 30.0 + 40.0 * own
			Parts.part(mark, cylinder(1.0, 0.12, 9), stone, Vector3(0, -across * 0.42, 0), Vector3.ZERO, Vector3(across, across * 0.8, across))
			Parts.part(mark, cylinder(0.9, 1.0, 9), Parts.paint(Color(0.2, 0.42, 0.12), 0.9), Vector3(0, 0.6, 0), Vector3.ZERO, Vector3(across, 2.4, across))
			for tree in 6:
				var at := Vector3(cos(tree * 1.1) * across * 0.5 * Terrain.cell_hash(tree, 5), 1.5, sin(tree * 1.1) * across * 0.5 * Terrain.cell_hash(tree, 9))
				Parts.part(mark, cylinder(0.3, 0.4, 6), dark, at + Vector3(0, 2, 0), Vector3.ZERO, Vector3(1.4, 4, 1.4))
				Parts.part(mark, ball, Parts.paint(Color(0.1, 0.5, 0.2).lerp(Color(0.9, 0.5, 0.7), float(tree % 2)), 0.8), at + Vector3(0, 6.5, 0), Vector3.ZERO, Vector3(6, 6, 6))
			glowing(mark, mark, cylinder(0.25, 0.9, 6), Color(0.6, 0.85, 1.0), Vector3(across * 0.86, -across * 0.5, 0), Vector3.ZERO, Vector3(1, across, 1))
	for child in mark.find_children("*", "MeshInstance3D", true, false):
		(child as MeshInstance3D).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return mark


## The tower of a town, by the town's kind.
static func build_tower(mark: Node3D, town_kind: int, own: float) -> void:
	var box := BoxMesh.new()
	var ball := SphereMesh.new()
	ball.radial_segments = 16
	ball.rings = 8
	match town_kind:
		2:
			# A slender tower of mud brick with a gallery and a small white dome.
			var brick := Parts.paint(Color(0.72, 0.52, 0.32), 0.9)
			Parts.part(mark, cylinder(1.5, 2.3, 10), brick, Vector3(0, 15, 0), Vector3.ZERO, Vector3(1, 30, 1))
			Parts.part(mark, cylinder(2.6, 2.2, 10), brick, Vector3(0, 26, 0), Vector3.ZERO, Vector3(1, 1.2, 1))
			Parts.part(mark, ball, Parts.paint(Color(0.92, 0.9, 0.84), 0.6), Vector3(0, 30.4, 0), Vector3.ZERO, Vector3(3.6, 4.4, 3.6))
			glowing(mark, mark, cylinder(1.6, 1.6, 10), Color(1.0, 0.8, 0.45), Vector3(0, 27.6, 0), Vector3.ZERO, Vector3(1, 1.6, 1))
		4:
			# A tower of five storeys, each smaller, each under a wide roof with a lifted rim.
			var wall := Parts.paint(Color(0.6, 0.1, 0.07), 0.7)
			var tile := Parts.paint(Color(0.1, 0.18, 0.17), 0.6)
			for tier in 5:
				var wide := 9.0 - tier * 1.4
				Parts.part(mark, box, wall, Vector3(0, 3 + tier * 6.2, 0), Vector3.ZERO, Vector3(wide, 5.0, wide))
				Parts.part(mark, cylinder(0.55, 1.0, 4), tile, Vector3(0, 6.1 + tier * 6.2, 0), Vector3(0, 45, 0), Vector3(wide * 1.25, 1.6, wide * 1.25))
			glowing(mark, mark, cylinder(0.0, 0.5, 6), Color(1.0, 0.8, 0.3), Vector3(0, 35, 0), Vector3.ZERO, Vector3(1, 6, 1))
		3:
			# A hall of dark timber under three steep roofs, one on another.
			var plank := Parts.paint(Color(0.2, 0.1, 0.06), 0.9)
			for tier in 3:
				var wide := 10.0 - tier * 3.0
				Parts.part(mark, box, plank, Vector3(0, 2.5 + tier * 6.5, 0), Vector3.ZERO, Vector3(wide, 5, wide * 1.3))
				Parts.part(mark, cylinder(0.05, 1.0, 4), plank, Vector3(0, 7.5 + tier * 6.5, 0), Vector3(0, 45, 0), Vector3(wide * 0.95, 5.5, wide * 1.2))
			Parts.part(mark, cylinder(0.0, 0.5, 6), plank, Vector3(0, 26, 0), Vector3.ZERO, Vector3(1, 6, 1))
		6:
			# A white tower with an open top for its bell, under a blue dome.
			var wash := Parts.paint(Color(0.94, 0.94, 0.92), 0.7)
			Parts.part(mark, box, wash, Vector3(0, 8, 0), Vector3.ZERO, Vector3(5, 16, 5))
			for corner in 4:
				Parts.part(mark, box, wash, Vector3(2.0 * (1 if corner % 2 else -1), 18, 2.0 * (1 if corner / 2 else -1)), Vector3.ZERO, Vector3(1, 4, 1))
			glowing(mark, mark, ball, Color(1.0, 0.8, 0.4), Vector3(0, 18, 0), Vector3.ZERO, Vector3(1.6, 2.0, 1.6))
			Parts.part(mark, ball, Parts.paint(Color(0.08, 0.3, 0.75), 0.4), Vector3(0, 20.4, 0), Vector3.ZERO, Vector3(6, 5, 6))
		7:
			# A meeting house: a wide round wall under a tall cone of thatch.
			Parts.part(mark, cylinder(7.0, 7.0, 14), Parts.paint(Color(0.58, 0.36, 0.2), 0.9), Vector3(0, 2.5, 0), Vector3.ZERO, Vector3(1, 5, 1))
			Parts.part(mark, cylinder(0.2, 9.5, 14), Parts.paint(Color(0.6, 0.47, 0.22), 0.9), Vector3(0, 11.5, 0), Vector3.ZERO, Vector3(1, 14, 1))
		1:
			# A square tower with a clock's face, a belfry and a spire.
			var plaster := Parts.paint(Color(0.82, 0.76, 0.62), 0.8)
			Parts.part(mark, box, plaster, Vector3(0, 11, 0), Vector3.ZERO, Vector3(6, 22, 6))
			glowing(mark, mark, cylinder(1.6, 1.6, 16), Color(1.0, 0.95, 0.8), Vector3(0, 18, -3.0), Vector3(90, 0, 0), Vector3(1, 0.3, 1))
			Parts.part(mark, cylinder(0.0, 1.0, 4), Parts.paint(Color(0.35, 0.4, 0.42), 0.5), Vector3(0, 28, 0), Vector3(0, 45, 0), Vector3(4.6, 12, 4.6))
		_:
			# A city's mast: a needle with a pod near its top and a light on it.
			var steel := Parts.paint(Color(0.6, 0.62, 0.66), 0.4)
			Parts.part(mark, cylinder(0.6, 2.4, 10), steel, Vector3(0, 40, 0), Vector3.ZERO, Vector3(1, 80, 1))
			Parts.part(mark, ball, steel, Vector3(0, 62, 0), Vector3.ZERO, Vector3(9, 4, 9))
			glowing(mark, mark, ball, Color(1.0, 0.2, 0.15), Vector3(0, 80.5, 0), Vector3.ZERO, Vector3(1.2, 1.2, 1.2))


## Moves what moves and lights what glows: `night` between 0 and 1, `seen` how much of the
## landmark is drawn (it grows out of the distance).
static func tend(mark: Node3D, elapsed: float, night: float, seen: float) -> void:
	mark.scale = Vector3.ONE * maxf(seen, 0.001)
	if mark.has_meta("sails"):
		(mark.get_meta("sails") as Node3D).rotation.z = elapsed * 0.9
	if mark.has_meta("turns"):
		(mark.get_meta("turns") as Node3D).rotation.y = elapsed * 0.7
		(mark.get_meta("beam") as StandardMaterial3D).albedo_color.a = 0.06 * night
	if mark.get_meta("kind") == Terrain.FLOATING:
		mark.position.y = mark.get_meta("rests") + 3.0 * sin(elapsed * 0.4 + mark.rotation.y)
	for light: StandardMaterial3D in mark.get_meta("lights"):
		light.emission_energy_multiplier = 0.15 + 3.0 * night
