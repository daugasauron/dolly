#include "display_server_dolly.h"

#include "core/input/input.h"
#include "core/os/keyboard.h"
#include "core/os/os.h"
#include "drivers/gles3/rasterizer_gles3.h"
#include "main/main.h"
#include "servers/display/native_menu.h"

#include "core/config/engine.h"
#include "core/config/project_settings.h"

#if defined(RD_ENABLED)
#include "rendering_context_driver_webgpu.h"
#include "servers/rendering/renderer_rd/renderer_compositor_rd.h"
#include "servers/rendering/rendering_device.h"
#endif

#include <platform_gl.h>

#include <EGL/eglext.h>

// After Godot's headers: in C++ before C++23, <stdatomic.h>, which these
// include, defines macros over std::atomic's functions.
#include <dolly/clipboard.h>
#include <dolly/display.h>
#include <dolly/input.h>
#include <dolly/touch.h>
#include <x11-window.h>

#include <errno.h>
#include <fcntl.h>
#include <stdlib.h>
#include <string.h>
#include <termios.h>
#include <unistd.h>

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
	return p_feature == DisplayServerEnums::FEATURE_MOUSE || p_feature == DisplayServerEnums::FEATURE_CURSOR_SHAPE ||
			p_feature == DisplayServerEnums::FEATURE_CLIPBOARD || (p_feature == DisplayServerEnums::FEATURE_TOUCHSCREEN && touch);
}

// The page's clipboard while the program holds it (clipboard@0); its own otherwise.
void DisplayServerDolly::clipboard_set(const String &p_text) {
	clipboard = p_text;
	if (clipboard_lease) {
		const CharString text = p_text.utf8();
		const int error = dolly_clipboard_write(clipboard_lease, text.get_data(), text.length());
		ERR_FAIL_COND_MSG(error != 0, vformat("The clipboard took no copy: %s.", strerror(-error)));
	}
}

String DisplayServerDolly::clipboard_get() const {
	if (!clipboard_lease) {
		return clipboard;
	}
	LocalVector<char> text;
	text.resize(DOLLY_CLIPBOARD_CAPACITY);
	const int64_t length = dolly_clipboard_read(clipboard_lease, text.ptr(), text.size());
	ERR_FAIL_COND_V_MSG(length < 0, clipboard, vformat("The clipboard could not be read: %s.", strerror(-length)));
	return String::utf8(text.ptr(), MIN(length, (int64_t)text.size()));
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
	if (x11) {
		// The window manager may refuse; the size is what the server reports (resized).
		x11_window_resize(x11, p_size.width, p_size.height);
		return;
	}
	dolly_display_surface surface;
	ERR_FAIL_COND(dolly_display_set_size(display, p_size.width, p_size.height, &surface) != 0);
	resized(p_size);
}

