#include "display_server_dolly.h"

#include "core/input/input.h"
#include "core/os/keyboard.h"
#include "drivers/gles3/rasterizer_gles3.h"
#include "main/main.h"
#include "servers/display/native_menu.h"

#if defined(RD_ENABLED)
#include "rendering_context_driver_webgpu.h"
#include "servers/rendering/renderer_rd/renderer_compositor_rd.h"
#include "servers/rendering/rendering_device.h"
#include "core/config/project_settings.h"
#include "core/os/os.h"
#endif

#include <platform_gl.h>

#include <EGL/eglext.h>

// After Godot's headers: in C++ before C++23, <stdatomic.h>, which these
// include, defines macros over std::atomic's functions.
#include <dolly/display.h>
#include <dolly/input.h>

#include <string.h>

// Godot's map of a browser keyboard event's code and key, which an input@0
// record carries, from its web platform.
typedef char EM_UTF8;
#include "platform/web/dom_keys.inc"

static void set_modifiers(const Ref<InputEventWithModifiers> &p_event, uint32_t p_modifiers) {
	p_event->set_shift_pressed(p_modifiers & DOLLY_INPUT_MOD_SHIFT);
	p_event->set_ctrl_pressed(p_modifiers & DOLLY_INPUT_MOD_CONTROL);
	p_event->set_alt_pressed(p_modifiers & DOLLY_INPUT_MOD_ALT);
	p_event->set_meta_pressed(p_modifiers & DOLLY_INPUT_MOD_META);
}

Vector<String> DisplayServerDolly::get_rendering_drivers_func() {
	Vector<String> drivers;
#if defined(RD_ENABLED)
	drivers.push_back("webgpu");
#endif
	drivers.push_back("opengl3");
	return drivers;
}

DisplayServer *DisplayServerDolly::create_func(const String &p_rendering_driver, DisplayServerEnums::WindowMode p_mode, DisplayServerEnums::VSyncMode p_vsync_mode, uint32_t p_flags, const Point2i *p_position, const Size2i &p_resolution, int p_screen, DisplayServerEnums::Context p_context, int64_t p_parent_window, Error &r_error) {
	DisplayServerDolly *server = memnew(DisplayServerDolly(p_rendering_driver, p_mode, p_resolution, p_vsync_mode, r_error));
	if (r_error != OK) {
		memdelete(server);
		return nullptr;
	}
	return server;
}

void DisplayServerDolly::register_dolly_driver() {
	register_create_function("dolly", create_func, get_rendering_drivers_func);
}

void DisplayServerDolly::dispatch_input_event(const Ref<InputEvent> &p_event) {
	const Callable &callback = static_cast<DisplayServerDolly *>(get_singleton())->input_event_callback;
	if (callback.is_valid()) {
		callback.call(p_event);
	}
}

// OpenGL 3.3 core, which the Compatibility renderer asks of a desktop driver,
// on Mesa's surfaceless platform: a pbuffer is the window's framebuffer.
Error DisplayServerDolly::create_gl_context() {
	egl_display = eglGetPlatformDisplay(EGL_PLATFORM_SURFACELESS_MESA, nullptr, nullptr);
	ERR_FAIL_COND_V(egl_display == EGL_NO_DISPLAY || !eglInitialize(egl_display, nullptr, nullptr), ERR_UNAVAILABLE);
	ERR_FAIL_COND_V(!eglBindAPI(EGL_OPENGL_API), ERR_UNAVAILABLE);
	const EGLint config_attributes[] = {
		EGL_SURFACE_TYPE, EGL_PBUFFER_BIT,
		EGL_RENDERABLE_TYPE, EGL_OPENGL_BIT,
		EGL_RED_SIZE, 8,
		EGL_GREEN_SIZE, 8,
		EGL_BLUE_SIZE, 8,
		EGL_DEPTH_SIZE, 24,
		EGL_NONE
	};
	EGLint count = 0;
	ERR_FAIL_COND_V(!eglChooseConfig(egl_display, config_attributes, &egl_config, 1, &count) || count == 0, ERR_UNAVAILABLE);
	const EGLint context_attributes[] = {
		EGL_CONTEXT_MAJOR_VERSION, 3,
		EGL_CONTEXT_MINOR_VERSION, 3,
		EGL_CONTEXT_OPENGL_PROFILE_MASK, EGL_CONTEXT_OPENGL_CORE_PROFILE_BIT,
		EGL_NONE
	};
	egl_context = eglCreateContext(egl_display, egl_config, EGL_NO_CONTEXT, context_attributes);
	ERR_FAIL_COND_V(egl_context == EGL_NO_CONTEXT, ERR_UNAVAILABLE);
	return create_gl_surface();
}

