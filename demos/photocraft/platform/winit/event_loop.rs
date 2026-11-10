use std::cell::Cell;
use std::collections::{HashSet, VecDeque};
use std::marker::PhantomData;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

use crate::error::EventLoopError;
use crate::event::{self, ElementState, Ime, Modifiers, MouseButton, StartCause};
use crate::event_loop::{self, ControlFlow, DeviceEvents};
use crate::keyboard::{Key, KeyLocation, ModifiersState, PhysicalKey};
use crate::platform::pump_events::PumpStatus;
use crate::window::{CustomCursor as RootCustomCursor, CustomCursorSource, Theme, WindowId as RootWindowId};

use super::ffi;
use super::{DeviceId, KeyEventExtra, MonitorHandle, PlatformSpecificEventLoopAttributes, WindowId};

/// The window's leases, as the loop reads them.
#[derive(Clone, Copy)]
pub(super) struct Leases {
    pub display: u64,
    pub input: u64,
    pub size: (u32, u32),
}

/// State the window (on any thread) and the loop share.
#[derive(Default)]
pub(super) struct Shared {
    pub window: Mutex<Option<Leases>>,
    pub created: Mutex<VecDeque<WindowId>>,
    pub destroyed: Mutex<VecDeque<WindowId>>,
    pub redraw: AtomicBool,
    pub user_event: AtomicBool,
    /// The records the window's input thread read; the loop waits on `wake` for them, for other
    /// threads' events and redraw requests, and for its deadline.
    pub records: Mutex<VecDeque<ffi::InputEvent>>,
    pub wake: Condvar,
}

impl Shared {
    /// Ends the loop's wait, under the lock it checks what is pending with.
    pub fn wake(&self) {
        let _records = self.records.lock().unwrap();
        self.wake.notify_one();
    }

    fn events_pending(&self) -> bool {
        self.redraw.load(Ordering::Acquire)
            || self.user_event.load(Ordering::Acquire)
            || !self.created.lock().unwrap().is_empty()
            || !self.destroyed.lock().unwrap().is_empty()
    }
}

/// The window's records as they come: a thread of its own waits for each, so that the loop waits
/// on one condition. It ends when the lease does.
pub(super) fn read_input(shared: Arc<Shared>, input: u64) {
    loop {
        let mut record = ffi::InputEvent::zeroed();
        // SAFETY: record is a whole input record; a negative timeout waits for one.
        let result = unsafe { ffi::dolly_input_next_event(input, &mut record, -1.0) };
        if result < 0 {
            return;
        }
        if result > 0 {
            shared.records.lock().unwrap().push_back(record);
            shared.wake.notify_one();
        }
    }
}

pub struct EventLoop<T: 'static> {
    window_target: event_loop::ActiveEventLoop,
    user_events_sender: mpsc::Sender<T>,
    user_events_receiver: mpsc::Receiver<T>,
    loop_running: bool,
    input: Input,
}