// The window's new size, which the X server or the page's surface reports.
void DisplayServerDolly::resized(const Size2i &p_size) {
	size = p_size;
	if (rect_changed_callback.is_valid()) {
		rect_changed_callback.call(Rect2i(Point2i(), size));
	}
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

// A frame for the X window: the Compatibility renderer's, or RenderingDevice's
// read back (rendering_context_driver_webgpu.h).
void DisplayServerDolly::present(const uint8_t *p_pixels, uint32_t p_width, uint32_t p_height, size_t p_stride, bool p_rgba) {
	const int error = x11_window_present(x11, p_pixels, p_width, p_height, p_stride, p_rgba);
	ERR_FAIL_COND_MSG(error != 0, vformat("The X window took no frame: %s.", strerror(-error)));
}

void DisplayServerDolly::present_frame(const uint8_t *p_pixels, uint32_t p_width, uint32_t p_height, uint32_t p_stride) {
	static_cast<DisplayServerDolly *>(get_singleton())->present(p_pixels, p_width, p_height, p_stride, false);
}

// The frame Godot drew, read back and presented; with vsync, Godot waits for
// the page's next animation frame, at most 100 ms (a hidden tab shows none).
// RenderingDevice presents its own frames, on gpu@0's surface.
void DisplayServerDolly::swap_buffers() {
	if (rendering_device) {
		return;
	}
	const size_t row = (size_t)size.width * 4;
	if (x11) {
		pixels.resize(row * size.height * 2);
		uint8_t *upright = pixels.ptr() + row * size.height;
		glBindFramebuffer(GL_READ_FRAMEBUFFER, 0);
		glReadPixels(0, 0, size.width, size.height, GL_RGBA, GL_UNSIGNED_BYTE, pixels.ptr());
		for (int y = 0; y < size.height; y++) {
			memcpy(upright + (size_t)y * row, pixels.ptr() + (size_t)(size.height - 1 - y) * row, row);
		}
		present(upright, size.width, size.height, row, true);
		return;
	}
	dolly_display_frame frame;
	if (dolly_display_begin_frame(display, &frame) != 0 ||
			frame.width != (uint32_t)size.width || frame.height != (uint32_t)size.height) {
		return;
	}
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

static void read_pointer(const dolly_input_event &p_event, Point2i &mouse_position, uint64_t p_msec) {
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
		// A second press of the same button within 400 ms and 5 pixels is a
		// double click, as Godot's X11 platform counts one, by the times the
		// presses came.
		static MouseButton last_button = MouseButton::NONE;
		static uint64_t last_press_ms = 0;
		static Point2i last_press_position;
		const uint64_t now = p_msec;
		if (buttons[button] == last_button && now - last_press_ms < 400 &&
				Vector2(position).distance_to(Vector2(last_press_position)) < 5) {
			event->set_double_click(true);
			last_button = MouseButton::NONE;
		} else {
			last_button = buttons[button];
			last_press_ms = now;
			last_press_position = position;
		}
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

// Relative motion while the pointer is captured, in thousandths of a CSS pixel.
static void read_motion(const dolly_input_event &p_event, const Point2i &mouse_position) {
	Ref<InputEventMouseMotion> motion;
	motion.instantiate();
	const Vector2 relative(p_event.x / 1000.0, p_event.y / 1000.0);
	motion->set_position(mouse_position);
	motion->set_global_position(mouse_position);
	motion->set_relative(relative);
	motion->set_relative_screen_position(relative);
	motion->set_button_mask(Input::get_singleton()->get_mouse_button_mask());
	Input::get_singleton()->parse_input_event(motion);
}

void DisplayServerDolly::mouse_set_mode(DisplayServerEnums::MouseMode p_mode) {
	if (x11) {
		// An X window here has no pointer grab: the pointer stays the pointer.
		return;
	}
	const bool wanted = p_mode == DisplayServerEnums::MOUSE_MODE_CAPTURED;
	if (wanted != capture_wanted && dolly_input_set_pointer_relative(input, wanted) != 0) {
		return;
	}
	capture_wanted = wanted;
	if (!wanted) {
		mouse_mode = p_mode;
	}
}

void DisplayServerDolly::read_event(const dolly_input_event &p_event, uint64_t p_msec) {
	switch (p_event.type) {
		case DOLLY_INPUT_EVENT_KEY:
			read_key(p_event);
			break;
		case DOLLY_INPUT_EVENT_TEXT:
			read_text(p_event);
			break;
		case DOLLY_INPUT_EVENT_POINTER:
			read_pointer(p_event, mouse_position, p_msec);
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
		case DOLLY_INPUT_EVENT_POINTER_MOTION:
			read_motion(p_event, mouse_position);
			break;
		case DOLLY_INPUT_EVENT_POINTER_CAPTURE:
			if (capture_wanted) {
				mouse_mode = p_event.action ? DisplayServerEnums::MOUSE_MODE_CAPTURED : DisplayServerEnums::MOUSE_MODE_VISIBLE;
			}
			break;
		case DOLLY_INPUT_EVENT_POINTER_PRESENCE:
			send_window_event(p_event.action ? DisplayServerEnums::WINDOW_EVENT_MOUSE_ENTER : DisplayServerEnums::WINDOW_EVENT_MOUSE_EXIT);
			break;
		case DOLLY_INPUT_EVENT_DROPPED:
			// Records were lost: let go of what was held.
			Input::get_singleton()->release_pressed_events();
			break;
		case X11_WINDOW_EVENT_SIZE:
			resized(Size2i(p_event.x, p_event.y));
			break;
		case X11_WINDOW_EVENT_CLOSE:
			send_window_event(DisplayServerEnums::WINDOW_EVENT_CLOSE_REQUEST);
			break;
	}
}

// The fingers' records since the last frame, as Godot's screen touches and drags.
void DisplayServerDolly::read_touches() {
	dolly_touch_record records[64];
	int count = 0;
	while (touch && (count = dolly_touch_read(touch, records, 64, 0)) > 0) {
		for (int i = 0; i < count; i++) {
			const dolly_touch_record &record = records[i];
			if (record.phase == DOLLY_TOUCH_PRESS) {
				continue;
			}
			int index = -1;
			for (uint32_t finger = 0; finger < DOLLY_TOUCH_FINGERS; finger++) {
				if (finger_down[finger] && finger_ids[finger] == record.id) {
					index = finger;
				}
			}
			const Point2 position(record.x, record.y);
			if (record.phase == DOLLY_TOUCH_DOWN) {
				for (uint32_t finger = 0; index < 0 && finger < DOLLY_TOUCH_FINGERS; finger++) {
					if (!finger_down[finger]) {
						index = finger;
					}
				}
				if (index < 0) {
					continue;
				}
				finger_down[index] = true;
				finger_ids[index] = record.id;
			} else if (index < 0) {
				continue;
			}
			if (record.phase == DOLLY_TOUCH_MOVE) {
				Ref<InputEventScreenDrag> drag;
				drag.instantiate();
				drag->set_index(index);
				drag->set_position(position);
				drag->set_relative(position - finger_at[index]);
				drag->set_relative_screen_position(position - finger_at[index]);
				drag->set_pressure(record.pressure / 1000.0f);
				Input::get_singleton()->parse_input_event(drag);
			} else {
				Ref<InputEventScreenTouch> press;
				press.instantiate();
				press->set_index(index);
				press->set_position(position);
				press->set_pressed(record.phase == DOLLY_TOUCH_DOWN);
				press->set_canceled(record.phase == DOLLY_TOUCH_CANCEL);
				// A second down of the first finger within 400 ms and 5 pixels, by the page's
				// times of the two, is a double tap, which Godot's mouse of that finger takes
				// as a double click.
				if (record.phase == DOLLY_TOUCH_DOWN && index == 0) {
					const bool second = tapped && record.time - last_tap_ms < 400 && position.distance_to(last_tap_position) < 5;
					press->set_double_tap(second);
					tapped = !second;
					last_tap_ms = record.time;
					last_tap_position = position;
				}
				Input::get_singleton()->parse_input_event(press);
				finger_down[index] = record.phase == DOLLY_TOUCH_DOWN;
			}
			finger_at[index] = position;
		}
		if (count < 64) {
			break;
		}
	}
	if (count < 0) {
		// The page's touch module was switched off (nena): fingers are the pointer again.
		touch = 0;
	}
}

// The page's records as they come, each with its time; the main thread reads them at its next
// process_events. The timeout lets the thread see that reading has ended.
void DisplayServerDolly::read_records() {
	while (reading) {
		dolly_input_event event;
		if (dolly_input_next_event(input, &event, 100) <= 0) {
			continue;
		}
		std::lock_guard lock(records_mutex);
		records.push_back({ event, OS::get_singleton()->get_ticks_msec() });
		records_came.notify_one();
	}
}

void DisplayServerDolly::wait_for_event(uint64_t p_usec) {
	if (!x11) {
		std::unique_lock lock(records_mutex);
		records_came.wait_for(lock, std::chrono::microseconds(p_usec), [this] { return !records.empty(); });
	} else if (!woken) {
		woken = x11_window_next_event(x11, &woken_by, p_usec / 1000.0) > 0;
	}
}

void DisplayServerDolly::process_events() {
	if (!x11) {
		std::deque<Record> came;
		{
			std::lock_guard lock(records_mutex);
			came.swap(records);
		}
		for (const Record &record : came) {
			read_event(record.event, record.msec);
		}
	} else {
		if (woken) {
			woken = false;
			read_event(woken_by, OS::get_singleton()->get_ticks_msec());
		}
		dolly_input_event event;
		while (x11_window_next_event(x11, &event, 0) > 0) {
			read_event(event, OS::get_singleton()->get_ticks_msec());
		}
	}
	read_touches();
	Input::get_singleton()->flush_buffered_events();
}

void DisplayServerDolly::window_set_title(const String &p_title, DisplayServerEnums::WindowID p_window) {
	if (x11) {
		x11_window_set_title(x11, p_title.utf8().get_data());
	}
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
	if (x11) {
		x11_window_set_cursor(x11, cursors[p_shape]);
		return;
	}
	dolly_display_set_cursor(display, cursors[p_shape]);
}

static bool fills_screen(DisplayServerEnums::WindowMode p_mode) {
	return p_mode == DisplayServerEnums::WINDOW_MODE_MAXIMIZED || p_mode == DisplayServerEnums::WINDOW_MODE_FULLSCREEN ||
			p_mode == DisplayServerEnums::WINDOW_MODE_EXCLUSIVE_FULLSCREEN;
}

// A maximized or fullscreen window fills the page's canvas; an X window's size and place are the
// window manager's (twm has no maximized state): it stays a window.
void DisplayServerDolly::window_set_mode(DisplayServerEnums::WindowMode p_mode, DisplayServerEnums::WindowID p_window) {
	if (x11) {
		return;
	}
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
	mode = p_mode;
	// A window on the X server DISPLAY names, as a program on a Unix desktop opens one; the
	// page's own canvas otherwise.
	if (x11_window_display()) {
		const String name = GLOBAL_GET("application/config/name");
		x11 = x11_window_open(name.is_empty() ? "Godot" : name.utf8().get_data(), p_size.width, p_size.height);
		ERR_FAIL_NULL_MSG(x11, vformat("No window on the X server %s: %s.", x11_window_display(), strerror(errno)));
		uint32_t width, height;
		x11_window_screen_size(x11, &width, &height);
		screen = Size2i(width, height);
		size = p_size;
		// The window manager frames, places and sizes windows: the window starts at its size.
		mode = DisplayServerEnums::WINDOW_MODE_WINDOWED;
	} else {
		dolly_display_surface surface;
		int error = dolly_display_acquire(&surface);
		ERR_FAIL_COND_MSG(error != 0, vformat("Dolly's display: %s.", strerror(-error)));
		display = surface.generation;
		screen = Size2i(surface.width, surface.height);
		size = fills_screen(p_mode) ? screen : p_size;
		error = dolly_input_acquire(&input);
		ERR_FAIL_COND_MSG(error != 0, vformat("Dolly's input: %s.", strerror(-error)));
		// Without touch@0, or beside a program that holds it, a finger is the page's pointer.
		if (dolly_touch_acquire(&touch) != 0) {
			touch = 0;
		}
		reading = true;
		reader = std::thread(&DisplayServerDolly::read_records, this);
		error = dolly_display_set_size(display, size.width, size.height, &surface);
		ERR_FAIL_COND_MSG(error != 0, vformat("Dolly's display at %dx%d: %s.", size.width, size.height, strerror(-error)));
#ifdef TOOLS_ENABLED
		// The editor's Ctrl+C is Copy, as in its window on a desktop: while it has the page's keys
		// its terminal's interrupt key is a key (ISIG off), and Scene > Quit ends it.
		struct termios modes;
		if ((Engine::get_singleton()->is_editor_hint() || Engine::get_singleton()->is_project_manager_hint()) &&
				(terminal = open("/dev/tty", O_RDWR | O_NOCTTY)) >= 0) {
			if (tcgetattr(terminal, &modes) == 0 && (modes.c_lflag & ISIG)) {
				terminal_lflag = modes.c_lflag;
				modes.c_lflag &= ~ISIG;
				tcsetattr(terminal, TCSANOW, &modes);
			}
		}
#endif
	}
	// Without clipboard@0, or beside a program that holds it, the clipboard is the program's own.
	if (dolly_clipboard_acquire(&clipboard_lease) != 0) {
		clipboard_lease = 0;
	}
#if defined(RD_ENABLED)
	// gpu@0 opens where the browser grants a WebGPU adapter; elsewhere Godot falls back to its
	// Compatibility renderer, as its X11 server does when Vulkan fails.
	if (p_rendering_driver == "webgpu") {
		rendering_context = memnew(RenderingContextDriverWebGPU);
		if (x11) {
			static_cast<RenderingContextDriverWebGPU *>(rendering_context)->present = present_frame;
		}
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
	if (clipboard_lease) {
		dolly_clipboard_release(clipboard_lease);
	}
	struct termios modes;
	if (terminal_lflag >= 0 && tcgetattr(terminal, &modes) == 0) {
		modes.c_lflag = terminal_lflag;
		tcsetattr(terminal, TCSANOW, &modes);
	}
	if (terminal >= 0) {
		close(terminal);
	}
	if (reader.joinable()) {
		reading = false;
		reader.join();
	}
	if (touch) {
		dolly_touch_release(touch);
	}
	if (input) {
		dolly_input_release(input);
	}
	if (display) {
		dolly_display_release(display);
	}
	x11_window_close(x11);
	memdelete(native_menu);
}
