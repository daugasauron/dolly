// Godot's RenderingContextDriver on gpu@0: one device, the browser's WebGPU adapter as gpu@0
// grants it, and one surface, the page's frame, or, with present set, a texture read back after
// each frame and handed to present (an X window): rows of stride bytes, blue first.
#pragma once

#include "servers/rendering/rendering_context_driver.h"

class RenderingContextDriverWebGPU : public RenderingContextDriver {
public:
	typedef void (*Present)(const uint8_t *p_pixels, uint32_t p_width, uint32_t p_height, uint32_t p_stride);
	Present present = nullptr;

	struct Surface {
		uint32_t width = 0, height = 0;
		DisplayServerEnums::VSyncMode vsync = DisplayServerEnums::VSYNC_ENABLED;
		bool needs_resize = false;
	};

	Error initialize() override;
	const Device &device_get(uint32_t p_device_index) const override { return device; }
	uint32_t device_get_count() const override { return 1; }
	bool device_supports_present(uint32_t p_device_index, SurfaceID p_surface) const override { return true; }
	RenderingDeviceDriver *driver_create() override;
	void driver_free(RenderingDeviceDriver *p_driver) override;
	SurfaceID surface_create(const void *p_platform_data) override;
	void surface_set_size(SurfaceID p_surface, uint32_t p_width, uint32_t p_height) override;
	// The page shows a frame at each of its animation frames (gpu@0's pacing): vsync is on.
	void surface_set_vsync_mode(SurfaceID p_surface, DisplayServerEnums::VSyncMode p_vsync_mode) override {}
	DisplayServerEnums::VSyncMode surface_get_vsync_mode(SurfaceID p_surface) const override { return DisplayServerEnums::VSYNC_ENABLED; }
	// gpu@0's surface is SDR.
	void surface_set_hdr_output_enabled(SurfaceID p_surface, bool p_enabled) override {}
	bool surface_get_hdr_output_enabled(SurfaceID p_surface) const override { return false; }
	void surface_set_hdr_output_reference_luminance(SurfaceID p_surface, float p_reference_luminance) override {}
	float surface_get_hdr_output_reference_luminance(SurfaceID p_surface) const override { return 0.0f; }
	void surface_set_hdr_output_max_luminance(SurfaceID p_surface, float p_max_luminance) override {}
	float surface_get_hdr_output_max_luminance(SurfaceID p_surface) const override { return 0.0f; }
	void surface_set_hdr_output_linear_luminance_scale(SurfaceID p_surface, float p_linear_luminance_scale) override {}
	float surface_get_hdr_output_linear_luminance_scale(SurfaceID p_surface) const override { return 1.0f; }
	float surface_get_hdr_output_max_value(SurfaceID p_surface) const override { return 1.0f; }
	uint32_t surface_get_width(SurfaceID p_surface) const override;
	uint32_t surface_get_height(SurfaceID p_surface) const override;
	void surface_set_needs_resize(SurfaceID p_surface, bool p_needs_resize) override;
	bool surface_get_needs_resize(SurfaceID p_surface) const override;
	void surface_destroy(SurfaceID p_surface) override;
	bool is_debug_utils_enabled() const override { return false; }

private:
	Device device;
};
