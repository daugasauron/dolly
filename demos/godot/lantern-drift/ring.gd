@tool
extends Area3D
## A ring of light. The glider flying through it refills its lantern; the ring bursts into sparks.

signal taken(ring: Area3D)

var collected := false

@onready var band: MeshInstance3D = $Band


func _ready() -> void:
	body_entered.connect(_on_body_entered)


func _process(delta: float) -> void:
	band.rotate_object_local(Vector3.UP, delta * 0.7)
	if collected:
		band.scale = band.scale.lerp(Vector3.ONE * 2.2, 1.0 - exp(-delta * 6.0))
		band.transparency = minf(1.0, band.transparency + delta * 2.5)
		$Glow.light_energy = maxf(0.0, $Glow.light_energy - delta * 3.0)


func _on_body_entered(body: Node3D) -> void:
	if collected or not body.has_method("refill"):
		return
	collected = true
	$Burst.emitting = true
	taken.emit(self)