Error DisplayServerDolly::create_gl_surface() {
	const EGLint attributes[] = { EGL_WIDTH, size.width, EGL_HEIGHT, size.height, EGL_NONE };
	egl_surface = eglCreatePbufferSurface(egl_display, egl_config, attributes);
	ERR_FAIL_COND_V(egl_surface == EGL_NO_SURFACE, ERR_UNAVAILABLE);
	ERR_FAIL_COND_V(!eglMakeCurrent(egl_display, egl_surface, egl_surface, egl_context), ERR_UNAVAILABLE);
	return OK;
}

bool DisplayServerDolly::has_feature(DisplayServerEnums::Feature p_feature) const {
	return p_feature == DisplayServerEnums::FEATURE_MOUSE || p_feature == DisplayServerEnums::FEATURE_CURSOR_SHAPE;
}

Vector<DisplayServerEnums::WindowID> DisplayServerDolly::get_window_list() const {
	Vector<DisplayServerEnums::WindowID> windows;
	windows.push_back(DisplayServerEnums::MAIN_WINDOW_ID);
	return windows;
}

void DisplayServerDolly::window_set_size(const Size2i p_size, DisplayServerEnums::WindowID p_window) {
	if (p_size == size || p_size.width <= 0 || p_size.height <= 0) {
		return;
	}
	dolly_display_surface surface;
	ERR_FAIL_COND(dolly_display_set_size(display, p_size.width, p_size.height, &surface) != 0);
	size = p_size;
#if defined(RD_ENABLED)
	if (rendering_context) {
		rendering_context->window_set_size(DisplayServerEnums::MAIN_WINDOW_ID, size.width, size.height);
		return;
	}
#endif
	eglMakeCurrent(egl_display, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT);
	eglDestroySurface(egl_display, egl_surface);
	create_gl_surface();
}

// The frame Godot drew, read back and presented; with vsync, Godot waits for
// the page's next animation frame, at most 100 ms (a hidden tab shows none).
// RenderingDevice presents its own frames, on gpu@0's surface.
void DisplayServerDolly::swap_buffers() {
	if (rendering_device) {
		return;
	}
	dolly_display_frame frame;
	if (dolly_display_begin_frame(display, &frame) != 0 ||
			frame.width != (uint32_t)size.width || frame.height != (uint32_t)size.height) {
		return;
	}
	const size_t row = (size_t)size.width * 4;
	pixels.resize(row * size.height);
	glBindFramebuffer(GL_READ_FRAMEBUFFER, 0);
	glReadPixels(0, 0, size.width, size.height, GL_RGBA, GL_UNSIGNED_BYTE, pixels.ptr());
	// OpenGL's rows go up from the bottom, a frame's down from the top.
	for (int y = 0; y < size.height; y++) {
		memcpy(frame.pixels + (size_t)y * frame.stride, pixels.ptr() + (size_t)(size.height - 1 - y) * row, row);
	}
	dolly_display_present(display, frame.buffer_index);
	if (vsync_mode != DisplayServerEnums::VSYNC_DISABLED) {
		dolly_display_wait_frame(display, &frame_sequence, 100);
	}
}

void DisplayServerDolly::send_window_event(DisplayServerEnums::WindowEvent p_event) const {
	if (window_event_callback.is_valid()) {
		window_event_callback.call((int)p_event);
	}
}

