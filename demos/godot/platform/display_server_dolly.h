#pragma once

#include "core/input/input_event.h"
#include "servers/display/display_server.h"

#include <EGL/egl.h>
#include <dolly/input.h>

class NativeMenu;
class RenderingContextDriver;
class RenderingDevice;

struct x11_window;

// One window: the page's canvas through display@0, with the keys and pointer
// of input@0, or, where DISPLAY names an X server, a window of its own there
// (x11-window.h), whose records are input@0's. Godot's Mobile and Forward+
// renderers draw on gpu@0's surface (the webgpu driver), or into a texture
// read back for the X window; its Compatibility renderer draws with Mesa's
// OpenGL into a pbuffer of the window's size, and each frame is read back and
// presented. The clipboard is clipboard@0's, held with the window; without it
// the program's own.
class DisplayServerDolly : public DisplayServer {
	GDSOFTCLASS(DisplayServerDolly, DisplayServer);

	uint64_t display = 0;
	uint64_t input = 0;
	uint64_t clipboard_lease = 0;
	String clipboard;
	// The editor's terminal and its modes as the editor found them, which it gives back (-1:
	// unchanged).
	int terminal = -1;
	int terminal_lflag = -1;
	x11_window *x11 = nullptr;
	Size2i size;
	DisplayServerEnums::VSyncMode vsync_mode = DisplayServerEnums::VSYNC_ENABLED;
	uint32_t frame_sequence = 0;
	EGLDisplay egl_display = EGL_NO_DISPLAY;
	EGLConfig egl_config = nullptr;
	EGLContext egl_context = EGL_NO_CONTEXT;
	EGLSurface egl_surface = EGL_NO_SURFACE;
	RenderingContextDriver *rendering_context = nullptr;
	RenderingDevice *rendering_device = nullptr;
	LocalVector<uint8_t> pixels;
	NativeMenu *native_menu = nullptr;
	ObjectID instance_id;
	Callable input_event_callback;
	Callable input_text_callback;
	Callable window_event_callback;
	Callable rect_changed_callback;
	Point2i mouse_position;
	// MOUSE_MODE_CAPTURED asks input@0 for relative motion, and the page captures the pointer
	// at the next click: the mode is CAPTURED while the page has it (POINTER_CAPTURE), and the
	// request stays while it is wanted, so a click takes the pointer again after Escape.
	DisplayServerEnums::MouseMode mouse_mode = DisplayServerEnums::MOUSE_MODE_VISIBLE;
	bool capture_wanted = false;
	bool focused = true;
	// The screen is the page's surface as the display lease starts; a maximized or fullscreen
	// window fills it.
	Size2i screen;
	DisplayServerEnums::WindowMode mode = DisplayServerEnums::WINDOW_MODE_WINDOWED;
	// A record that ended a frame's sleep, which the next process_events reads first.
	dolly_input_event woken_by;
	bool woken = false;

	static Vector<String> get_rendering_drivers_func();
	static DisplayServer *create_func(const String &p_rendering_driver, DisplayServerEnums::WindowMode p_mode, DisplayServerEnums::VSyncMode p_vsync_mode, uint32_t p_flags, const Point2i *p_position, const Size2i &p_resolution, int p_screen, DisplayServerEnums::Context p_context, int64_t p_parent_window, Error &r_error);
	static void dispatch_input_event(const Ref<InputEvent> &p_event);

	Error create_gl_context();
	Error create_gl_surface();
	void send_window_event(DisplayServerEnums::WindowEvent p_event) const;
	void read_event(const dolly_input_event &p_event);
	int next_event(dolly_input_event &r_event, double p_timeout_milliseconds);
	void resized(const Size2i &p_size);
	void present(const uint8_t *p_pixels, uint32_t p_width, uint32_t p_height, size_t p_stride, bool p_rgba);
	static void present_frame(const uint8_t *p_pixels, uint32_t p_width, uint32_t p_height, uint32_t p_stride);

public:
	static void register_dolly_driver();