impl<T: 'static> EventLoop<T> {
    pub(crate) fn new(_: &PlatformSpecificEventLoopAttributes) -> Result<Self, EventLoopError> {
        let (user_events_sender, user_events_receiver) = mpsc::channel();
        Ok(Self {
            window_target: event_loop::ActiveEventLoop {
                p: ActiveEventLoop {
                    control_flow: Cell::new(ControlFlow::default()),
                    exit: Cell::new(None),
                    shared: Arc::new(Shared::default()),
                },
                _marker: PhantomData,
            },
            user_events_sender,
            user_events_receiver,
            loop_running: false,
            input: Input::default(),
        })
    }

    pub fn window_target(&self) -> &event_loop::ActiveEventLoop {
        &self.window_target
    }

    pub fn create_proxy(&self) -> EventLoopProxy<T> {
        EventLoopProxy {
            user_events_sender: self.user_events_sender.clone(),
            shared: self.window_target.p.shared.clone(),
        }
    }

    pub fn run<F>(mut self, event_handler: F) -> Result<(), EventLoopError>
    where
        F: FnMut(event::Event<T>, &event_loop::ActiveEventLoop),
    {
        self.run_on_demand(event_handler)
    }

    pub fn run_on_demand<F>(&mut self, mut event_handler: F) -> Result<(), EventLoopError>
    where
        F: FnMut(event::Event<T>, &event_loop::ActiveEventLoop),
    {
        loop {
            match self.pump_events(None, &mut event_handler) {
                PumpStatus::Exit(0) => return Ok(()),
                PumpStatus::Exit(code) => return Err(EventLoopError::ExitFailure(code)),
                PumpStatus::Continue => {},
            }
        }
    }

    pub fn pump_events<F>(&mut self, timeout: Option<Duration>, mut event_handler: F) -> PumpStatus
    where
        F: FnMut(event::Event<T>, &event_loop::ActiveEventLoop),
    {
        if !self.loop_running {
            self.loop_running = true;
            self.single_iteration(&mut event_handler, StartCause::Init);
        }
        if self.window_target.p.exit.get().is_none() {
            let start = Instant::now();
            let deadline = match self.window_target.p.control_flow() {
                ControlFlow::Poll => Some(start),
                ControlFlow::Wait => None,
                ControlFlow::WaitUntil(deadline) => Some(deadline),
            };
            let deadline = match (deadline, timeout) {
                (Some(deadline), Some(timeout)) => Some(deadline.min(start + timeout)),
                (deadline, None) => deadline,
                (None, Some(timeout)) => Some(start + timeout),
            };
            self.wait(deadline);
            let cause = match self.window_target.p.control_flow() {
                ControlFlow::Poll => StartCause::Poll,
                ControlFlow::Wait => StartCause::WaitCancelled { start, requested_resume: None },
                ControlFlow::WaitUntil(deadline) if Instant::now() < deadline => {
                    StartCause::WaitCancelled { start, requested_resume: Some(deadline) }
                },
                ControlFlow::WaitUntil(deadline) => {
                    StartCause::ResumeTimeReached { start, requested_resume: deadline }
                },
            };
            self.single_iteration(&mut event_handler, cause);
        }
        match self.window_target.p.exit.get() {
            Some(code) => {
                self.loop_running = false;
                event_handler(event::Event::LoopExiting, &self.window_target);
                PumpStatus::Exit(code)
            },
            None => PumpStatus::Continue,
        }
    }

    /// Until a record, a user event or redraw request, or the deadline.
    fn wait(&mut self, deadline: Option<Instant>) {
        let shared = self.window_target.p.shared.clone();
        let mut records = shared.records.lock().unwrap();
        while records.is_empty() && !shared.events_pending() {
            records = match deadline {
                None => shared.wake.wait(records).unwrap(),
                Some(deadline) => {
                    let now = Instant::now();
                    if deadline <= now {
                        return;
                    }
                    shared.wake.wait_timeout(records, deadline - now).unwrap().0
                },
            };
        }
    }

    fn single_iteration<F>(&mut self, event_handler: &mut F, cause: StartCause)
    where
        F: FnMut(event::Event<T>, &event_loop::ActiveEventLoop),
    {
        let target = &self.window_target;
        let shared = target.p.shared.clone();
        event_handler(event::Event::NewEvents(cause), target);
        if cause == StartCause::Init {
            event_handler(event::Event::Resumed, target);
        }

        // A handler may create or drop the window: no lock is held while one runs.
        while let Some(window_id) = pop(&shared.created) {
            let leases = *shared.window.lock().unwrap();
            if let Some(leases) = leases {
                self.input = Input::default();
                let event = event::WindowEvent::Resized(leases.size.into());
                event_handler(event::Event::WindowEvent { window_id: RootWindowId(window_id), event }, target);
            }
        }

        let leases = *shared.window.lock().unwrap();
        let records: Vec<_> = shared.records.lock().unwrap().drain(..).collect();
        if let Some(leases) = leases {
            let window_id = RootWindowId(WindowId(leases.display));
            let mut send = |event| event_handler(event, target);
            for record in &records {
                self.input.translate(window_id, record, &mut send);
            }
        }

        if shared.user_event.swap(false, Ordering::AcqRel) {
            while let Ok(event) = self.user_events_receiver.try_recv() {
                event_handler(event::Event::UserEvent(event), target);
            }
        }

        let leases = *shared.window.lock().unwrap();
        if shared.redraw.swap(false, Ordering::AcqRel) {
            if let Some(leases) = leases {
                let window_id = RootWindowId(WindowId(leases.display));
                let event = event::WindowEvent::RedrawRequested;
                event_handler(event::Event::WindowEvent { window_id, event }, target);
            }
        }

        while let Some(window_id) = pop(&shared.destroyed) {
            let event = event::WindowEvent::Destroyed;
            event_handler(event::Event::WindowEvent { window_id: RootWindowId(window_id), event }, target);
        }

        event_handler(event::Event::AboutToWait, target);
    }
}