static void read_key(const dolly_input_event &p_event) {
	char key[32] = {};
	char code[32] = {};
	const size_t key_length = MIN((size_t)p_event.key_length, sizeof(key) - 1);
	const size_t code_length = MIN((size_t)p_event.code_length, sizeof(code) - 1);
	if ((size_t)p_event.key_length + p_event.code_length > sizeof(p_event.data)) {
		return;
	}
	memcpy(key, p_event.data, key_length);
	memcpy(code, p_event.data + p_event.key_length, code_length);
	const String text = String::utf8(key);
	// A key that writes one character names it; text a composition makes
	// arrives as TEXT records.
	const char32_t character = text.length() == 1 && !(p_event.flags & DOLLY_INPUT_FLAG_COMPOSING) ? text[0] : 0;
	const Key keycode = dom_code2godot_scancode(code, key, false);
	Ref<InputEventKey> event;
	event.instantiate();
	event->set_pressed(p_event.action != DOLLY_KEY_ACTION_RELEASE);
	event->set_echo(p_event.action == DOLLY_KEY_ACTION_REPEAT);
	event->set_keycode(fix_keycode(character, keycode));
	event->set_physical_keycode(dom_code2godot_scancode(code, key, true));
	event->set_key_label(fix_key_label(character, keycode));
	event->set_unicode(fix_unicode(character));
	event->set_location(dom_code2godot_key_location(code));
	set_modifiers(event, p_event.modifiers);
	Input::get_singleton()->parse_input_event(event);
}

// Composed or pasted text: a key event for each character, as Godot's other
// platforms send what an input method commits.
static void read_text(const dolly_input_event &p_event) {
	const size_t offset = (size_t)p_event.key_length + p_event.code_length;
	if (offset + p_event.text_length > sizeof(p_event.data)) {
		return;
	}
	const String text = String::utf8((const char *)p_event.data + offset, p_event.text_length);
	for (int index = 0; index < text.length(); index++) {
		Ref<InputEventKey> event;
		event.instantiate();
		event->set_pressed(true);
		event->set_unicode(text[index]);
		Input::get_singleton()->parse_input_event(event);
	}
}

static void read_pointer(const dolly_input_event &p_event, Point2i &mouse_position) {
	static const MouseButton buttons[] = { MouseButton::LEFT, MouseButton::MIDDLE, MouseButton::RIGHT, MouseButton::MB_XBUTTON1, MouseButton::MB_XBUTTON2 };
	Input *input_state = Input::get_singleton();
	const Point2i position(p_event.x, p_event.y);
	BitField<MouseButtonMask> mask = input_state->get_mouse_button_mask();
	if (position != mouse_position) {
		Ref<InputEventMouseMotion> motion;
		motion.instantiate();
		motion->set_position(position);
		motion->set_global_position(position);
		motion->set_relative(position - mouse_position);
		motion->set_button_mask(mask);
		set_modifiers(motion, p_event.modifiers);
		mouse_position = position;
		input_state->parse_input_event(motion);
	}
	const unsigned button = (p_event.flags >> 8) & 7;
	if (p_event.action == DOLLY_POINTER_ACTION_DRAG || button >= std::size(buttons)) {
		return;
	}
	Ref<InputEventMouseButton> event;
	event.instantiate();
	event->set_position(position);
	event->set_global_position(position);
	event->set_button_index(buttons[button]);
	event->set_pressed(p_event.action == DOLLY_POINTER_ACTION_PRESS);
	if (event->is_pressed()) {
		mask.set_flag(mouse_button_to_mask(buttons[button]));
	} else {
		mask.clear_flag(mouse_button_to_mask(buttons[button]));
	}
	event->set_button_mask(mask);
	set_modifiers(event, p_event.modifiers);
	input_state->parse_input_event(event);
}

// A wheel step is a line: 26 CSS pixels make one and 30 lines a page, as the
// SDL port counts them. y is thousandths of the unit, positive downward.
static void read_scroll(const dolly_input_event &p_event, const Point2i &mouse_position) {
	float steps = p_event.y / 1000.0f;
	if (p_event.action == DOLLY_SCROLL_UNIT_PIXEL) {
		steps /= 26.0f;
	} else if (p_event.action == DOLLY_SCROLL_UNIT_PAGE) {
		steps *= 30.0f;
	}
	if (steps == 0) {
		return;
	}
	for (const bool pressed : { true, false }) {
		Ref<InputEventMouseButton> event;
		event.instantiate();
		event->set_position(mouse_position);
		event->set_global_position(mouse_position);
		event->set_button_index(steps > 0 ? MouseButton::WHEEL_DOWN : MouseButton::WHEEL_UP);
		event->set_factor(Math::abs(steps));
		event->set_pressed(pressed);
		event->set_button_mask(Input::get_singleton()->get_mouse_button_mask());
		set_modifiers(event, p_event.modifiers);
		Input::get_singleton()->parse_input_event(event);
	}
}

