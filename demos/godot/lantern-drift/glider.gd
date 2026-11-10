extends CharacterBody3D
## The paper glider and its lantern. It always flies forward; the player turns and climbs it.
## The lantern's light drains as it flies and faster when boosting; without light the glider
## loses lift and sinks.

signal crashed(reason: String)

const BASE_SPEED := 24.0
const TOP_SPEED := 62.0
const BOOST := 22.0
const TURN_RATE := 1.35
const CLIMB_RATE := 1.0
const MAX_PITCH := 0.62
const DRAIN := 0.042
const BOOST_DRAIN := 0.16
const CEILING := 95.0
const FLOOR := -11.0

var speed := BASE_SPEED
var light := 1.0
var flying := false
var boosting := false
var yaw := 0.0
var pitch := 0.0
var bank := 0.0
var sink := 0.0
# The steering the player or the autopilot asks for: x turns right, y climbs.
var steering := Vector2.ZERO
var distance := 0.0

@onready var body: Node3D = $Body
@onready var lamp: OmniLight3D = $Light
@onready var lantern: MeshInstance3D = $Body/Lantern
@onready var sparks: GPUParticles3D = $Sparks


func start(at: Vector3) -> void:
	position = at
	yaw = 0.0
	pitch = 0.0
	bank = 0.0
	sink = 0.0
	speed = BASE_SPEED
	light = 1.0
	distance = 0.0
	flying = true
	visible = true
	sparks.emitting = true
	for trail in [$TrailLeft, $TrailRight]:
		trail.clear()


func stop() -> void:
	flying = false
	sparks.emitting = false


func refill(amount: float) -> void:
	light = minf(1.0, light + amount)
	speed = minf(TOP_SPEED, speed + 2.5)


func forward() -> Vector3:
	return -global_basis.z


func _physics_process(delta: float) -> void:
	if not flying:
		return
	var wanted_boost := boosting and light > 0.05
	light = maxf(0.0, light - delta * (DRAIN + (BOOST_DRAIN if wanted_boost else 0.0)))
	speed = minf(TOP_SPEED, speed + delta * 0.35)

	yaw -= steering.x * TURN_RATE * delta
	pitch = clampf(pitch + steering.y * CLIMB_RATE * delta, -MAX_PITCH, MAX_PITCH)
	pitch = move_toward(pitch, 0.0, delta * 0.25 * (1.0 - absf(steering.y)))
	# Without light the lantern stops lifting the wing: the glider noses down and sinks.
	sink = move_toward(sink, 9.0 if light <= 0.0 else 0.0, delta * 4.0)
	if position.y > CEILING:
		pitch = minf(pitch, -0.1)
	bank = lerpf(bank, -steering.x * 0.75, 1.0 - exp(-delta * 5.0))

	rotation = Vector3(pitch, yaw, 0.0)
	body.rotation = Vector3(0.0, 0.0, bank)
	var pace := speed + (BOOST if wanted_boost else 0.0)
	velocity = forward() * pace + Vector3.DOWN * sink
	var hit := move_and_collide(velocity * delta)
	distance += pace * delta
	if hit:
		crash("You flew into an island")
	elif position.y < FLOOR:
		crash("Your lantern sank into the clouds" if light <= 0.0 else "You dived into the clouds")

	var glow := 0.25 + light * 0.75
	lamp.light_energy = 2.6 * glow * (1.25 if wanted_boost else 1.0)
	lantern.scale = Vector3.ONE * (0.55 + 0.45 * glow)
	sparks.amount_ratio = 0.3 + light * 0.7


func crash(reason: String) -> void:
	stop()
	crashed.emit(reason)
