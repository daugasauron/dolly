# The godot demo's upstream source pins, sourced by config/source-pins.sh.

# Godot (demos/godot): the engine's release; SCons, which builds it, is a tools package.
DOLLY_GODOT_VERSION=4.7.2
DOLLY_GODOT_URL='https://github.com/godotengine/godot/releases/download/4.7.2-stable/godot-4.7.2-stable.tar.xz'
DOLLY_GODOT_SHA256=a18ce0ccec3ecc40b0dd6c4f5132ca934e9fb7c2979717940ff32aee1eb35481
# Dodge the Creeps, Godot's first 2D game, from the demo projects' release (demos/godot).
DOLLY_GODOT_DODGE_URL='https://github.com/godotengine/godot-demo-projects/releases/download/4.7-6ad6167/2d_dodge_the_creeps.zip'
DOLLY_GODOT_DODGE_SHA256=cebca9d95eccd4fafa2b9c3892fd75be527c25044e6e78f91fe92b76ece29052
# Truck Town, the demo projects' vehicle physics demo, from the same release (demos/godot).
DOLLY_GODOT_TRUCK_URL='https://github.com/godotengine/godot-demo-projects/releases/download/4.7-6ad6167/3d_truck_town.zip'
DOLLY_GODOT_TRUCK_SHA256=66f95937d190b3b551b3394d6d612c10c710a44f961f3ade058bf1fc545b374b
# Tint, from Dawn, and SPIRV-Tools with SPIRV-Headers (demos/godot): Godot's shaders to WGSL.
# Dawn pins Chromium's Abseil; Tint calls only absl::from_chars, here from Abseil's release.
DOLLY_DAWN_URL='https://github.com/google/dawn/archive/d61d3434d3bed43fba3ace885b06fa77161a4db1.tar.gz'
DOLLY_DAWN_SHA256=b6a330e050cc41a7a8e3809371af3421ec8fd7d4f7d1098ae3e6bdcd299d8111
DOLLY_SPIRV_TOOLS_URL='https://github.com/KhronosGroup/SPIRV-Tools/archive/b570f00a782a7bf4006964e8284dd8c10c4c549b.tar.gz'
DOLLY_SPIRV_TOOLS_SHA256=5f03c36bcf930fdc766821eb76f18fe81ab1492f69e4995d7b6f2b87132c8ffb
DOLLY_SPIRV_HEADERS_URL='https://github.com/KhronosGroup/SPIRV-Headers/archive/6efe5ae6b7c6ad29da3f2cc3f164b9c3d72b78b1.tar.gz'
DOLLY_SPIRV_HEADERS_SHA256=d035de73b4085301bf921dc66997ce993fbf7c0d78f3308e67b6be2513a8b88c
DOLLY_ABSEIL_URL='https://github.com/abseil/abseil-cpp/releases/download/20260817.0/abseil-cpp-20260817.0.tar.gz'
DOLLY_ABSEIL_SHA256=f7e05179df39c45434cad433f5783840bb3788ef322976f9138bc6b72b3a107d
