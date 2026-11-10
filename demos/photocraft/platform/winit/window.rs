use std::collections::VecDeque;
use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};

use crate::cursor::Cursor;
use crate::dpi::{PhysicalPosition, PhysicalSize, Position, Size};
use crate::error::{ExternalError, NotSupportedError, OsError as RootOsError};
use crate::platform_impl::Fullscreen;
use crate::window::{self, CursorIcon, ImePurpose};

use super::event_loop::{read_input, Leases, Shared};
use super::{ffi, ActiveEventLoop, MonitorHandle, OsError, WindowId};

/// The page's canvas: Dolly has one, so a second window is refused while it is open.
pub struct Window {
    leases: Leases,
    shared: Arc<Shared>,
    state: Mutex<State>,
}

struct State {
    title: String,
    cursor: CursorIcon,
    cursor_visible: bool,
}

// Emscripten's libc numbers errno as WASI does.
const EBUSY: i32 = 10;
const EAGAIN: i32 = 6;

fn os_error(operation: &'static str, error: i32) -> RootOsError {
    os_error!(OsError(operation, error))
}

fn cursor_style(icon: CursorIcon) -> u32 {
    match icon {
        CursorIcon::Text | CursorIcon::VerticalText => ffi::CURSOR_TEXT,
        CursorIcon::Crosshair | CursorIcon::Cell => ffi::CURSOR_CROSSHAIR,
        CursorIcon::Pointer | CursorIcon::Alias | CursorIcon::Copy => ffi::CURSOR_POINTER,
        CursorIcon::NsResize | CursorIcon::NResize | CursorIcon::SResize | CursorIcon::RowResize => {
            ffi::CURSOR_NS_RESIZE
        },
        CursorIcon::EwResize | CursorIcon::EResize | CursorIcon::WResize | CursorIcon::ColResize => {
            ffi::CURSOR_EW_RESIZE
        },
        CursorIcon::NwseResize | CursorIcon::NwResize | CursorIcon::SeResize => ffi::CURSOR_NWSE_RESIZE,
        CursorIcon::NeswResize | CursorIcon::NeResize | CursorIcon::SwResize => ffi::CURSOR_NESW_RESIZE,
        CursorIcon::Move | CursorIcon::AllScroll | CursorIcon::Grab | CursorIcon::Grabbing => {
            ffi::CURSOR_MOVE
        },
        CursorIcon::Wait => ffi::CURSOR_WAIT,
        CursorIcon::Progress => ffi::CURSOR_PROGRESS,
        CursorIcon::NotAllowed | CursorIcon::NoDrop => ffi::CURSOR_NOT_ALLOWED,
        CursorIcon::Help | CursorIcon::ContextMenu => ffi::CURSOR_HELP,
        _ => ffi::CURSOR_DEFAULT,
    }
}

impl Window {
    pub(crate) fn new(
        el: &ActiveEventLoop,
        attrs: window::WindowAttributes,
    ) -> Result<Self, RootOsError> {
        let mut window = el.shared.window.lock().unwrap();
        if window.is_some() {
            return Err(os_error("display", -EBUSY));
        }
        let mut surface = ffi::Surface::default();
        // SAFETY: surface is a whole record.
        let error = unsafe { ffi::dolly_display_acquire(&mut surface) };
        if error != 0 {
            return Err(os_error("display", error));
        }
        let display = surface.generation;
        let mut input = 0;
        // SAFETY: input is a whole generation.
        let error = unsafe { ffi::dolly_input_acquire(&mut input) };
        if error != 0 {
            // SAFETY: display is this lease.
            unsafe { ffi::dolly_display_release(display) };
            return Err(os_error("input", error));
        }
        let shared = el.shared.clone();
        let reader = std::thread::Builder::new().name("dolly input".into()).spawn(move || read_input(shared, input));
        if let Err(error) = reader {
            // SAFETY: these are this window's leases.
            unsafe {
                ffi::dolly_input_release(input);
                ffi::dolly_display_release(display);
            }
            return Err(os_error("input thread", -error.raw_os_error().unwrap_or(EAGAIN)));
        }
        // The window fills the canvas, as a maximized one fills a screen.
        let leases = Leases { display, input, size: (surface.width, surface.height) };
        *window = Some(leases);
        el.shared.created.lock().unwrap().push_back(WindowId(display));
        let this = Self {
            leases,
            shared: el.shared.clone(),
            state: Mutex::new(State {
                title: attrs.title.clone(),
                cursor: CursorIcon::Default,
                cursor_visible: true,
            }),
        };
        this.set_cursor(attrs.cursor.clone());
        Ok(this)
    }

