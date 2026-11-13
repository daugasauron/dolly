use std::collections::VecDeque;
use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};

use crate::cursor::Cursor;
use crate::dpi::{PhysicalPosition, PhysicalSize, Position, Size};
use crate::error::{ExternalError, NotSupportedError, OsError as RootOsError};
use crate::platform_impl::Fullscreen;
use crate::window::{self, CursorIcon, ImePurpose};

use super::event_loop::{read_input, read_x11, Leases, Shared};
use super::{ffi, ActiveEventLoop, MonitorHandle, OsError, WindowId};

/// The page's canvas: Dolly has one, so a second window is refused while it is open. Where DISPLAY
/// names an X server (x11_window_display) the window is one of its windows instead, as on a Unix
/// desktop.
pub struct Window {
    leases: Leases,
    shared: Arc<Shared>,
    state: Mutex<State>,
    reader: Mutex<Option<std::thread::JoinHandle<()>>>,
    /// The program's terminal and its modes as the window found them, given back when it closes.
    terminal: Option<(std::fs::File, u32)>,
}

/// The page's keys are the window's: Ctrl+C is Copy, as in a window on a desktop, not the
/// terminal's interrupt key (ISIG off); the app's Quit ends it. The terminal and the modes it
/// found, if it changed them.
fn take_interrupt_key() -> Option<(std::fs::File, u32)> {
    use std::os::fd::AsRawFd;
    let terminal = std::fs::OpenOptions::new().read(true).write(true).open("/dev/tty").ok()?;
    // SAFETY: the descriptor is the terminal's, open while terminal is.
    let mode = unsafe { ffi::dolly_terminal_mode_get(terminal.as_raw_fd()) };
    if mode < 0 || mode & ffi::TERMINAL_ISIG == 0 {
        return None;
    }
    // SAFETY: as above.
    unsafe { ffi::dolly_terminal_mode_set(terminal.as_raw_fd(), (mode & !ffi::TERMINAL_ISIG) as u32) };
    Some((terminal, mode as u32))
}

struct State {
    title: String,
    cursor: CursorIcon,
    cursor_visible: bool,
    /// As the program asks: the page shows the canvas either way.
    visible: bool,
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
        // SAFETY: a function of the environment.
        if !unsafe { ffi::x11_window_display() }.is_null() {
            return Self::new_x11(el, attrs, &mut window);
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
        let leases = Leases { display, input, size: (surface.width, surface.height), x11: 0 };
        *el.shared.size.lock().unwrap() = leases.size;
        *window = Some(leases);
        el.shared.created.lock().unwrap().push_back(WindowId(display));
        let this = Self {
            leases,
            shared: el.shared.clone(),
            state: Mutex::new(State {
                title: attrs.title.clone(),
                cursor: CursorIcon::Default,
                cursor_visible: true,
                visible: attrs.visible,
            }),
            reader: Mutex::new(None),
            terminal: take_interrupt_key(),
        };
        this.set_cursor(attrs.cursor.clone());
        Ok(this)
    }