fn pop(queue: &Mutex<VecDeque<WindowId>>) -> Option<WindowId> {
    queue.lock().unwrap().pop_front()
}

/// The window's input, from its records: what is held, where the pointer is.
#[derive(Default)]
struct Input {
    modifiers: ModifiersState,
    keys: HashSet<PhysicalKey>,
    buttons: HashSet<MouseButton>,
    pointer: Option<(i32, i32)>,
}

fn modifiers_state(modifiers: u32) -> ModifiersState {
    let mut state = ModifiersState::empty();
    state.set(ModifiersState::SHIFT, modifiers & ffi::MOD_SHIFT != 0);
    state.set(ModifiersState::CONTROL, modifiers & ffi::MOD_CONTROL != 0);
    state.set(ModifiersState::ALT, modifiers & ffi::MOD_ALT != 0);
    state.set(ModifiersState::SUPER, modifiers & ffi::MOD_META != 0);
    state
}

fn key_location(code: &str) -> KeyLocation {
    if code.starts_with("Numpad") {
        KeyLocation::Numpad
    } else if code.ends_with("Left") && code != "ArrowLeft" {
        KeyLocation::Left
    } else if code.ends_with("Right") && code != "ArrowRight" {
        KeyLocation::Right
    } else {
        KeyLocation::Standard
    }
}

/// In a browser's numbering of pointer buttons.
fn mouse_button(button: u32) -> MouseButton {
    match button {
        0 => MouseButton::Left,
        1 => MouseButton::Middle,
        2 => MouseButton::Right,
        3 => MouseButton::Back,
        4 => MouseButton::Forward,
        other => MouseButton::Other(other as u16),
    }
}

