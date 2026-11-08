#include "rendering_context_driver_webgpu.h"

#include "rendering_device_driver_webgpu.h"

#include <dolly/gpu.h>

#include <errno.h>

// gpu@0 opens only where the browser grants an adapter (ENODEV otherwise), and the driver needs
// its explicit records. A scope without a surface asks, then closes.
Error RenderingContextDriverWebGPU::initialize() {
	dolly_gpu *probe = memnew(dolly_gpu);
	const int opened = dolly_gpu_open(probe, 0, 0);
	if (opened < 0) {
		memdelete(probe);
		print_verbose(vformat("gpu@0 is unavailable (errno %d): no WebGPU device.", errno));
		return ERR_CANT_CREATE;
	}
	uint32_t features = 0;
	if (dolly_gpu_capabilities(probe) == 128) {
		memcpy(&features, probe->reply, sizeof(features));
	}
	dolly_gpu_close(probe);
	memdelete(probe);
	ERR_FAIL_COND_V_MSG(!(features & DOLLY_GPU_FEATURE_EXPLICIT), ERR_CANT_CREATE, "gpu@0 lacks its explicit records.");
	// gpu@0 never names the adapter (it would fingerprint the device).
	device.name = "WebGPU";
	device.vendor = Vendor::VENDOR_UNKNOWN;
	device.type = DEVICE_TYPE_OTHER;
	return OK;
}

RenderingDeviceDriver *RenderingContextDriverWebGPU::driver_create() {
	return memnew(RenderingDeviceDriverWebGPU(this));
}

void RenderingContextDriverWebGPU::driver_free(RenderingDeviceDriver *p_driver) {
	memdelete(p_driver);
}

RenderingContextDriver::SurfaceID RenderingContextDriverWebGPU::surface_create(const void *p_platform_data) {
	return SurfaceID(memnew(Surface));
}

void RenderingContextDriverWebGPU::surface_set_size(SurfaceID p_surface, uint32_t p_width, uint32_t p_height) {
	Surface *surface = (Surface *)p_surface;
	surface->width = p_width;
	surface->height = p_height;
	surface->needs_resize = true;
}

uint32_t RenderingContextDriverWebGPU::surface_get_width(SurfaceID p_surface) const {
	return ((Surface *)p_surface)->width;
}

uint32_t RenderingContextDriverWebGPU::surface_get_height(SurfaceID p_surface) const {
	return ((Surface *)p_surface)->height;
}

void RenderingContextDriverWebGPU::surface_set_needs_resize(SurfaceID p_surface, bool p_needs_resize) {
	((Surface *)p_surface)->needs_resize = p_needs_resize;
}

bool RenderingContextDriverWebGPU::surface_get_needs_resize(SurfaceID p_surface) const {
	return ((Surface *)p_surface)->needs_resize;
}

void RenderingContextDriverWebGPU::surface_destroy(SurfaceID p_surface) {
	memdelete((Surface *)p_surface);
}