	String get_name() const override { return "Dolly"; }
	bool has_feature(DisplayServerEnums::Feature p_feature) const override;

	void process_events() override;
	// Sleeps until an input record arrives or p_usec passes.
	void wait_for_event(uint64_t p_usec);
	void swap_buffers() override;

	int get_screen_count() const override { return 1; }
	int get_primary_screen() const override { return 0; }
	Point2i screen_get_position(int p_screen = DisplayServerEnums::SCREEN_OF_MAIN_WINDOW) const override { return Point2i(); }
	Size2i screen_get_size(int p_screen = DisplayServerEnums::SCREEN_OF_MAIN_WINDOW) const override { return screen; }
	Rect2i screen_get_usable_rect(int p_screen = DisplayServerEnums::SCREEN_OF_MAIN_WINDOW) const override { return Rect2i(Point2i(), screen); }
	int screen_get_dpi(int p_screen = DisplayServerEnums::SCREEN_OF_MAIN_WINDOW) const override { return 96; }
	float screen_get_refresh_rate(int p_screen = DisplayServerEnums::SCREEN_OF_MAIN_WINDOW) const override { return SCREEN_REFRESH_RATE_FALLBACK; }

	Vector<DisplayServerEnums::WindowID> get_window_list() const override;
	DisplayServerEnums::WindowID get_window_at_screen_position(const Point2i &p_position) const override { return DisplayServerEnums::MAIN_WINDOW_ID; }

	void window_attach_instance_id(ObjectID p_instance, DisplayServerEnums::WindowID p_window = DisplayServerEnums::MAIN_WINDOW_ID) override { instance_id = p_instance; }
	ObjectID window_get_attached_instance_id(DisplayServerEnums::WindowID p_window = DisplayServerEnums::MAIN_WINDOW_ID) const override { return instance_id; }
	void window_set_rect_changed_callback(const Callable &p_callable, DisplayServerEnums::WindowID p_window = DisplayServerEnums::MAIN_WINDOW_ID) override { rect_changed_callback = p_callable; }
	void window_set_window_event_callback(const Callable &p_callable, DisplayServerEnums::WindowID p_window = DisplayServerEnums::MAIN_WINDOW_ID) override { window_event_callback = p_callable; }
	void window_set_input_event_callback(const Callable &p_callable, DisplayServerEnums::WindowID p_window = DisplayServerEnums::MAIN_WINDOW_ID) override { input_event_callback = p_callable; }
	void window_set_input_text_callback(const Callable &p_callable, DisplayServerEnums::WindowID p_window = DisplayServerEnums::MAIN_WINDOW_ID) override { input_text_callback = p_callable; }
	void window_set_drop_files_callback(const Callable &p_callable, DisplayServerEnums::WindowID p_window = DisplayServerEnums::MAIN_WINDOW_ID) override {}
	void window_set_title(const String &p_title, DisplayServerEnums::WindowID p_window = DisplayServerEnums::MAIN_WINDOW_ID) override;