impl Input {
    fn translate<T: 'static>(
        &mut self,
        window_id: RootWindowId,
        record: &ffi::InputEvent,
        send: &mut impl FnMut(event::Event<T>),
    ) {
        let device_id = event::DeviceId(DeviceId);
        let mut window_event = |event| send(event::Event::WindowEvent { window_id, event });
        match record.kind {
            ffi::EVENT_KEY => {
                self.update_modifiers(record.modifiers, &mut window_event);
                let pressed = record.action != ffi::KEY_ACTION_RELEASE;
                let physical_key = PhysicalKey::from_key_code_attribute_value(record.code());
                let logical_key = Key::from_key_attribute_value(record.key());
                // A key that writes a character names it; what a composition makes arrives as
                // TEXT records.
                let text = match &logical_key {
                    Key::Character(text) if pressed && record.flags & ffi::FLAG_COMPOSING == 0 => {
                        Some(text.clone())
                    },
                    _ => None,
                };
                if pressed {
                    self.keys.insert(physical_key);
                } else {
                    self.keys.remove(&physical_key);
                }
                window_event(event::WindowEvent::KeyboardInput {
                    device_id,
                    event: event::KeyEvent {
                        physical_key,
                        logical_key,
                        text,
                        location: key_location(record.code()),
                        state: if pressed { ElementState::Pressed } else { ElementState::Released },
                        repeat: record.action == ffi::KEY_ACTION_REPEAT,
                        platform_specific: KeyEventExtra,
                    },
                    is_synthetic: false,
                });
            },
            ffi::EVENT_TEXT => {
                window_event(event::WindowEvent::Ime(Ime::Preedit(String::new(), None)));
                window_event(event::WindowEvent::Ime(Ime::Commit(record.text().to_owned())));
            },
            ffi::EVENT_POINTER => {
                self.update_modifiers(record.modifiers, &mut window_event);
                let position = (record.x, record.y);
                if self.pointer != Some(position) {
                    self.pointer = Some(position);
                    window_event(event::WindowEvent::CursorMoved {
                        device_id,
                        position: (position.0 as f64, position.1 as f64).into(),
                    });
                }
                if record.action != ffi::POINTER_ACTION_DRAG {
                    let button = mouse_button((record.flags >> 8) & 7);
                    let state = if record.action == ffi::POINTER_ACTION_PRESS {
                        self.buttons.insert(button);
                        ElementState::Pressed
                    } else {
                        self.buttons.remove(&button);
                        ElementState::Released
                    };
                    window_event(event::WindowEvent::MouseInput { device_id, state, button });
                }
            },
            ffi::EVENT_SCROLL => {
                self.update_modifiers(record.modifiers, &mut window_event);
                // Positive toward later content; winit's positive deltas reveal earlier content.
                let amount = -(record.y as f64) / 1000.0;
                let delta = match record.action {
                    ffi::SCROLL_UNIT_PIXEL => {
                        event::MouseScrollDelta::PixelDelta((0.0, amount).into())
                    },
                    // A page is 30 lines, as SDL's port counts them.
                    ffi::SCROLL_UNIT_PAGE => event::MouseScrollDelta::LineDelta(0.0, amount as f32 * 30.0),
                    _ => event::MouseScrollDelta::LineDelta(0.0, amount as f32),
                };
                window_event(event::WindowEvent::MouseWheel {
                    device_id,
                    delta,
                    phase: event::TouchPhase::Moved,
                });
            },
            ffi::EVENT_FOCUS => {
                if record.action == 0 {
                    self.release_held(&mut window_event);
                }
                window_event(event::WindowEvent::Focused(record.action != 0));
            },
            ffi::EVENT_POINTER_PRESENCE => {
                window_event(if record.action != 0 {
                    event::WindowEvent::CursorEntered { device_id }
                } else {
                    event::WindowEvent::CursorLeft { device_id }
                });
            },
            ffi::EVENT_POINTER_MOTION => {
                let delta = (record.x as f64 / 1000.0, record.y as f64 / 1000.0);
                send(event::Event::DeviceEvent {
                    device_id,
                    event: event::DeviceEvent::MouseMotion { delta },
                });
            },
            // Records were lost: let go of what was held.
            ffi::EVENT_DROPPED => self.release_held(&mut window_event),
            _ => {},
        }
    }

    fn update_modifiers(&mut self, modifiers: u32, window_event: &mut impl FnMut(event::WindowEvent)) {
        let state = modifiers_state(modifiers);
        if state != self.modifiers {
            self.modifiers = state;
            window_event(event::WindowEvent::ModifiersChanged(Modifiers {
                state,
                pressed_mods: Default::default(),
            }));
        }
    }

    fn release_held(&mut self, window_event: &mut impl FnMut(event::WindowEvent)) {
        let device_id = event::DeviceId(DeviceId);
        for physical_key in std::mem::take(&mut self.keys) {
            window_event(event::WindowEvent::KeyboardInput {
                device_id,
                event: event::KeyEvent {
                    physical_key,
                    logical_key: Key::Unidentified(crate::keyboard::NativeKey::Unidentified),
                    text: None,
                    location: KeyLocation::Standard,
                    state: ElementState::Released,
                    repeat: false,
                    platform_specific: KeyEventExtra,
                },
                is_synthetic: true,
            });
        }
        for button in std::mem::take(&mut self.buttons) {
            window_event(event::WindowEvent::MouseInput { device_id, state: ElementState::Released, button });
        }
        self.update_modifiers(0, window_event);
    }
}

