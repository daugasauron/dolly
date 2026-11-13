//! Dolly: one window, the page's canvas, through the display@0 and input@0 leases
//! (`<dolly/display.h>` and `<dolly/input.h>`). Records name keys as a browser's
//! KeyboardEvent does, so the web platform's key tables read them.

use std::fmt;
use std::os::raw::c_int;

use crate::dpi::{PhysicalPosition, PhysicalSize};

pub(crate) use self::event_loop::{ActiveEventLoop, EventLoop, EventLoopProxy, OwnedDisplayHandle};
pub use self::window::Window;
pub(crate) use self::keyboard::KeyEventExtra;
pub(crate) use crate::cursor::{
    NoCustomCursor as PlatformCustomCursor, NoCustomCursor as PlatformCustomCursorSource,
};
pub(crate) use crate::icon::NoIcon as PlatformIcon;

mod event_loop;
#[path = "../web/keyboard.rs"]
mod keyboard;
mod window;

#[derive(Default, Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) struct PlatformSpecificEventLoopAttributes {}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct PlatformSpecificWindowAttributes;

/// The display lease's generation.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct WindowId(u64);

impl WindowId {
    pub const fn dummy() -> Self {
        WindowId(0)
    }
}

impl From<WindowId> for u64 {
    fn from(id: WindowId) -> Self {
        id.0
    }
}

impl From<u64> for WindowId {
    fn from(generation: u64) -> Self {
        Self(generation)
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct DeviceId;

impl DeviceId {
    pub const fn dummy() -> Self {
        DeviceId
    }
}

/// A negative errno value from a lease operation.
#[derive(Clone, Debug)]
pub struct OsError(pub(crate) &'static str, pub(crate) c_int);

impl fmt::Display for OsError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.0, std::io::Error::from_raw_os_error(-self.1))
    }
}

/// The page's canvas, as the display lease reports it.
#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct MonitorHandle {
    size: (u32, u32),
}

impl MonitorHandle {
    pub fn name(&self) -> Option<String> {
        Some("Dolly".to_owned())
    }

    pub fn size(&self) -> PhysicalSize<u32> {
        self.size.into()
    }

    pub fn position(&self) -> PhysicalPosition<i32> {
        (0, 0).into()
    }

    pub fn scale_factor(&self) -> f64 {
        1.0
    }

    pub fn refresh_rate_millihertz(&self) -> Option<u32> {
        None
    }

    pub fn video_modes(&self) -> impl Iterator<Item = VideoModeHandle> {
        std::iter::once(VideoModeHandle { monitor: self.clone() })
    }
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub struct VideoModeHandle {
    monitor: MonitorHandle,
}

impl VideoModeHandle {
    pub fn size(&self) -> PhysicalSize<u32> {
        self.monitor.size()
    }

    pub fn bit_depth(&self) -> u16 {
        32
    }

    pub fn refresh_rate_millihertz(&self) -> u32 {
        60000
    }

    pub fn monitor(&self) -> MonitorHandle {
        self.monitor.clone()
    }
}

/// `<dolly/display.h>` and `<dolly/input.h>`; `cc` links their clients into every program. And
/// `<x11-window.h>` (demos/x11), a window on the X server DISPLAY names whose records are input@0's,
/// over Xlib and sockets@0's client.
mod ffi {
    use std::os::raw::{c_char, c_int, c_void};

    pub const EVENT_KEY: u32 = 1;
    pub const EVENT_TEXT: u32 = 2;
    pub const EVENT_FOCUS: u32 = 4;
    pub const EVENT_POINTER: u32 = 6;
    pub const EVENT_SCROLL: u32 = 7;
    pub const EVENT_POINTER_MOTION: u32 = 8;
    pub const EVENT_POINTER_PRESENCE: u32 = 10;
    pub const EVENT_DROPPED: u32 = 11;
    pub const TERMINAL_ISIG: c_int = 1 << 4;
    pub const EVENT_X11_SIZE: u32 = 64;
    pub const EVENT_X11_CLOSE: u32 = 65;
    pub const KEY_ACTION_RELEASE: u32 = 0;
    pub const KEY_ACTION_REPEAT: u32 = 2;
    pub const POINTER_ACTION_PRESS: u32 = 1;
    pub const POINTER_ACTION_DRAG: u32 = 2;
    pub const SCROLL_UNIT_PIXEL: u32 = 0;
    pub const SCROLL_UNIT_PAGE: u32 = 2;
    pub const MOD_SHIFT: u32 = 1;
    pub const MOD_CONTROL: u32 = 2;
    pub const MOD_ALT: u32 = 4;
    pub const MOD_META: u32 = 8;
    pub const FLAG_COMPOSING: u32 = 1;

