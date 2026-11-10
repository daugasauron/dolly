extends Node
## Sound made at start, with no audio files: a bell for each ring, a step higher for each ring
## in a row; a thud for a crash; wind that rises with speed.

const RATE := 22050

var chimes: Array[AudioStreamWAV] = []
var thud: AudioStreamWAV
var bells: Array[AudioStreamPlayer] = []
var next_bell := 0
var air: AudioStreamPlayer
var playback: AudioStreamGeneratorPlayback
var gust := 0.0
var level := 0.0
var wanted_level := 0.0


func _ready() -> void:
	# A pentatonic scale over two octaves.
	for step in [0, 2, 4, 7, 9, 12, 14, 16]:
		chimes.append(bell(440.0 * pow(2.0, step / 12.0), 0.9))
	thud = noise_burst(0.5)
	for i in 4:
		var player := AudioStreamPlayer.new()
		player.volume_db = -8.0
		add_child(player)
		bells.append(player)
	var generator := AudioStreamGenerator.new()
	generator.mix_rate = RATE
	generator.buffer_length = 0.15
	air = AudioStreamPlayer.new()
	air.stream = generator
	air.volume_db = -14.0
	add_child(air)
	air.play()
	playback = air.get_stream_playback()


func chime(streak: int) -> void:
	play(chimes[mini(streak - 1, chimes.size() - 1)])


func crash() -> void:
	play(thud)


func play(stream: AudioStream) -> void:
	var player := bells[next_bell]
	next_bell = (next_bell + 1) % bells.size()
	player.stream = stream
	player.play()


## Wind for the frame: brown noise, louder and brighter with speed.
func wind(speed: float, _light: float) -> void:
	wanted_level = clampf((speed - 15.0) / 70.0, 0.05, 1.0)
	var frames := playback.get_frames_available()
	var bright := 0.02 + wanted_level * 0.06
	for i in frames:
		level = lerpf(level, wanted_level, 0.0005)
		gust = lerpf(gust, randf_range(-1.0, 1.0), bright)
		var sample := gust * level * 1.6
		playback.push_frame(Vector2(sample, sample))


static func bell(frequency: float, seconds: float) -> AudioStreamWAV:
	var count := int(RATE * seconds)
	var data := PackedByteArray()
	data.resize(count * 2)
	for i in count:
		var t := float(i) / RATE
		var tone := sin(TAU * frequency * t) + 0.45 * sin(TAU * frequency * 2.76 * t) * exp(-t * 6.0) \
			+ 0.25 * sin(TAU * frequency * 5.4 * t) * exp(-t * 11.0)
		var value := tone * exp(-t * 3.2) * minf(1.0, t * 400.0) * 0.45
		data.encode_s16(i * 2, int(clampf(value, -1.0, 1.0) * 32767.0))
	return wav(data)


static func noise_burst(seconds: float) -> AudioStreamWAV:
	var count := int(RATE * seconds)
	var data := PackedByteArray()
	data.resize(count * 2)
	var low := 0.0
	for i in count:
		var t := float(i) / RATE
		low = lerpf(low, randf_range(-1.0, 1.0), 0.08)
		var value := (low * 1.8 + sin(TAU * 70.0 * t) * 0.6) * exp(-t * 7.0)
		data.encode_s16(i * 2, int(clampf(value, -1.0, 1.0) * 32767.0))
	return wav(data)


static func wav(data: PackedByteArray) -> AudioStreamWAV:
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = RATE
	stream.stereo = false
	stream.data = data
	return stream