pub struct EventLoopProxy<T: 'static> {
    user_events_sender: mpsc::Sender<T>,
    shared: Arc<Shared>,
}

impl<T> EventLoopProxy<T> {
    pub fn send_event(&self, event: T) -> Result<(), event_loop::EventLoopClosed<T>> {
        self.user_events_sender.send(event).map_err(|mpsc::SendError(x)| event_loop::EventLoopClosed(x))?;
        self.shared.user_event.store(true, Ordering::Release);
        self.shared.wake();
        Ok(())
    }
}

impl<T> Clone for EventLoopProxy<T> {
    fn clone(&self) -> Self {
        Self { user_events_sender: self.user_events_sender.clone(), shared: self.shared.clone() }
    }
}

impl<T> Unpin for EventLoopProxy<T> {}

pub struct ActiveEventLoop {
    control_flow: Cell<ControlFlow>,
    exit: Cell<Option<i32>>,
    pub(super) shared: Arc<Shared>,
}

impl ActiveEventLoop {
    pub fn create_custom_cursor(&self, source: CustomCursorSource) -> RootCustomCursor {
        let _ = source.inner;
        RootCustomCursor { inner: super::PlatformCustomCursor }
    }

    pub(super) fn monitor(&self) -> MonitorHandle {
        let size = self.shared.window.lock().unwrap().map(|leases| leases.size).unwrap_or((0, 0));
        MonitorHandle { size }
    }

    pub fn primary_monitor(&self) -> Option<MonitorHandle> {
        Some(self.monitor())
    }

    pub fn available_monitors(&self) -> VecDeque<MonitorHandle> {
        VecDeque::from([self.monitor()])
    }

    #[inline]
    pub fn listen_device_events(&self, _allowed: DeviceEvents) {}

    #[inline]
    pub fn system_theme(&self) -> Option<Theme> {
        None
    }

    #[cfg(feature = "rwh_06")]
    #[inline]
    pub fn raw_display_handle_rwh_06(&self) -> Result<rwh_06::RawDisplayHandle, rwh_06::HandleError> {
        Ok(rwh_06::RawDisplayHandle::Dolly(rwh_06::DollyDisplayHandle::new()))
    }

    pub fn set_control_flow(&self, control_flow: ControlFlow) {
        self.control_flow.set(control_flow)
    }

    pub fn control_flow(&self) -> ControlFlow {
        self.control_flow.get()
    }

    pub(crate) fn exit(&self) {
        self.exit.set(Some(0));
    }

    pub(crate) fn clear_exit(&self) {
        self.exit.set(None);
    }

    pub(crate) fn exiting(&self) -> bool {
        self.exit.get().is_some()
    }

    pub(crate) fn owned_display_handle(&self) -> OwnedDisplayHandle {
        OwnedDisplayHandle
    }
}

#[derive(Clone)]
pub(crate) struct OwnedDisplayHandle;

impl OwnedDisplayHandle {
    #[cfg(feature = "rwh_06")]
    #[inline]
    pub fn raw_display_handle_rwh_06(&self) -> Result<rwh_06::RawDisplayHandle, rwh_06::HandleError> {
        Ok(rwh_06::DollyDisplayHandle::new().into())
    }
}