void DisplayServerDolly::read_event(const dolly_input_event &p_event) {
	switch (p_event.type) {
		case DOLLY_INPUT_EVENT_KEY:
			read_key(p_event);
			break;
		case DOLLY_INPUT_EVENT_TEXT:
			read_text(p_event);
			break;
		case DOLLY_INPUT_EVENT_POINTER:
			read_pointer(p_event, mouse_position);
			break;
		case DOLLY_INPUT_EVENT_SCROLL:
			read_scroll(p_event, mouse_position);
			break;
		case DOLLY_INPUT_EVENT_FOCUS:
			focused = p_event.action;
			if (!focused) {
				Input::get_singleton()->release_pressed_events();
			} else {
				// After a program this one ran had the page (a game the editor
				// runs), its last frame shows until this one draws: draw now, as
				// Godot's X11 platform does on Expose.
				Main::force_redraw();
			}
			send_window_event(focused ? DisplayServerEnums::WINDOW_EVENT_FOCUS_IN : DisplayServerEnums::WINDOW_EVENT_FOCUS_OUT);
			break;
		case DOLLY_INPUT_EVENT_POINTER_PRESENCE:
			send_window_event(p_event.action ? DisplayServerEnums::WINDOW_EVENT_MOUSE_ENTER : DisplayServerEnums::WINDOW_EVENT_MOUSE_EXIT);
			break;
		case DOLLY_INPUT_EVENT_DROPPED:
			// Records were lost: let go of what was held.
			Input::get_singleton()->release_pressed_events();
			break;
	}
}

void DisplayServerDolly::wait_for_event(uint64_t p_usec) {
	if (!woken) {
		woken = dolly_input_next_event(input, &woken_by, p_usec / 1000.0) > 0;
	}
}

void DisplayServerDolly::process_events() {
	if (woken) {
		woken = false;
		read_event(woken_by);
	}
	dolly_input_event event;
	while (dolly_input_next_event(input, &event, 0) > 0) {
		read_event(event);
	}
	Input::get_singleton()->flush_buffered_events();
}

void DisplayServerDolly::cursor_set_shape(DisplayServerEnums::CursorShape p_shape) {
	// In the order of Godot's cursor shapes, from the arrow to help.
	static const uint32_t cursors[] = {
		DOLLY_DISPLAY_CURSOR_DEFAULT, DOLLY_DISPLAY_CURSOR_TEXT, DOLLY_DISPLAY_CURSOR_POINTER,
		DOLLY_DISPLAY_CURSOR_CROSSHAIR, DOLLY_DISPLAY_CURSOR_WAIT, DOLLY_DISPLAY_CURSOR_PROGRESS,
		DOLLY_DISPLAY_CURSOR_MOVE, DOLLY_DISPLAY_CURSOR_POINTER, DOLLY_DISPLAY_CURSOR_NOT_ALLOWED,
		DOLLY_DISPLAY_CURSOR_NS_RESIZE, DOLLY_DISPLAY_CURSOR_EW_RESIZE, DOLLY_DISPLAY_CURSOR_NESW_RESIZE,
		DOLLY_DISPLAY_CURSOR_NWSE_RESIZE, DOLLY_DISPLAY_CURSOR_MOVE, DOLLY_DISPLAY_CURSOR_NS_RESIZE,
		DOLLY_DISPLAY_CURSOR_EW_RESIZE, DOLLY_DISPLAY_CURSOR_HELP
	};
	static_assert(std::size(cursors) == DisplayServerEnums::CURSOR_MAX);
	ERR_FAIL_INDEX(p_shape, DisplayServerEnums::CURSOR_MAX);
	dolly_display_set_cursor(display, cursors[p_shape]);
}

static bool fills_screen(DisplayServerEnums::WindowMode p_mode) {
	return p_mode == DisplayServerEnums::WINDOW_MODE_MAXIMIZED || p_mode == DisplayServerEnums::WINDOW_MODE_FULLSCREEN ||
			p_mode == DisplayServerEnums::WINDOW_MODE_EXCLUSIVE_FULLSCREEN;
}