    pub(crate) fn maybe_queue_on_main(&self, f: impl FnOnce(&Self) + Send + 'static) {
        f(self)
    }

    pub(crate) fn maybe_wait_on_main<R: Send>(&self, f: impl FnOnce(&Self) -> R + Send) -> R {
        f(self)
    }

    fn monitor(&self) -> MonitorHandle {
        MonitorHandle { size: self.leases.size }
    }

    fn show_cursor(&self, state: &State) {
        let style = if state.cursor_visible { cursor_style(state.cursor) } else { ffi::CURSOR_HIDDEN };
        // SAFETY: display is this window's lease.
        unsafe { ffi::dolly_display_set_cursor(self.leases.display, style) };
    }

    #[inline]
    pub fn id(&self) -> WindowId {
        WindowId(self.leases.display)
    }

    #[inline]
    pub fn primary_monitor(&self) -> Option<MonitorHandle> {
        Some(self.monitor())
    }

    #[inline]
    pub fn available_monitors(&self) -> VecDeque<MonitorHandle> {
        VecDeque::from([self.monitor()])
    }

    #[inline]
    pub fn current_monitor(&self) -> Option<MonitorHandle> {
        Some(self.monitor())
    }

    #[inline]
    pub fn scale_factor(&self) -> f64 {
        self.monitor().scale_factor()
    }

    #[inline]
    pub fn request_redraw(&self) {
        self.shared.redraw.store(true, Ordering::Release);
        self.shared.wake();
    }

    #[inline]
    pub fn pre_present_notify(&self) {}

    #[inline]
    pub fn reset_dead_keys(&self) {}

    #[inline]
    pub fn inner_position(&self) -> Result<PhysicalPosition<i32>, NotSupportedError> {
        Ok((0, 0).into())
    }

    #[inline]
    pub fn outer_position(&self) -> Result<PhysicalPosition<i32>, NotSupportedError> {
        Ok((0, 0).into())
    }

    #[inline]
    pub fn set_outer_position(&self, _position: Position) {}

    #[inline]
    pub fn inner_size(&self) -> PhysicalSize<u32> {
        self.leases.size.into()
    }

    /// The canvas's size is the page's.
    #[inline]
    pub fn request_inner_size(&self, _size: Size) -> Option<PhysicalSize<u32>> {
        None
    }

    #[inline]
    pub fn outer_size(&self) -> PhysicalSize<u32> {
        self.inner_size()
    }

    #[inline]
    pub fn set_min_inner_size(&self, _: Option<Size>) {}

    #[inline]
    pub fn set_max_inner_size(&self, _: Option<Size>) {}

    #[inline]
    pub fn title(&self) -> String {
        self.state.lock().unwrap().title.clone()
    }

    #[inline]
    pub fn set_title(&self, title: &str) {
        self.state.lock().unwrap().title = title.to_owned();
    }

    #[inline]
    pub fn set_transparent(&self, _transparent: bool) {}

    #[inline]
    pub fn set_blur(&self, _blur: bool) {}

    #[inline]
    pub fn set_visible(&self, _visible: bool) {}

    #[inline]
    pub fn is_visible(&self) -> Option<bool> {
        Some(true)
    }

    #[inline]
    pub fn resize_increments(&self) -> Option<PhysicalSize<u32>> {
        None
    }

    #[inline]
    pub fn set_resize_increments(&self, _increments: Option<Size>) {}

    #[inline]
    pub fn set_resizable(&self, _resizable: bool) {}

    #[inline]
    pub fn is_resizable(&self) -> bool {
        false
    }

    #[inline]
    pub fn set_minimized(&self, _minimized: bool) {}

    #[inline]
    pub fn is_minimized(&self) -> Option<bool> {
        Some(false)
    }

    #[inline]
    pub fn set_maximized(&self, _maximized: bool) {}

    #[inline]
    pub fn is_maximized(&self) -> bool {
        true
    }

    #[inline]
    pub(crate) fn set_fullscreen(&self, _monitor: Option<Fullscreen>) {}

    #[inline]
    pub(crate) fn fullscreen(&self) -> Option<Fullscreen> {
        None
    }

    #[inline]
    pub fn set_decorations(&self, _decorations: bool) {}

    #[inline]
    pub fn is_decorated(&self) -> bool {
        false
    }