    /// A window of the size asked for (or 1280 by 800) on the X server DISPLAY names.
    fn new_x11(
        el: &ActiveEventLoop,
        attrs: window::WindowAttributes,
        window: &mut Option<Leases>,
    ) -> Result<Self, RootOsError> {
        let size: PhysicalSize<u32> = attrs.inner_size.map_or((1280, 800).into(), |size| size.to_physical(1.0));
        let title = std::ffi::CString::new(attrs.title.replace('\0', "")).unwrap();
        // SAFETY: title is a string.
        let x11 = unsafe { ffi::x11_window_open(title.as_ptr(), size.width, size.height) };
        if x11.is_null() {
            return Err(os_error("X window", -std::io::Error::last_os_error().raw_os_error().unwrap_or(EAGAIN)));
        }
        let (mut width, mut height) = (0, 0);
        // SAFETY: x11 is this window.
        unsafe { ffi::x11_window_screen_size(x11, &mut width, &mut height) };
        let shared = el.shared.clone();
        let address = x11 as usize;
        shared.closing.store(false, Ordering::Release);
        let reader = match std::thread::Builder::new().name("dolly x11".into()).spawn(move || read_x11(shared, address)) {
            Ok(reader) => reader,
            Err(error) => {
                // SAFETY: x11 is this window, which no reader uses.
                unsafe { ffi::x11_window_close(x11) };
                return Err(os_error("input thread", -error.raw_os_error().unwrap_or(EAGAIN)));
            },
        };
        let leases = Leases { display: address as u64, input: 0, size: (width, height), x11: address };
        *el.shared.size.lock().unwrap() = (size.width, size.height);
        *window = Some(leases);
        el.shared.created.lock().unwrap().push_back(WindowId(leases.display));
        let this = Self {
            leases,
            shared: el.shared.clone(),
            state: Mutex::new(State {
                title: attrs.title.clone(),
                cursor: CursorIcon::Default,
                cursor_visible: true,
                visible: attrs.visible,
            }),
            reader: Mutex::new(Some(reader)),
            terminal: None,
        };
        this.set_cursor(attrs.cursor.clone());
        Ok(this)
    }

    fn x11(&self) -> Option<*mut std::ffi::c_void> {
        (self.leases.x11 != 0).then_some(self.leases.x11 as *mut std::ffi::c_void)
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
        if let Some(x11) = self.x11() {
            // SAFETY: x11 is this window.
            unsafe { ffi::x11_window_set_cursor(x11, style) };
            return;
        }
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
        (*self.shared.size.lock().unwrap()).into()
    }

    /// The canvas's size is the page's; an X window's is the window manager's to grant, and
    /// arrives as Resized.
    #[inline]
    pub fn request_inner_size(&self, size: Size) -> Option<PhysicalSize<u32>> {
        if let Some(x11) = self.x11() {
            let size: PhysicalSize<u32> = size.to_physical(1.0);
            // SAFETY: x11 is this window.
            unsafe { ffi::x11_window_resize(x11, size.width, size.height) };
        }
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
        if let (Some(x11), Ok(title)) = (self.x11(), std::ffi::CString::new(title)) {
            // SAFETY: x11 is this window; title is a string.
            unsafe { ffi::x11_window_set_title(x11, title.as_ptr()) };
        }
    }

    #[inline]
    pub fn set_transparent(&self, _transparent: bool) {}

    #[inline]
    pub fn set_blur(&self, _blur: bool) {}

    #[inline]
    pub fn set_visible(&self, visible: bool) {
        self.state.lock().unwrap().visible = visible;
    }

    #[inline]
    pub fn is_visible(&self) -> Option<bool> {
        Some(self.state.lock().unwrap().visible)
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
        // An X window here has no pointer grab.
        if self.x11().is_some() {
            return Err(ExternalError::NotSupported(NotSupportedError::new()));
        }
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
        let mut handle = rwh_06::DollyWindowHandle::new(self.leases.display);
        handle.x11 = self.leases.x11;
        Ok(rwh_06::RawWindowHandle::Dolly(handle))
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
        if let Some(x11) = self.x11() {
            self.shared.closing.store(true, Ordering::Release);
            if let Some(reader) = self.reader.lock().unwrap().take() {
                let _ = reader.join();
            }
            // SAFETY: x11 is this window, whose reader has ended.
            unsafe { ffi::x11_window_close(x11) };
        } else {
            // SAFETY: these are this window's leases.
            unsafe {
                ffi::dolly_input_release(self.leases.input);
                ffi::dolly_display_release(self.leases.display);
            }
        }
        if let Some((terminal, mode)) = &self.terminal {
            use std::os::fd::AsRawFd;
            // SAFETY: the descriptor is the terminal whose modes these were.
            unsafe { ffi::dolly_terminal_mode_set(terminal.as_raw_fd(), *mode) };
        }
        *self.shared.window.lock().unwrap() = None;
        self.shared.destroyed.lock().unwrap().push_back(self.id());
        self.shared.wake();
    }
}