    pub const CURSOR_TEXT: u32 = 0;
    pub const CURSOR_DEFAULT: u32 = 1;
    pub const CURSOR_CROSSHAIR: u32 = 2;
    pub const CURSOR_POINTER: u32 = 3;
    pub const CURSOR_HIDDEN: u32 = 4;
    pub const CURSOR_NS_RESIZE: u32 = 5;
    pub const CURSOR_EW_RESIZE: u32 = 6;
    pub const CURSOR_NWSE_RESIZE: u32 = 7;
    pub const CURSOR_NESW_RESIZE: u32 = 8;
    pub const CURSOR_MOVE: u32 = 9;
    pub const CURSOR_WAIT: u32 = 10;
    pub const CURSOR_PROGRESS: u32 = 11;
    pub const CURSOR_NOT_ALLOWED: u32 = 12;
    pub const CURSOR_HELP: u32 = 13;

    #[repr(C)]
    #[derive(Default)]
    pub struct Surface {
        pub generation: u64,
        pub width: u32,
        pub height: u32,
        pub stride: u32,
        pub pixel_format: u32,
    }

    #[repr(C)]
    pub struct InputEvent {
        pub kind: u32,
        pub action: u32,
        pub modifiers: u32,
        pub flags: u32,
        pub x: i32,
        pub y: i32,
        pub reserved: [u32; 2],
        pub key_length: u16,
        pub code_length: u16,
        pub text_length: u16,
        pub reserved_length: u16,
        pub data: [u8; 88],
    }

    const _: () = assert!(std::mem::size_of::<InputEvent>() == 128);

    impl InputEvent {
        pub fn zeroed() -> Self {
            // SAFETY: every field is an integer.
            unsafe { std::mem::zeroed() }
        }

        fn field(&self, start: usize, length: u16) -> &str {
            let end = start + length as usize;
            self.data.get(start..end).and_then(|bytes| std::str::from_utf8(bytes).ok()).unwrap_or("")
        }

        pub fn key(&self) -> &str {
            self.field(0, self.key_length)
        }

        pub fn code(&self) -> &str {
            self.field(self.key_length as usize, self.code_length)
        }

        pub fn text(&self) -> &str {
            self.field(self.key_length as usize + self.code_length as usize, self.text_length)
        }
    }

    extern "C" {
        pub fn dolly_display_acquire(surface: *mut Surface) -> c_int;
        pub fn dolly_display_set_cursor(generation: u64, cursor: u32) -> c_int;
        pub fn dolly_display_release(generation: u64) -> c_int;
        pub fn dolly_input_acquire(generation: *mut u64) -> c_int;
        pub fn dolly_input_next_event(
            generation: u64,
            event: *mut InputEvent,
            timeout_milliseconds: f64,
        ) -> c_int;
        pub fn dolly_input_set_pointer_relative(generation: u64, relative: c_int) -> c_int;
        pub fn dolly_input_release(generation: u64) -> c_int;
        /// `<dolly/runtime.h>`: the terminal's DOLLY_TERMINAL_* modes.
        pub fn dolly_terminal_mode_get(descriptor: c_int) -> c_int;
        pub fn dolly_terminal_mode_set(descriptor: c_int, flags: u32) -> c_int;
    }

    #[link(name = "x11-window")]
    #[link(name = "X11")]
    #[link(name = "xcb")]
    #[link(name = "Xau")]
    #[link(name = "dolly-sockets")]
    extern "C" {
        pub fn x11_window_open(title: *const c_char, width: u32, height: u32) -> *mut c_void;
        pub fn x11_window_close(window: *mut c_void);
        pub fn x11_window_next_event(window: *mut c_void, event: *mut InputEvent, timeout_milliseconds: f64) -> c_int;
        pub fn x11_window_set_title(window: *mut c_void, title: *const c_char);
        pub fn x11_window_set_cursor(window: *mut c_void, shape: u32);
        pub fn x11_window_resize(window: *mut c_void, width: u32, height: u32);
        pub fn x11_window_screen_size(window: *const c_void, width: *mut u32, height: *mut u32);
    }
}