	int window_get_current_screen(DisplayServerEnums::WindowID p_window = DisplayServerEnums::MAIN_WINDOW_ID) const override { return 0; }
	void window_set_current_screen(int p_screen, DisplayServerEnums::WindowID p_window = DisplayServerEnums::MAIN_WINDOW_ID) override {}
	Point2i window_get_position(DisplayServerEnums::WindowID p_window = DisplayServerEnums::MAIN_WINDOW_ID) const override { return Point2i(); }
	Point2i window_get_position_with_decorations(DisplayServerEnums::WindowID p_window = DisplayServerEnums::MAIN_WINDOW_ID) const override { return Point2i(); }
	void window_set_position(const Point2i &p_position, DisplayServerEnums::WindowID p_window = DisplayServerEnums::MAIN_WINDOW_ID) override {}
	void window_set_transient(DisplayServerEnums::WindowID p_window, DisplayServerEnums::WindowID p_parent) override {}
	void window_set_max_size(const Size2i p_size, DisplayServerEnums::WindowID p_window = DisplayServerEnums::MAIN_WINDOW_ID) override {}
	Size2i window_get_max_size(DisplayServerEnums::WindowID p_window = DisplayServerEnums::MAIN_WINDOW_ID) const override { return Size2i(); }
	void window_set_min_size(const Size2i p_size, DisplayServerEnums::WindowID p_window = DisplayServerEnums::MAIN_WINDOW_ID) override {}
	Size2i window_get_min_size(DisplayServerEnums::WindowID p_window = DisplayServerEnums::MAIN_WINDOW_ID) const override { return Size2i(); }
	void window_set_size(const Size2i p_size, DisplayServerEnums::WindowID p_window = DisplayServerEnums::MAIN_WINDOW_ID) override;
	Size2i window_get_size(DisplayServerEnums::WindowID p_window = DisplayServerEnums::MAIN_WINDOW_ID) const override { return size; }
	Size2i window_get_size_with_decorations(DisplayServerEnums::WindowID p_window = DisplayServerEnums::MAIN_WINDOW_ID) const override { return size; }
	void window_set_mode(DisplayServerEnums::WindowMode p_mode, DisplayServerEnums::WindowID p_window = DisplayServerEnums::MAIN_WINDOW_ID) override;
	DisplayServerEnums::WindowMode window_get_mode(DisplayServerEnums::WindowID p_window = DisplayServerEnums::MAIN_WINDOW_ID) const override { return mode; }
	bool window_is_maximize_allowed(DisplayServerEnums::WindowID p_window = DisplayServerEnums::MAIN_WINDOW_ID) const override { return !x11; }
	void window_set_flag(DisplayServerEnums::WindowFlags p_flag, bool p_enabled, DisplayServerEnums::WindowID p_window = DisplayServerEnums::MAIN_WINDOW_ID) override {}
	bool window_get_flag(DisplayServerEnums::WindowFlags p_flag, DisplayServerEnums::WindowID p_window = DisplayServerEnums::MAIN_WINDOW_ID) const override { return false; }
	void window_request_attention(DisplayServerEnums::WindowID p_window = DisplayServerEnums::MAIN_WINDOW_ID) override {}
	void window_move_to_foreground(DisplayServerEnums::WindowID p_window = DisplayServerEnums::MAIN_WINDOW_ID) override {}
	bool window_is_focused(DisplayServerEnums::WindowID p_window = DisplayServerEnums::MAIN_WINDOW_ID) const override { return focused; }
	bool window_can_draw(DisplayServerEnums::WindowID p_window = DisplayServerEnums::MAIN_WINDOW_ID) const override { return true; }
	bool can_any_window_draw() const override { return true; }
	void window_set_vsync_mode(DisplayServerEnums::VSyncMode p_vsync_mode, DisplayServerEnums::WindowID p_window = DisplayServerEnums::MAIN_WINDOW_ID) override { vsync_mode = p_vsync_mode; }
	DisplayServerEnums::VSyncMode window_get_vsync_mode(DisplayServerEnums::WindowID p_window = DisplayServerEnums::MAIN_WINDOW_ID) const override { return vsync_mode; }

	// The page cannot keep the screen on, as Godot's web platform cannot.
	void screen_set_keep_on(bool p_enable) override {}

	void clipboard_set(const String &p_text) override;
	String clipboard_get() const override;

	Point2i mouse_get_position() const override { return mouse_position; }
	void mouse_set_mode(DisplayServerEnums::MouseMode p_mode) override;
	DisplayServerEnums::MouseMode mouse_get_mode() const override { return mouse_mode; }
	void cursor_set_shape(DisplayServerEnums::CursorShape p_shape) override;

	DisplayServerDolly(const String &p_rendering_driver, DisplayServerEnums::WindowMode p_mode, const Size2i &p_size, DisplayServerEnums::VSyncMode p_vsync_mode, Error &r_error);
	~DisplayServerDolly();
};