    #[inline]
    pub fn set_window_level(&self, _level: window::WindowLevel) {}

    #[inline]
    pub fn set_window_icon(&self, _window_icon: Option<crate::icon::Icon>) {}

    #[inline]
    pub fn set_ime_cursor_area(&self, _position: Position, _size: Size) {}

    #[inline]
    pub fn set_ime_allowed(&self, _allowed: bool) {}

    #[inline]
    pub fn set_ime_purpose(&self, _purpose: ImePurpose) {}

    #[inline]
    pub fn reset_ime(&self) {}

    #[inline]
    pub fn reset_ime_with_request(&self, _request_id: u64) {}

    #[inline]
    pub fn focus_window(&self) {}

    #[inline]
    pub fn request_user_attention(&self, _request_type: Option<window::UserAttentionType>) {}

    #[inline]
    pub fn set_cursor(&self, cursor: Cursor) {
        if let Cursor::Icon(icon) = cursor {
            let mut state = self.state.lock().unwrap();
            state.cursor = icon;
            self.show_cursor(&state);
        }
    }

    #[inline]
    pub fn set_cursor_position(&self, _: Position) -> Result<(), ExternalError> {
        Err(ExternalError::NotSupported(NotSupportedError::new()))
    }

    /// Locked is the page's pointer capture; a pointer confined to the canvas is not offered.
    #[inline]
    pub fn set_cursor_grab(&self, mode: window::CursorGrabMode) -> Result<(), ExternalError> {
        let relative = match mode {
            window::CursorGrabMode::None => 0,
            window::CursorGrabMode::Locked => 1,
            window::CursorGrabMode::Confined => {
                return Err(ExternalError::NotSupported(NotSupportedError::new()))
            },
        };
        // SAFETY: input is this window's lease.
        let error = unsafe { ffi::dolly_input_set_pointer_relative(self.leases.input, relative) };
        if error != 0 {
            return Err(ExternalError::Os(os_error("pointer", error)));
        }
        Ok(())
    }

    #[inline]
    pub fn set_cursor_visible(&self, visible: bool) {
        let mut state = self.state.lock().unwrap();
        state.cursor_visible = visible;
        self.show_cursor(&state);
    }

    #[inline]
    pub fn drag_window(&self) -> Result<(), ExternalError> {
        Err(ExternalError::NotSupported(NotSupportedError::new()))
    }

    #[inline]
    pub fn drag_resize_window(&self, _direction: window::ResizeDirection) -> Result<(), ExternalError> {
        Err(ExternalError::NotSupported(NotSupportedError::new()))
    }

    #[inline]
    pub fn show_window_menu(&self, _position: Position) {}

    #[inline]
    pub fn set_cursor_hittest(&self, _hittest: bool) -> Result<(), ExternalError> {
        Err(ExternalError::NotSupported(NotSupportedError::new()))
    }

    #[cfg(feature = "rwh_06")]
    #[inline]
    pub fn raw_window_handle_rwh_06(&self) -> Result<rwh_06::RawWindowHandle, rwh_06::HandleError> {
        Ok(rwh_06::RawWindowHandle::Dolly(rwh_06::DollyWindowHandle::new(self.leases.display)))
    }

    #[cfg(feature = "rwh_06")]
    #[inline]
    pub fn raw_display_handle_rwh_06(&self) -> Result<rwh_06::RawDisplayHandle, rwh_06::HandleError> {
        Ok(rwh_06::RawDisplayHandle::Dolly(rwh_06::DollyDisplayHandle::new()))
    }

    #[inline]
    pub fn set_enabled_buttons(&self, _buttons: window::WindowButtons) {}

    #[inline]
    pub fn enabled_buttons(&self) -> window::WindowButtons {
        window::WindowButtons::empty()
    }

    #[inline]
    pub fn theme(&self) -> Option<window::Theme> {
        None
    }

    #[inline]
    pub fn has_focus(&self) -> bool {
        true
    }

    #[inline]
    pub fn set_theme(&self, _theme: Option<window::Theme>) {}

    pub fn set_content_protected(&self, _protected: bool) {}
}

impl Drop for Window {
    fn drop(&mut self) {
        // SAFETY: these are this window's leases.
        unsafe {
            ffi::dolly_input_release(self.leases.input);
            ffi::dolly_display_release(self.leases.display);
        }
        *self.shared.window.lock().unwrap() = None;
        self.shared.destroyed.lock().unwrap().push_back(self.id());
        self.shared.wake();
    }
}