void DisplayServerDolly::window_set_mode(DisplayServerEnums::WindowMode p_mode, DisplayServerEnums::WindowID p_window) {
	mode = p_mode;
	if (fills_screen(p_mode)) {
		window_set_size(screen, p_window);
	}
}

DisplayServerDolly::DisplayServerDolly(const String &p_rendering_driver, DisplayServerEnums::WindowMode p_mode, const Size2i &p_size, DisplayServerEnums::VSyncMode p_vsync_mode, Error &r_error) {
	r_error = ERR_UNAVAILABLE;
	native_menu = memnew(NativeMenu);
	Input::get_singleton()->set_event_dispatch_function(dispatch_input_event);
	vsync_mode = p_vsync_mode;
	dolly_display_surface surface;
	int error = dolly_display_acquire(&surface);
	ERR_FAIL_COND_MSG(error != 0, vformat("Dolly's display: %s.", strerror(-error)));
	display = surface.generation;
	screen = Size2i(surface.width, surface.height);
	mode = p_mode;
	size = fills_screen(p_mode) ? screen : p_size;
	error = dolly_input_acquire(&input);
	ERR_FAIL_COND_MSG(error != 0, vformat("Dolly's input: %s.", strerror(-error)));
	error = dolly_display_set_size(display, size.width, size.height, &surface);
	ERR_FAIL_COND_MSG(error != 0, vformat("Dolly's display at %dx%d: %s.", size.width, size.height, strerror(-error)));
#if defined(RD_ENABLED)
	// gpu@0 opens where the browser grants a WebGPU adapter; elsewhere Godot falls back to its
	// Compatibility renderer, as its X11 server does when Vulkan fails.
	if (p_rendering_driver == "webgpu") {
		rendering_context = memnew(RenderingContextDriverWebGPU);
		if (rendering_context->initialize() != OK) {
			memdelete(rendering_context);
			rendering_context = nullptr;
			ERR_FAIL_COND_MSG(!GLOBAL_GET("rendering/rendering_device/fallback_to_opengl3"), "No WebGPU device from gpu@0.");
			WARN_PRINT("No WebGPU device from gpu@0: switching to the Compatibility renderer.");
			OS::get_singleton()->set_current_rendering_driver_name("opengl3", OS::RENDERING_SOURCE_FALLBACK);
			OS::get_singleton()->set_current_rendering_method("gl_compatibility", OS::RENDERING_SOURCE_FALLBACK);
		} else {
			ERR_FAIL_COND(rendering_context->window_create(DisplayServerEnums::MAIN_WINDOW_ID, nullptr) != OK);
			rendering_context->window_set_size(DisplayServerEnums::MAIN_WINDOW_ID, size.width, size.height);
			rendering_context->window_set_vsync_mode(DisplayServerEnums::MAIN_WINDOW_ID, p_vsync_mode);
			rendering_device = memnew(RenderingDevice);
			ERR_FAIL_COND_MSG(rendering_device->initialize(rendering_context, DisplayServerEnums::MAIN_WINDOW_ID) != OK, "RenderingDevice did not start on gpu@0.");
			rendering_device->screen_create(DisplayServerEnums::MAIN_WINDOW_ID);
			RendererCompositorRD::make_current();
			r_error = OK;
			return;
		}
	}
#endif
	ERR_FAIL_COND_MSG(create_gl_context() != OK, "No OpenGL 3.3 context from Mesa.");
	RasterizerGLES3::make_current(true);
	r_error = OK;
}

DisplayServerDolly::~DisplayServerDolly() {
#if defined(RD_ENABLED)
	if (rendering_device) {
		rendering_device->screen_free(DisplayServerEnums::MAIN_WINDOW_ID);
		memdelete(rendering_device);
	}
	if (rendering_context) {
		rendering_context->window_destroy(DisplayServerEnums::MAIN_WINDOW_ID);
		memdelete(rendering_context);
	}
#endif
	if (egl_display != EGL_NO_DISPLAY) {
		eglMakeCurrent(egl_display, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT);
		eglTerminate(egl_display);
	}
	if (input) {
		dolly_input_release(input);
	}
	if (display) {
		dolly_display_release(display);
	}
	memdelete(native_menu);
}
