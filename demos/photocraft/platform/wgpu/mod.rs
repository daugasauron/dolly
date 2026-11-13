//! Dolly: the browser's WebGPU through gpu@0's explicit records (`host/gpu/dolly-gpu-0.wat`),
//! which keep WebGPU's object model as wgpu's API does. One gpu@0 scope per device; objects are
//! its handles. Creations and queue writes go to the scope's packet as they are made, a command
//! buffer's records when it is submitted, ending in SUBMIT, which presents a surface it drew on.
//! WebGPU validates after a batch is answered: its errors arrive with the next WAIT.

use alloc::{boxed::Box, string::String, sync::Arc, vec, vec::Vec};
use core::{future::ready, ops::Range, pin::Pin};
use std::sync::Mutex;

use crate::dispatch::{self, BufferMapCallback};
use crate::WriteOnly;

mod convert;
mod encoder;

pub use encoder::{
    DollyCommandBuffer, DollyCommandEncoder, DollyComputePass, DollyRenderBundle,
    DollyRenderBundleEncoder, DollyRenderPass,
};

/// `<dolly/gpu.h>`; `cc` links its client into every program.
pub(crate) mod ffi {
    pub const PACKET_BYTES: usize = 1048576;
    pub const REPLY_BYTES: usize = 65536;
    /// A batch's header, before its records.
    pub const BATCH_HEADER_BYTES: usize = 40;
    pub const MAX_COMMANDS: u32 = 1024;
    pub const FEATURE_LARGE_BATCH: u32 = 128;
    pub const FEATURE_SURFACE_BGRA: u32 = 32;
    pub const FEATURE_EXPLICIT: u32 = 1024;

    #[repr(C)]
    pub struct Gpu {
        pub scope: u64,
        pub sequence: u64,
        pub count: u32,
        pub length: usize,
        pub packet: [u8; PACKET_BYTES],
        pub reply: [u8; REPLY_BYTES],
    }

    extern "C" {
        pub fn dolly_gpu_open(g: *mut Gpu, width: u32, height: u32) -> i32;
        pub fn dolly_gpu_close(g: *mut Gpu) -> i32;
        pub fn dolly_gpu_wait(g: *mut Gpu) -> i32;
        pub fn dolly_gpu_capabilities(g: *mut Gpu) -> i32;
        pub fn dolly_gpu_limits(g: *mut Gpu) -> i32;
        pub fn dolly_gpu_read(g: *mut Gpu, buffer: u64, offset: u64, length: u64) -> i32;
        pub fn dolly_gpu_begin(g: *mut Gpu);
        pub fn dolly_gpu_record(g: *mut Gpu, opcode: u32, bytes: usize) -> *mut u8;
        pub fn dolly_gpu_batch(g: *mut Gpu) -> i32;
        pub fn dolly_gpu_continue(g: *mut Gpu) -> i32;
    }

    // <x11-window.h> (demos/x11) and the libraries under it, as winit's platform links them: a
    // program without a window (photocraft-cli) links them too.
    #[link(name = "x11-window")]
    #[link(name = "X11")]
    #[link(name = "xcb")]
    #[link(name = "Xau")]
    #[link(name = "dolly-sockets")]
    extern "C" {
        pub fn x11_window_present(
            window: *mut core::ffi::c_void,
            pixels: *const u8,
            width: u32,
            height: u32,
            stride: usize,
            rgba: core::ffi::c_int,
        ) -> core::ffi::c_int;
    }
}

/// Record opcodes of dolly-gpu-0.wat.
pub(crate) mod op {
    pub const CREATE_BUFFER: u32 = 1;
    pub const WRITE_BUFFER: u32 = 2;
    pub const CREATE_SHADER: u32 = 3;
    pub const COPY_BUFFER: u32 = 9;
    pub const MAP_READ: u32 = 10;
    pub const UNMAP: u32 = 11;
    pub const RELEASE: u32 = 12;
    pub const SUBMIT: u32 = 13;
    pub const CREATE_TEXTURE: u32 = 18;
    pub const WRITE_TEXTURE: u32 = 19;
    pub const CREATE_SAMPLER: u32 = 20;
    pub const END_RENDER_PASS: u32 = 24;
    pub const VIEWPORT: u32 = 26;
    pub const CREATE_VIEW: u32 = 27;
    pub const CREATE_BIND_GROUP_LAYOUT: u32 = 28;
    pub const CREATE_PIPELINE_LAYOUT: u32 = 29;
    pub const CREATE_BIND_GROUP: u32 = 30;
    pub const CREATE_RENDER_PIPELINE: u32 = 31;
    pub const CREATE_COMPUTE_PIPELINE: u32 = 32;
    pub const CREATE_QUERY_SET: u32 = 33;
    pub const COPY_BUFFER_TO_TEXTURE: u32 = 34;
    pub const COPY_TEXTURE_TO_BUFFER: u32 = 35;
    pub const COPY_TEXTURE_TO_TEXTURE: u32 = 36;
    pub const CLEAR_BUFFER: u32 = 37;
    pub const WRITE_TIMESTAMP: u32 = 38;
    pub const RESOLVE_QUERY_SET: u32 = 39;
    pub const BEGIN_VIEW_PASS: u32 = 40;
    pub const BEGIN_COMPUTE_PASS: u32 = 41;
    pub const END_COMPUTE_PASS: u32 = 42;
    pub const SET_PIPELINE: u32 = 43;
    pub const SET_BIND_GROUP: u32 = 44;
    pub const SET_VERTEX_BUFFER: u32 = 45;
    pub const SET_INDEX_BUFFER: u32 = 46;
    pub const DRAW: u32 = 47;
    pub const DRAW_INDEXED: u32 = 48;
    pub const DRAW_INDIRECT: u32 = 49;
    pub const DRAW_INDEXED_INDIRECT: u32 = 50;
    pub const SET_BLEND_CONSTANT: u32 = 51;
    pub const SET_STENCIL_REFERENCE: u32 = 52;
    pub const DISPATCH: u32 = 53;
    pub const DISPATCH_INDIRECT: u32 = 54;
}

/// One record: the u32 opcode and byte length, then the body, padded to 8.
pub(crate) struct Record(pub Vec<u8>);

impl Record {
    pub fn new(opcode: u32, bytes: usize) -> Self {
        let mut data = vec![0; (bytes + 7) & !7];
        let length = data.len() as u32;
        data[0..4].copy_from_slice(&opcode.to_le_bytes());
        data[4..8].copy_from_slice(&length.to_le_bytes());
        Self(data)
    }
    pub fn u32(&mut self, at: usize, value: u32) -> &mut Self {
        self.0[at..at + 4].copy_from_slice(&value.to_le_bytes());
        self
    }
    pub fn i32(&mut self, at: usize, value: i32) -> &mut Self {
        self.0[at..at + 4].copy_from_slice(&value.to_le_bytes());
        self
    }
    pub fn u64(&mut self, at: usize, value: u64) -> &mut Self {
        self.0[at..at + 8].copy_from_slice(&value.to_le_bytes());
        self
    }
    pub fn f32(&mut self, at: usize, value: f32) -> &mut Self {
        self.0[at..at + 4].copy_from_slice(&value.to_le_bytes());
        self
    }
    pub fn f64(&mut self, at: usize, value: f64) -> &mut Self {
        self.0[at..at + 8].copy_from_slice(&value.to_le_bytes());
        self
    }
    pub fn bytes(&mut self, at: usize, value: &[u8]) -> &mut Self {
        self.0[at..at + value.len()].copy_from_slice(value);
        self
    }
}

/// The largest record body that fits a packet.
const RECORD_BYTES: usize = ffi::PACKET_BYTES - ffi::BATCH_HEADER_BYTES;
/// Each WRITE record's share of a larger write, a multiple of 4.
const WRITE_CHUNK: usize = 512 * 1024;
/// MAP_READ maps at most this much at once; READ returns at most a reply.
const MAP_CHUNK: u64 = 16 * 1024 * 1024;

// Emscripten's libc numbers errno as WASI does.
const ENOMEM: i32 = 48;
const ENOSYS: i32 = 52;

fn errno() -> i32 {
    std::io::Error::last_os_error().raw_os_error().unwrap_or(0)
}

/// A gpu@0 scope: its packet, the next handle, what went wrong since it was last reported.
struct Client {
    g: Box<ffi::Gpu>,
    next_handle: u64,
    max_records: u32,
    errors: Vec<crate::Error>,
}

fn error(errno: i32, what: &str) -> crate::Error {
    let description = alloc::format!(
        "gpu@0 {what} (errno {errno}); the page's console has WebGPU's message"
    );
    let source: crate::ErrorSource = Box::new(std::io::Error::from_raw_os_error(errno));
    if errno == ENOMEM {
        crate::Error::OutOfMemory { source }
    } else {
        crate::Error::Validation { source, description }
    }
}

impl Client {
    fn open(surface: bool) -> Result<Self, i32> {
        // SAFETY: every field of ffi::Gpu is an integer or bytes.
        let mut g: Box<ffi::Gpu> = unsafe { Box::new_zeroed().assume_init() };
        // The surface takes the size of the passes that draw on it.
        let size = if surface { 64 } else { 0 };
        // SAFETY: g is a whole client.
        if unsafe { ffi::dolly_gpu_open(&mut *g, size, size) } < 0 {
            return Err(errno());
        }
        let mut client = Self { g, next_handle: 1, max_records: 256, errors: Vec::new() };
        let features = client.capabilities();
        if features & ffi::FEATURE_EXPLICIT == 0 {
            // SAFETY: g is this scope.
            unsafe { ffi::dolly_gpu_close(&mut *client.g) };
            // A provider without explicit records.
            return Err(ENOSYS);
        }
        if features & ffi::FEATURE_LARGE_BATCH != 0 {
            client.max_records = ffi::MAX_COMMANDS;
        }
        // SAFETY: g is this scope.
        unsafe { ffi::dolly_gpu_begin(&mut *client.g) };
        Ok(client)
    }

    fn capabilities(&mut self) -> u32 {
        // SAFETY: g is this scope.
        if unsafe { ffi::dolly_gpu_capabilities(&mut *self.g) } < 128 {
            return 0;
        }
        u32::from_le_bytes(self.g.reply[0..4].try_into().unwrap())
    }

    fn limits(&mut self) -> [u64; 35] {
        let mut limits = [0u64; 35];
        // SAFETY: g is this scope.
        if unsafe { ffi::dolly_gpu_limits(&mut *self.g) } >= 280 {
            for (index, limit) in limits.iter_mut().enumerate() {
                *limit = u64::from_le_bytes(self.g.reply[index * 8..index * 8 + 8].try_into().unwrap());
            }
        }
        limits
    }

    fn handle(&mut self) -> u64 {
        let handle = self.next_handle;
        self.next_handle += 1;
        handle
    }

    /// Appends a record, sending the packet first when it is full; `continued` keeps the
    /// batch's encoder and its open pass for the next.
    fn push(&mut self, record: &Record, continued: bool) {
        let bytes = record.0.len();
        assert!(bytes <= RECORD_BYTES, "a gpu@0 record of {bytes} bytes");
        if self.g.count >= self.max_records || self.g.length + bytes > ffi::PACKET_BYTES {
            self.send(continued);
        }
        // SAFETY: the packet has room for the record, which the client returns zeroed.
        unsafe {
            let p = ffi::dolly_gpu_record(&mut *self.g, u32::from_le_bytes(record.0[0..4].try_into().unwrap()), bytes);
            core::ptr::copy_nonoverlapping(record.0.as_ptr(), p, bytes);
        }
    }

    fn send(&mut self, continued: bool) {
        if self.g.count == 0 {
            return;
        }
        // SAFETY: g is this scope, its packet a batch.
        let result = unsafe {
            if continued {
                ffi::dolly_gpu_continue(&mut *self.g)
            } else {
                ffi::dolly_gpu_batch(&mut *self.g)
            }
        };
        if result < 0 {
            self.errors.push(error(errno(), "refused a batch"));
        }
        // SAFETY: g is this scope.
        unsafe { ffi::dolly_gpu_begin(&mut *self.g) };
    }

    /// Until the queue has finished what was submitted.
    fn wait(&mut self) {
        self.send(false);
        // SAFETY: g is this scope.
        if unsafe { ffi::dolly_gpu_wait(&mut *self.g) } < 0 {
            self.errors.push(error(errno(), "reported an error"));
        }
    }

    fn write(&mut self, handle: u64, offset: u64, data: &[u8]) {
        for (index, chunk) in data.chunks(WRITE_CHUNK).enumerate() {
            let mut record = Record::new(op::WRITE_BUFFER, 32 + chunk.len());
            record
                .u64(8, handle)
                .u64(16, offset + (index * WRITE_CHUNK) as u64)
                .u32(24, 32)
                .u32(28, chunk.len() as u32)
                .bytes(32, chunk);
            self.push(&record, false);
        }
    }

    /// The bytes of a MAP_READ buffer's range, after the work submitted before.
    fn read(&mut self, handle: u64, range: Range<u64>) -> Option<Vec<u8>> {
        let mut data = Vec::with_capacity((range.end - range.start) as usize);
        let mut at = range.start;
        while at < range.end {
            let length = (range.end - at).min(MAP_CHUNK);
            let mut map = Record::new(op::MAP_READ, 32);
            map.u64(8, handle).u64(16, at).u64(24, length);
            self.push(&map, false);
            self.send(false);
            let mut done = 0;
            while done < length {
                let n = (length - done).min(ffi::REPLY_BYTES as u64);
                // SAFETY: g is this scope.
                let read = unsafe { ffi::dolly_gpu_read(&mut *self.g, handle, done, n) };
                if read < 0 || read as u64 != n {
                    self.errors.push(error(errno(), "did not map a buffer"));
                    return None;
                }
                data.extend_from_slice(&self.g.reply[..n as usize]);
                done += n;
            }
            let mut unmap = Record::new(op::UNMAP, 16);
            unmap.u64(8, handle);
            self.push(&unmap, false);
            at += length;
        }
        Some(data)
    }
}

impl Drop for Client {
    fn drop(&mut self) {
        // SAFETY: g is this scope.
        unsafe { ffi::dolly_gpu_close(&mut *self.g) };
    }
}

#[derive(Default)]
struct ErrorScopes {
    /// Each thread's, as wgpu's scopes are.
    scopes: std::collections::HashMap<std::thread::ThreadId, Vec<(crate::ErrorFilter, Option<crate::Error>)>>,
    handler: Option<Arc<dyn crate::UncapturedErrorHandler>>,
}

/// A device's scope and what it shares with its objects.
pub struct Gpu {
    client: Mutex<Client>,
    callbacks: Mutex<Vec<Box<dyn FnOnce() + Send>>>,
    errors: Mutex<ErrorScopes>,
    features: wgt::Features,
    limits: wgt::Limits,
    surface_format: wgt::TextureFormat,
    /// Stands in for a pipeline layout's absent bind group layouts.
    empty_layout: u64,
}

impl core::fmt::Debug for Gpu {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.debug_struct("Gpu").finish_non_exhaustive()
    }
}

impl Gpu {
    /// Runs `f` on the scope, then reports what failed meanwhile.
    pub(crate) fn with<R>(&self, f: impl FnOnce(&mut Client) -> R) -> R {
        let (result, errors) = {
            let mut client = self.client.lock().unwrap();
            let result = f(&mut client);
            (result, core::mem::take(&mut client.errors))
        };
        for error in errors {
            self.report(error);
        }
        result
    }

    pub(crate) fn create(&self, build: impl FnOnce(u64) -> Record) -> u64 {
        self.with(|client| {
            let handle = client.handle();
            client.push(&build(handle), false);
            handle
        })
    }

    pub(crate) fn report(&self, error: crate::Error) {
        let handler = {
            let mut errors = self.errors.lock().unwrap();
            let filter = match error {
                crate::Error::OutOfMemory { .. } => crate::ErrorFilter::OutOfMemory,
                crate::Error::Validation { .. } => crate::ErrorFilter::Validation,
                crate::Error::Internal { .. } => crate::ErrorFilter::Internal,
            };
            let scopes = errors.scopes.entry(std::thread::current().id()).or_default();
            match scopes.iter_mut().rev().find(|(scope, _)| *scope == filter) {
                Some((_, slot)) => {
                    slot.get_or_insert(error);
                    return;
                },
                None => errors.handler.clone(),
            }
        };
        match handler {
            Some(handler) => handler(error),
            // As wgpu-core's default handler.
            None => panic!("wgpu error: {error}"),
        }
    }

    pub(crate) fn validation(&self, description: String) {
        let source: crate::ErrorSource = Box::new(std::io::Error::other(description.clone()));
        self.report(crate::Error::Validation { source, description });
    }

    fn release(&self, handle: u64) {
        if handle == 0 {
            return;
        }
        let mut record = Record::new(op::RELEASE, 16);
        record.u64(8, handle);
        self.with(|client| client.push(&record, false));
    }

    fn fire_callbacks(&self) {
        let callbacks = core::mem::take(&mut *self.callbacks.lock().unwrap());
        for callback in callbacks {
            callback();
        }
    }
}

/// A handle of the scope, released when the last user lets go of it: command buffers keep the
/// objects they name until they are submitted.
#[derive(Debug)]
pub struct Object {
    pub(crate) gpu: Arc<Gpu>,
    pub(crate) handle: u64,
    /// What it refers to, released after it: a view's texture, which RELEASE destroys.
    pub(crate) parent: Option<Keep>,
}

impl Drop for Object {
    fn drop(&mut self) {
        self.gpu.release(self.handle);
    }
}

pub(crate) type Keep = Arc<dyn core::any::Any + Send + Sync>;

/// Whether gpu@0 grants the browser's WebGPU: a scope opens.
pub(crate) fn dolly_webgpu_supported() -> bool {
    Client::open(false).is_ok()
}

#[derive(Debug)]
pub struct ContextDolly {
    requested_backends: wgt::Backends,
    surfaces: core::sync::atomic::AtomicBool,
}

impl dispatch::InstanceInterface for ContextDolly {
    fn new(desc: crate::InstanceDescriptor) -> Self {
        Self { requested_backends: desc.backends, surfaces: core::sync::atomic::AtomicBool::new(false) }
    }

    unsafe fn create_surface(
        &self,
        target: crate::SurfaceTargetUnsafe,
    ) -> Result<dispatch::DispatchSurface, crate::CreateSurfaceError> {
        let crate::SurfaceTargetUnsafe::RawHandle { raw_window_handle, .. } = target;
        let raw_window_handle::RawWindowHandle::Dolly(window) = raw_window_handle else {
            return Err(crate::CreateSurfaceError {
                inner: crate::CreateSurfaceErrorKind::RawHandle(
                    raw_window_handle::HandleError::NotSupported,
                ),
            });
        };
        // An X window's frames are read back, so its device needs no page surface.
        if window.x11 == 0 {
            self.surfaces.store(true, core::sync::atomic::Ordering::Release);
        }
        Ok(dispatch::DispatchSurface::custom(DollySurface { config: Mutex::new(None), x11: window.x11, frame: Mutex::new(None) }))
    }

    fn request_adapter(
        &self,
        options: &crate::RequestAdapterOptions<'_, '_>,
    ) -> Pin<Box<dyn dispatch::RequestAdapterFuture>> {
        let not_found = wgt::RequestAdapterError::NotFound {
            active_backends: wgt::Backends::BROWSER_WEBGPU,
            requested_backends: self.requested_backends,
            supported_backends: wgt::Backends::BROWSER_WEBGPU,
            no_fallback_backends: wgt::Backends::empty(),
            no_adapter_backends: wgt::Backends::BROWSER_WEBGPU,
            incompatible_surface_backends: wgt::Backends::empty(),
        };
        if !self.requested_backends.contains(wgt::Backends::BROWSER_WEBGPU) {
            return Box::pin(ready(Err(not_found)));
        }
        // A scope presents only when it was opened with a surface: the page's, not an X window's.
        let surface = match options.compatible_surface {
            Some(surface) => surface.inner.as_custom::<DollySurface>().is_none_or(|surface| surface.x11 == 0),
            None => self.surfaces.load(core::sync::atomic::Ordering::Acquire),
        };
        match DollyAdapter::open(surface) {
            Ok(adapter) => Box::pin(ready(Ok(dispatch::DispatchAdapter::custom(adapter)))),
            Err(_) => Box::pin(ready(Err(not_found))),
        }
    }

    fn poll_all_devices(&self, _force_wait: bool) -> bool {
        true
    }

    #[cfg(feature = "wgsl")]
    fn wgsl_language_features(&self) -> crate::WgslLanguageFeatures {
        crate::WgslLanguageFeatures::empty()
    }

    fn enumerate_adapters(&self, _backends: crate::Backends) -> Pin<Box<dyn dispatch::EnumerateAdapterFuture>> {
        let adapter = self.request_adapter(&crate::RequestAdapterOptions::default());
        Box::pin(async move { adapter.await.into_iter().collect() })
    }
}

/// What a scope may do, read from one opened only for that: a device opens its own, and a
/// process shows one surface (another only a descendant of it).
#[derive(Debug)]
pub struct DollyAdapter {
    surface: bool,
    features: wgt::Features,
    limits: wgt::Limits,
    surface_format: wgt::TextureFormat,
}

impl DollyAdapter {
    fn open(surface: bool) -> Result<Self, i32> {
        let mut client = Client::open(false)?;
        let surface_format = if client.capabilities() & ffi::FEATURE_SURFACE_BGRA != 0 {
            wgt::TextureFormat::Bgra8Unorm
        } else {
            wgt::TextureFormat::Rgba8Unorm
        };
        let reply = client.limits();
        let features = convert::FEATURES
            .iter()
            .filter(|(bit, _)| reply[0] & bit != 0)
            .fold(wgt::Features::empty(), |features, (_, feature)| features | *feature);
        Ok(Self {
            surface,
            features,
            limits: convert::limits(&reply),
            surface_format,
        })
    }
}

impl dispatch::AdapterInterface for DollyAdapter {
    fn request_device(&self, desc: &crate::DeviceDescriptor<'_>) -> Pin<Box<dyn dispatch::RequestDeviceFuture>> {
        let refuse = |message: String| -> Pin<Box<dyn dispatch::RequestDeviceFuture>> {
            Box::pin(ready(Err(crate::RequestDeviceError {
                inner: crate::RequestDeviceErrorKind::Custom(message),
            })))
        };
        if !self.features.contains(desc.required_features) {
            return refuse(alloc::format!(
                "gpu@0 lacks features {:?}",
                desc.required_features - self.features
            ));
        }
        let mut lower = None;
        desc.required_limits.check_limits_with_fail_fn(&self.limits, false, |name, requested, allowed| {
            lower.get_or_insert((name, requested, allowed));
        });
        if let Some((name, requested, allowed)) = lower {
            return refuse(alloc::format!("gpu@0's {name} is {allowed}, not {requested}"));
        }
        let mut client = match Client::open(self.surface) {
            Ok(client) => client,
            Err(errno) => return refuse(alloc::format!("gpu@0 did not open (errno {errno})")),
        };
        let empty_layout = client.handle();
        let mut record = Record::new(op::CREATE_BIND_GROUP_LAYOUT, 24);
        record.u64(8, empty_layout);
        client.push(&record, false);
        let gpu = Arc::new(Gpu {
            client: Mutex::new(client),
            callbacks: Mutex::new(Vec::new()),
            errors: Mutex::new(ErrorScopes::default()),
            features: desc.required_features,
            limits: desc.required_limits.clone(),
            surface_format: self.surface_format,
            empty_layout,
        });
        let device = DollyDevice { gpu: gpu.clone() };
        let queue = DollyQueue { gpu };
        Box::pin(ready(Ok((dispatch::DispatchDevice::custom(device), dispatch::DispatchQueue::custom(queue)))))
    }

    fn is_surface_supported(&self, surface: &dispatch::DispatchSurface) -> bool {
        self.surface || surface.as_custom::<DollySurface>().is_some_and(|surface| surface.x11 != 0)
    }

    fn features(&self) -> crate::Features {
        self.features
    }

    fn limits(&self) -> crate::Limits {
        self.limits.clone()
    }

    fn downlevel_capabilities(&self) -> crate::DownlevelCapabilities {
        crate::DownlevelCapabilities::default()
    }

    fn get_info(&self) -> crate::AdapterInfo {
        adapter_info()
    }

    fn get_texture_format_features(&self, format: crate::TextureFormat) -> crate::TextureFormatFeatures {
        format.guaranteed_format_features(self.features)
    }

    fn get_presentation_timestamp(&self) -> crate::PresentationTimestamp {
        crate::PresentationTimestamp::INVALID_TIMESTAMP
    }

    fn cooperative_matrix_properties(&self) -> Vec<wgt::CooperativeMatrixProperties> {
        Vec::new()
    }
}

/// The browser names no adapter to gpu@0's programs.
fn adapter_info() -> wgt::AdapterInfo {
        wgt::AdapterInfo {
            name: String::from("WebGPU through gpu@0"),
            vendor: 0,
            device: 0,
            device_type: wgt::DeviceType::Other,
            device_pci_bus_id: String::new(),
            driver: String::new(),
            driver_info: String::new(),
            backend: wgt::Backend::BrowserWebGpu,
            subgroup_min_size: 0,
            subgroup_max_size: 0,
            transient_saves_memory: None,
            limit_bucket: None,
        }
}

#[derive(Debug)]
pub struct DollyDevice {
    pub(crate) gpu: Arc<Gpu>,
}

/// A shader module's WGSL, kept to name its only entry point of a stage when a pipeline names
/// none.
#[derive(Debug)]
pub struct DollyShaderModule {
    pub(crate) object: Arc<Object>,
    source: Arc<str>,
}

impl DollyShaderModule {
    /// The entry point a stage names, or the module's only one of that stage.
    fn entry_point(&self, named: Option<&str>, stage: &str) -> String {
        if let Some(named) = named {
            return String::from(named);
        }
        let mut found = self.source.match_indices(stage).filter_map(|(at, _)| {
            let after = &self.source[at + stage.len()..];
            let after = &after[after.find("fn")? + 2..];
            let name: String = after
                .trim_start()
                .chars()
                .take_while(|c| c.is_alphanumeric() || *c == '_')
                .collect();
            (!name.is_empty()).then_some(name)
        });
        match (found.next(), found.next()) {
            (Some(name), None) => name,
            _ => String::new(),
        }
    }
}

#[derive(Debug)]
pub struct DollyBindGroupLayout {
    pub(crate) object: Arc<Object>,
}

#[derive(Debug)]
pub struct DollyBindGroup {
    pub(crate) object: Arc<Object>,
    pub(crate) keep: Vec<Keep>,
}

#[derive(Debug)]
pub struct DollyPipelineLayout {
    pub(crate) object: Arc<Object>,
    groups: Vec<Option<dispatch::DispatchBindGroupLayout>>,
}

#[derive(Debug)]
pub struct DollyRenderPipeline {
    pub(crate) object: Arc<Object>,
    layout: Option<dispatch::DispatchPipelineLayout>,
}

#[derive(Debug)]
pub struct DollyComputePipeline {
    pub(crate) object: Arc<Object>,
    layout: Option<dispatch::DispatchPipelineLayout>,
}

fn group_layout(layout: &Option<dispatch::DispatchPipelineLayout>, index: u32) -> dispatch::DispatchBindGroupLayout {
    layout
        .as_ref()
        .and_then(|layout| layout.as_custom::<DollyPipelineLayout>())
        .and_then(|layout| layout.groups.get(index as usize).cloned().flatten())
        .expect("gpu@0 has no automatic pipeline layouts, and so none of their bind group layouts")
}

#[derive(Debug)]
pub struct DollySampler {
    pub(crate) object: Arc<Object>,
}

#[derive(Debug)]
pub struct DollyQuerySet {
    pub(crate) object: Arc<Object>,
}

#[derive(Debug)]
pub struct DollyPipelineCache;

/// A buffer's bytes while it is mapped: read back, or to be written when it is unmapped.
#[derive(Debug)]
struct Mapping {
    range: Range<u64>,
    data: Vec<u8>,
    write: bool,
}

#[derive(Debug)]
pub struct DollyBuffer {
    pub(crate) object: Arc<Object>,
    size: u64,
    /// A MAP_WRITE buffer's bytes, which only the CPU writes; WebGPU's map holds them.
    shadow: Option<Mutex<Vec<u8>>>,
    mapping: Mutex<Option<Mapping>>,
}

#[derive(Debug)]
pub(crate) struct TextureInfo {
    pub object: Arc<Object>,
    pub size: wgt::Extent3d,
    pub format: wgt::TextureFormat,
    pub dimension: wgt::TextureDimension,
    pub surface: bool,
}

#[derive(Debug)]
pub struct DollyTexture {
    pub(crate) info: Arc<TextureInfo>,
}

#[derive(Debug)]
pub struct DollyTextureView {
    pub(crate) object: Arc<Object>,
    pub(crate) texture: Arc<TextureInfo>,
    /// The base mip's width and height.
    pub(crate) width: u32,
    pub(crate) height: u32,
}

#[derive(Debug)]
pub struct DollyExternalTexture;

#[derive(Debug)]
pub struct DollyBlas;

#[derive(Debug)]
pub struct DollyTlas;

fn object(gpu: &Arc<Gpu>, handle: u64) -> Arc<Object> {
    Arc::new(Object { gpu: gpu.clone(), handle, parent: None })
}

/// gpu@0 has no MAP_WRITE: such a buffer is written from its shadow when unmapped, so it
/// takes writes instead; a buffer mapped at creation does too.
fn buffer_usage(desc: &crate::BufferDescriptor<'_>) -> u32 {
    let mut usage = desc.usage;
    if usage.contains(wgt::BufferUsages::MAP_WRITE) {
        usage.remove(wgt::BufferUsages::MAP_WRITE);
        usage.insert(wgt::BufferUsages::COPY_DST);
    }
    if desc.mapped_at_creation {
        usage.insert(wgt::BufferUsages::COPY_DST);
    }
    usage.bits() & 1023
}

impl DollyDevice {
    fn texture_format(&self, format: wgt::TextureFormat) -> u32 {
        convert::texture_format(format).unwrap_or_else(|| {
            self.gpu.validation(alloc::format!("gpu@0 has no texture format {format:?}"));
            0
        })
    }

    /// Override constants as gpu@0 names them, by their @id, with the stages they are for.
    fn constants(&self, constants: &[(&str, f64)], stages: u32) -> Vec<(u32, u32, f64)> {
        constants
            .iter()
            .filter_map(|(name, value)| match name.parse::<u32>() {
                Ok(id) => Some((id, stages, *value)),
                Err(_) => {
                    self.gpu.validation(alloc::format!(
                        "gpu@0 names override constants by their @id, not \"{name}\""
                    ));
                    None
                },
            })
            .collect()
    }
}

impl dispatch::DeviceInterface for DollyDevice {
    fn features(&self) -> crate::Features {
        self.gpu.features
    }

    fn limits(&self) -> crate::Limits {
        self.gpu.limits.clone()
    }

    fn adapter_info(&self) -> crate::AdapterInfo {
        adapter_info()
    }

    fn create_shader_module(
        &self,
        desc: crate::ShaderModuleDescriptor<'_>,
        _shader_bound_checks: crate::ShaderRuntimeChecks,
    ) -> dispatch::DispatchShaderModule {
        let source: Arc<str> = match desc.source {
            #[cfg(feature = "wgsl")]
            crate::ShaderSource::Wgsl(ref code) => Arc::from(code.as_ref()),
            _ => {
                self.gpu.validation(String::from("gpu@0 takes WGSL shaders only"));
                Arc::from("")
            },
        };
        let handle = self.gpu.create(|handle| {
            let mut record = Record::new(op::CREATE_SHADER, 24 + source.len());
            record.u64(8, handle).u32(16, source.len() as u32).bytes(24, source.as_bytes());
            record
        });
        dispatch::DispatchShaderModule::custom(DollyShaderModule { object: object(&self.gpu, handle), source })
    }

    unsafe fn create_shader_module_passthrough(
        &self,
        desc: &crate::ShaderModuleDescriptorPassthrough<'_>,
    ) -> dispatch::DispatchShaderModule {
        let source: Arc<str> = Arc::from(desc.wgsl.as_deref().unwrap_or(""));
        let handle = self.gpu.create(|handle| {
            let mut record = Record::new(op::CREATE_SHADER, 24 + source.len());
            record.u64(8, handle).u32(16, source.len() as u32).bytes(24, source.as_bytes());
            record
        });
        dispatch::DispatchShaderModule::custom(DollyShaderModule { object: object(&self.gpu, handle), source })
    }

    fn create_bind_group_layout(&self, desc: &crate::BindGroupLayoutDescriptor<'_>) -> dispatch::DispatchBindGroupLayout {
        let mut record = Record::new(op::CREATE_BIND_GROUP_LAYOUT, 24 + 32 * desc.entries.len());
        record.u32(16, desc.entries.len() as u32);
        for (index, entry) in desc.entries.iter().enumerate() {
            let at = 24 + 32 * index;
            let (kind, a, b, c, min_size) = match entry.ty {
                wgt::BindingType::Buffer { ty, has_dynamic_offset, min_binding_size } => {
                    let kind = match ty {
                        wgt::BufferBindingType::Uniform => 1,
                        wgt::BufferBindingType::Storage { read_only: false } => 2,
                        wgt::BufferBindingType::Storage { read_only: true } => 3,
                    };
                    (kind, has_dynamic_offset as u32, 0, 0, min_binding_size.map_or(0, |size| size.get()))
                },
                wgt::BindingType::Sampler(ty) => {
                    let kind = match ty {
                        wgt::SamplerBindingType::Filtering => 4,
                        wgt::SamplerBindingType::NonFiltering => 5,
                        wgt::SamplerBindingType::Comparison => 6,
                    };
                    (kind, 0, 0, 0, 0)
                },
                wgt::BindingType::Texture { sample_type, view_dimension, multisampled } => {
                    (7, convert::sample_type(sample_type), convert::view_dimension(view_dimension), multisampled as u32, 0)
                },
                wgt::BindingType::StorageTexture { access, format, view_dimension } => {
                    let access = match access {
                        wgt::StorageTextureAccess::WriteOnly => 1,
                        wgt::StorageTextureAccess::ReadOnly => 2,
                        wgt::StorageTextureAccess::ReadWrite => 3,
                        wgt::StorageTextureAccess::Atomic => {
                            self.gpu.validation(String::from("gpu@0 has no atomic storage textures"));
                            3
                        },
                    };
                    (8, access, convert::view_dimension(view_dimension), self.texture_format(format), 0)
                },
                _ => {
                    self.gpu.validation(alloc::format!("gpu@0 has no binding {:?}", entry.ty));
                    (0, 0, 0, 0, 0)
                },
            };
            record
                .u32(at, entry.binding)
                .u32(at + 4, entry.visibility.bits() & 7)
                .u32(at + 8, kind)
                .u32(at + 12, a)
                .u32(at + 16, b)
                .u32(at + 20, c)
                .u64(at + 24, min_size);
        }
        let handle = self.gpu.create(|handle| {
            record.u64(8, handle);
            record
        });
        dispatch::DispatchBindGroupLayout::custom(DollyBindGroupLayout { object: object(&self.gpu, handle) })
    }

    fn create_bind_group(&self, desc: &crate::BindGroupDescriptor<'_>) -> dispatch::DispatchBindGroup {
        let layout = desc.layout.inner.as_custom::<DollyBindGroupLayout>().unwrap();
        let mut keep: Vec<Keep> = vec![layout.object.clone()];
        let mut record = Record::new(op::CREATE_BIND_GROUP, 32 + 32 * desc.entries.len());
        record.u64(16, layout.object.handle).u32(24, desc.entries.len() as u32);
        for (index, entry) in desc.entries.iter().enumerate() {
            let at = 32 + 32 * index;
            record.u32(at, entry.binding);
            match entry.resource {
                crate::BindingResource::Buffer(crate::BufferBinding { buffer, offset, size }) => {
                    let buffer = buffer.inner.as_custom::<DollyBuffer>().unwrap();
                    let size = size.map_or(buffer.size.saturating_sub(offset), |size| size.get());
                    record.u32(at + 4, 0).u64(at + 8, buffer.object.handle).u64(at + 16, offset).u64(at + 24, size);
                    keep.push(buffer.object.clone());
                },
                crate::BindingResource::Sampler(sampler) => {
                    let sampler = sampler.inner.as_custom::<DollySampler>().unwrap();
                    record.u32(at + 4, 1).u64(at + 8, sampler.object.handle);
                    keep.push(sampler.object.clone());
                },
                crate::BindingResource::TextureView(view) => {
                    let view = view.inner.as_custom::<DollyTextureView>().unwrap();
                    record.u32(at + 4, 2).u64(at + 8, view.object.handle);
                    keep.push(view.object.clone());
                },
                _ => self.gpu.validation(String::from("gpu@0 binds buffers, samplers and texture views")),
            }
        }
        let handle = self.gpu.create(|handle| {
            record.u64(8, handle);
            record
        });
        dispatch::DispatchBindGroup::custom(DollyBindGroup { object: object(&self.gpu, handle), keep })
    }

    fn create_pipeline_layout(&self, desc: &crate::PipelineLayoutDescriptor<'_>) -> dispatch::DispatchPipelineLayout {
        let groups: Vec<Option<dispatch::DispatchBindGroupLayout>> =
            desc.bind_group_layouts.iter().map(|layout| layout.map(|layout| layout.inner.clone())).collect();
        let mut record = Record::new(op::CREATE_PIPELINE_LAYOUT, 24 + 8 * groups.len());
        record.u32(16, groups.len() as u32);
        for (index, group) in groups.iter().enumerate() {
            let handle = group
                .as_ref()
                .map_or(self.gpu.empty_layout, |group| group.as_custom::<DollyBindGroupLayout>().unwrap().object.handle);
            record.u64(24 + 8 * index, handle);
        }
        let handle = self.gpu.create(|handle| {
            record.u64(8, handle);
            record
        });
        dispatch::DispatchPipelineLayout::custom(DollyPipelineLayout { object: object(&self.gpu, handle), groups })
    }

    fn create_render_pipeline(&self, desc: &crate::RenderPipelineDescriptor<'_>) -> dispatch::DispatchRenderPipeline {
        let Some(layout) = desc.layout else {
            self.gpu.validation(String::from("gpu@0 has no automatic pipeline layouts"));
            return dispatch::DispatchRenderPipeline::custom(DollyRenderPipeline { object: object(&self.gpu, 0), layout: None });
        };
        let vertex = desc.vertex.module.inner.as_custom::<DollyShaderModule>().unwrap();
        let vertex_entry = vertex.entry_point(desc.vertex.entry_point, "@vertex");
        let fragment = desc.fragment.as_ref().map(|fragment| {
            let module = fragment.module.inner.as_custom::<DollyShaderModule>().unwrap();
            (fragment, module, module.entry_point(fragment.entry_point, "@fragment"))
        });
        let targets = fragment.as_ref().map_or(&[][..], |(fragment, _, _)| fragment.targets);
        let buffers = desc.vertex.buffers;
        let attributes: usize = buffers.iter().map(|buffer| buffer.as_ref().map_or(0, |b| b.attributes.len())).sum();
        let mut constants = self.constants(desc.vertex.compilation_options.constants, 1);
        if let Some((fragment, _, _)) = &fragment {
            constants.extend(self.constants(fragment.compilation_options.constants, 2));
        }
        let fragment_entry = fragment.as_ref().map_or(String::new(), |(_, _, entry)| entry.clone());
        let mut record = Record::new(
            op::CREATE_RENDER_PIPELINE,
            160 + 40 * targets.len() + 16 * (buffers.len() + attributes + constants.len())
                + vertex_entry.len()
                + fragment_entry.len(),
        );
        let primitive = &desc.primitive;
        let strip_format = primitive.strip_index_format.map_or(0, convert::index_format);
        record
            .u64(16, layout.inner.as_custom::<DollyPipelineLayout>().unwrap().object.handle)
            .u64(24, vertex.object.handle)
            .u64(32, fragment.as_ref().map_or(0, |(_, module, _)| module.object.handle))
            .u32(40, convert::topology(primitive.topology))
            .u32(44, strip_format)
            .u32(48, matches!(primitive.front_face, wgt::FrontFace::Cw) as u32)
            .u32(52, match primitive.cull_mode {
                None => 0,
                Some(wgt::Face::Front) => 1,
                Some(wgt::Face::Back) => 2,
            })
            .u32(56, primitive.unclipped_depth as u32);
        if let Some(depth) = &desc.depth_stencil {
            let face = |record: &mut Record, at: usize, face: &wgt::StencilFaceState| {
                record
                    .u32(at, convert::compare(face.compare))
                    .u32(at + 4, convert::stencil_operation(face.fail_op))
                    .u32(at + 8, convert::stencil_operation(face.depth_fail_op))
                    .u32(at + 12, convert::stencil_operation(face.pass_op));
            };
            record
                .u32(60, self.texture_format(depth.format))
                .u32(64, depth.depth_write_enabled.unwrap_or(false) as u32)
                .u32(68, depth.depth_compare.map_or(8, convert::compare));
            face(&mut record, 72, &depth.stencil.front);
            face(&mut record, 88, &depth.stencil.back);
            record
                .u32(104, depth.stencil.read_mask)
                .u32(108, depth.stencil.write_mask)
                .i32(112, depth.bias.constant)
                .f32(116, depth.bias.slope_scale)
                .f32(120, depth.bias.clamp);
        }
        record
            .u32(124, desc.multisample.count)
            .u32(128, desc.multisample.mask as u32)
            .u32(132, desc.multisample.alpha_to_coverage_enabled as u32)
            .u32(136, targets.len() as u32)
            .u32(140, buffers.len() as u32)
            .u32(144, attributes as u32)
            .u32(148, constants.len() as u32)
            .u32(152, vertex_entry.len() as u32)
            .u32(156, fragment_entry.len() as u32);
        let mut at = 160;
        for target in targets {
            match target {
                Some(target) => {
                    record.u32(at, self.texture_format(target.format)).u32(at + 4, target.write_mask.bits());
                    if let Some(blend) = &target.blend {
                        let factor = |factor| {
                            convert::blend_factor(factor).unwrap_or_else(|| {
                                self.gpu.validation(alloc::format!("gpu@0 has no blend factor {factor:?}"));
                                0
                            })
                        };
                        record
                            .u32(at + 8, 1)
                            .u32(at + 12, convert::blend_operation(blend.color.operation))
                            .u32(at + 16, factor(blend.color.src_factor))
                            .u32(at + 20, factor(blend.color.dst_factor))
                            .u32(at + 24, convert::blend_operation(blend.alpha.operation))
                            .u32(at + 28, factor(blend.alpha.src_factor))
                            .u32(at + 32, factor(blend.alpha.dst_factor));
                    }
                },
                None => {
                    record.u32(at + 36, 1);
                },
            }
            at += 40;
        }
        for buffer in buffers {
            if let Some(buffer) = buffer {
                let step = matches!(buffer.step_mode, wgt::VertexStepMode::Instance) as u32;
                record.u32(at, buffer.array_stride as u32).u32(at + 4, step);
            }
            at += 16;
        }
        for (slot, buffer) in buffers.iter().enumerate() {
            for attribute in buffer.iter().flat_map(|buffer| buffer.attributes) {
                let format = convert::vertex_format(attribute.format).unwrap_or_else(|| {
                    self.gpu.validation(alloc::format!("gpu@0 has no vertex format {:?}", attribute.format));
                    0
                });
                record
                    .u32(at, slot as u32)
                    .u32(at + 4, attribute.shader_location)
                    .u32(at + 8, format)
                    .u32(at + 12, attribute.offset as u32);
                at += 16;
            }
        }
        for (id, stages, value) in &constants {
            record.u32(at, *id).u32(at + 4, *stages).f64(at + 8, *value);
            at += 16;
        }
        record.bytes(at, vertex_entry.as_bytes()).bytes(at + vertex_entry.len(), fragment_entry.as_bytes());
        let handle = self.gpu.create(|handle| {
            record.u64(8, handle);
            record
        });
        dispatch::DispatchRenderPipeline::custom(DollyRenderPipeline { object: object(&self.gpu, handle), layout: Some(layout.inner.clone()) })
    }

    fn create_mesh_pipeline(&self, _desc: &crate::MeshPipelineDescriptor<'_>) -> dispatch::DispatchRenderPipeline {
        panic!("MESH_SHADER feature must be enabled to call create_mesh_pipeline")
    }

    fn create_compute_pipeline(&self, desc: &crate::ComputePipelineDescriptor<'_>) -> dispatch::DispatchComputePipeline {
        let Some(layout) = desc.layout else {
            self.gpu.validation(String::from("gpu@0 has no automatic pipeline layouts"));
            return dispatch::DispatchComputePipeline::custom(DollyComputePipeline { object: object(&self.gpu, 0), layout: None });
        };
        let module = desc.module.inner.as_custom::<DollyShaderModule>().unwrap();
        let entry = module.entry_point(desc.entry_point, "@compute");
        let constants = self.constants(desc.compilation_options.constants, 0);
        let mut record = Record::new(op::CREATE_COMPUTE_PIPELINE, 40 + 16 * constants.len() + entry.len());
        record
            .u64(16, layout.inner.as_custom::<DollyPipelineLayout>().unwrap().object.handle)
            .u64(24, module.object.handle)
            .u32(32, constants.len() as u32)
            .u32(36, entry.len() as u32);
        for (index, (id, _, value)) in constants.iter().enumerate() {
            record.u32(40 + 16 * index, *id).f64(48 + 16 * index, *value);
        }
        record.bytes(40 + 16 * constants.len(), entry.as_bytes());
        let handle = self.gpu.create(|handle| {
            record.u64(8, handle);
            record
        });
        dispatch::DispatchComputePipeline::custom(DollyComputePipeline { object: object(&self.gpu, handle), layout: Some(layout.inner.clone()) })
    }

    unsafe fn create_pipeline_cache(&self, _desc: &crate::PipelineCacheDescriptor<'_>) -> dispatch::DispatchPipelineCache {
        dispatch::DispatchPipelineCache::custom(DollyPipelineCache)
    }

    fn create_buffer(&self, desc: &crate::BufferDescriptor<'_>) -> dispatch::DispatchBuffer {
        let size = desc.size.max(4);
        let usage = buffer_usage(desc);
        let handle = self.gpu.create(|handle| {
            let mut record = Record::new(op::CREATE_BUFFER, 32);
            record.u64(8, handle).u64(16, size).u32(24, usage);
            record
        });
        let shadow = desc.usage.contains(wgt::BufferUsages::MAP_WRITE).then(|| Mutex::new(vec![0; size as usize]));
        let mapping = desc.mapped_at_creation.then(|| Mapping {
            range: 0..desc.size,
            data: vec![0; desc.size as usize],
            write: true,
        });
        dispatch::DispatchBuffer::custom(DollyBuffer { object: object(&self.gpu, handle), size: desc.size, shadow, mapping: Mutex::new(mapping) })
    }

    fn create_texture(&self, desc: &crate::TextureDescriptor<'_>) -> dispatch::DispatchTexture {
        let format = self.texture_format(desc.format);
        let view_format = match desc.view_formats {
            [] => 0,
            [view] if *view == desc.format => 0,
            [view] => self.texture_format(*view),
            _ => {
                self.gpu.validation(String::from("gpu@0 textures take at most one other view format"));
                0
            },
        };
        let handle = self.gpu.create(|handle| {
            let mut record = Record::new(op::CREATE_TEXTURE, 48);
            record
                .u64(8, handle)
                .u32(16, desc.size.width)
                .u32(20, desc.size.height)
                .u32(24, desc.size.depth_or_array_layers)
                .u32(28, desc.mip_level_count)
                .u32(32, format)
                .u32(36, desc.usage.bits() & 31)
                .u32(40, convert::texture_dimension(desc.dimension))
                .bytes(44, &(desc.sample_count as u16).to_le_bytes())
                .bytes(46, &(view_format as u16).to_le_bytes());
            record
        });
        dispatch::DispatchTexture::custom(DollyTexture {
            info: Arc::new(TextureInfo {
                object: object(&self.gpu, handle),
                size: desc.size,
                format: desc.format,
                dimension: desc.dimension,
                surface: false,
            }),
        })
    }

    fn create_external_texture(
        &self,
        _desc: &crate::ExternalTextureDescriptor<'_>,
        _planes: &[&crate::TextureView],
    ) -> dispatch::DispatchExternalTexture {
        unimplemented!("gpu@0 has no external textures");
    }

    fn create_blas(
        &self,
        _desc: &crate::CreateBlasDescriptor<'_>,
        _sizes: crate::BlasGeometrySizeDescriptors,
    ) -> (Option<u64>, dispatch::DispatchBlas) {
        unimplemented!("gpu@0 has no ray tracing");
    }

    fn create_tlas(&self, _desc: &crate::CreateTlasDescriptor<'_>) -> dispatch::DispatchTlas {
        unimplemented!("gpu@0 has no ray tracing");
    }

    fn create_sampler(&self, desc: &crate::SamplerDescriptor<'_>) -> dispatch::DispatchSampler {
        let address = |mode| {
            convert::address(mode).unwrap_or_else(|| {
                self.gpu.validation(String::from("gpu@0 has no border colours"));
                0
            })
        };
        let mut record = Record::new(op::CREATE_SAMPLER, 56);
        record
            .u32(16, convert::filter(desc.min_filter))
            .u32(20, convert::filter(desc.mag_filter))
            .u32(24, convert::mipmap_filter(desc.mipmap_filter))
            .u32(28, address(desc.address_mode_u))
            .u32(32, address(desc.address_mode_v))
            .u32(36, address(desc.address_mode_w))
            .u32(40, desc.compare.map_or(0, convert::compare))
            .u32(44, desc.anisotropy_clamp.max(1) as u32)
            .f32(48, desc.lod_min_clamp)
            .f32(52, desc.lod_max_clamp);
        let handle = self.gpu.create(|handle| {
            record.u64(8, handle);
            record
        });
        dispatch::DispatchSampler::custom(DollySampler { object: object(&self.gpu, handle) })
    }

    fn create_query_set(&self, desc: &crate::QuerySetDescriptor<'_>) -> dispatch::DispatchQuerySet {
        if !matches!(desc.ty, wgt::QueryType::Timestamp) {
            self.gpu.validation(String::from("gpu@0 has timestamp queries only"));
        }
        let handle = self.gpu.create(|handle| {
            let mut record = Record::new(op::CREATE_QUERY_SET, 24);
            record.u64(8, handle).u32(16, desc.count);
            record
        });
        dispatch::DispatchQuerySet::custom(DollyQuerySet { object: object(&self.gpu, handle) })
    }

    fn create_command_encoder(&self, _desc: &crate::CommandEncoderDescriptor<'_>) -> dispatch::DispatchCommandEncoder {
        dispatch::DispatchCommandEncoder::custom(DollyCommandEncoder::new(self.gpu.clone()))
    }

    fn create_render_bundle_encoder(
        &self,
        _desc: &crate::RenderBundleEncoderDescriptor<'_>,
    ) -> dispatch::DispatchRenderBundleEncoder {
        dispatch::DispatchRenderBundleEncoder::custom(DollyRenderBundleEncoder::default())
    }

    fn set_device_lost_callback(&self, _device_lost_callback: dispatch::BoxDeviceLostCallback) {}

    fn on_uncaptured_error(&self, handler: Arc<dyn crate::UncapturedErrorHandler>) {
        self.gpu.errors.lock().unwrap().handler = Some(handler);
    }

    fn push_error_scope(&self, filter: crate::ErrorFilter) -> u32 {
        let mut errors = self.gpu.errors.lock().unwrap();
        let scopes = errors.scopes.entry(std::thread::current().id()).or_default();
        scopes.push((filter, None));
        scopes.len() as u32 - 1
    }

    fn pop_error_scope(&self, index: u32) -> Pin<Box<dyn dispatch::PopErrorScopeFuture>> {
        // What the scope's work did is known once the queue has finished it.
        self.gpu.with(Client::wait);
        let mut errors = self.gpu.errors.lock().unwrap();
        let scopes = errors.scopes.entry(std::thread::current().id()).or_default();
        assert_eq!(index as usize + 1, scopes.len(), "a thread's error scopes must be popped in reverse order");
        let (_, error) = scopes.pop().unwrap();
        Box::pin(ready(error))
    }

    unsafe fn start_graphics_debugger_capture(&self) {}

    unsafe fn stop_graphics_debugger_capture(&self) {}

    fn poll(&self, poll_type: wgt::PollType<u64>) -> Result<crate::PollStatus, crate::PollError> {
        let status = match poll_type {
            wgt::PollType::Wait { .. } => {
                self.gpu.with(Client::wait);
                crate::PollStatus::WaitSucceeded
            },
            wgt::PollType::Poll => {
                self.gpu.with(|client| client.send(false));
                crate::PollStatus::QueueEmpty
            },
        };
        self.gpu.fire_callbacks();
        Ok(status)
    }

    fn get_internal_counters(&self) -> crate::InternalCounters {
        crate::InternalCounters::default()
    }

    fn generate_allocator_report(&self) -> Option<crate::AllocatorReport> {
        None
    }

    fn destroy(&self) {}
}

#[derive(Debug)]
pub struct DollyQueue {
    pub(crate) gpu: Arc<Gpu>,
}

#[derive(Debug)]
pub struct DollyQueueWriteBuffer {
    data: Box<[u8]>,
}

impl dispatch::QueueInterface for DollyQueue {
    fn write_buffer(&self, buffer: &dispatch::DispatchBuffer, offset: crate::BufferAddress, data: &[u8]) {
        let buffer = buffer.as_custom::<DollyBuffer>().unwrap();
        self.gpu.with(|client| client.write(buffer.object.handle, offset, data));
    }

    fn create_staging_buffer(&self, size: crate::BufferSize) -> Option<dispatch::DispatchQueueWriteBuffer> {
        Some(dispatch::DispatchQueueWriteBuffer::custom(DollyQueueWriteBuffer { data: vec![0; size.get() as usize].into_boxed_slice() }))
    }

    fn validate_write_buffer(
        &self,
        buffer: &dispatch::DispatchBuffer,
        offset: wgt::BufferAddress,
        size: wgt::BufferSize,
    ) -> Option<()> {
        let buffer = buffer.as_custom::<DollyBuffer>().unwrap();
        let fits = offset % wgt::COPY_BUFFER_ALIGNMENT == 0
            && size.get() % wgt::COPY_BUFFER_ALIGNMENT == 0
            && offset + size.get() <= buffer.size;
        fits.then_some(())
    }

    fn write_staging_buffer(
        &self,
        buffer: &dispatch::DispatchBuffer,
        offset: crate::BufferAddress,
        staging_buffer: &dispatch::DispatchQueueWriteBuffer,
    ) {
        let staging = staging_buffer.as_custom::<DollyQueueWriteBuffer>().unwrap();
        dispatch::QueueInterface::write_buffer(self, buffer, offset, &staging.data);
    }

    fn write_texture(
        &self,
        texture: crate::TexelCopyTextureInfo<'_>,
        data: &[u8],
        data_layout: crate::TexelCopyBufferLayout,
        size: crate::Extent3d,
    ) {
        let info = &texture.texture.inner.as_custom::<DollyTexture>().unwrap().info;
        let format = info.format;
        if format.is_depth_stencil_format() {
            self.gpu.validation(String::from("gpu@0 uploads no depth or stencil texels"));
            return;
        }
        let (block_width, block_height) = format.block_dimensions();
        let Some(block_bytes) = format.block_copy_size(Some(texture.aspect)) else {
            self.gpu.validation(alloc::format!("gpu@0 cannot upload {format:?}"));
            return;
        };
        let blocks_wide = size.width.div_ceil(block_width);
        let block_rows = size.height.div_ceil(block_height);
        let row_bytes = (blocks_wide * block_bytes) as usize;
        let stride = data_layout.bytes_per_row.map_or(row_bytes, |bytes| bytes as usize);
        let rows_per_image = data_layout.rows_per_image.unwrap_or(block_rows) as usize;
        // Rows per record, so a record fits a packet.
        let rows_per_record = ((RECORD_BYTES - 48) / row_bytes.max(1)).max(1).min(block_rows as usize);
        let layers = if matches!(info.dimension, wgt::TextureDimension::D3) || size.depth_or_array_layers > 1 {
            size.depth_or_array_layers
        } else {
            1
        };
        self.gpu.with(|client| {
            for layer in 0..layers {
                let image = data_layout.offset as usize + layer as usize * rows_per_image * stride;
                let mut row = 0;
                while row < block_rows as usize {
                    let rows = rows_per_record.min(block_rows as usize - row);
                    let bytes = rows * row_bytes;
                    let mut record = Record::new(op::WRITE_TEXTURE, 48 + bytes);
                    record
                        .u64(8, info.object.handle)
                        .u32(16, texture.mip_level)
                        .u32(20, texture.origin.z + layer)
                        .u32(24, texture.origin.x)
                        .u32(28, texture.origin.y + (row as u32) * block_height)
                        .u32(32, blocks_wide * block_width)
                        .u32(36, rows as u32 * block_height)
                        .u32(40, bytes as u32);
                    for index in 0..rows {
                        let from = image + (row + index) * stride;
                        record.bytes(48 + index * row_bytes, &data[from..from + row_bytes]);
                    }
                    client.push(&record, false);
                    row += rows;
                }
            }
        });
    }

    fn submit(&self, command_buffers: &mut dyn Iterator<Item = dispatch::DispatchCommandBuffer>) -> u64 {
        let command_buffers: Vec<_> = command_buffers.collect();
        self.gpu.with(|client| {
            let mut encoded = false;
            for buffer in &command_buffers {
                let buffer = buffer.as_custom::<DollyCommandBuffer>().unwrap();
                for record in &buffer.records {
                    client.push(record, true);
                    encoded = true;
                }
            }
            if encoded {
                client.push(&Record::new(op::SUBMIT, 8), true);
                client.send(false);
            }
        });
        // The objects the command buffers kept are released after their work was submitted.
        drop(command_buffers);
        self.gpu.fire_callbacks();
        0
    }

    fn get_timestamp_period(&self) -> f32 {
        1.0
    }

    fn on_submitted_work_done(&self, callback: dispatch::BoxSubmittedWorkDoneCallback) {
        self.gpu.with(Client::wait);
        self.gpu.callbacks.lock().unwrap().push(callback);
    }

    fn compact_blas(&self, _blas: &dispatch::DispatchBlas) -> (Option<u64>, dispatch::DispatchBlas) {
        unimplemented!("gpu@0 has no ray tracing")
    }

    /// SUBMIT presented the page's surface its work drew on. An X window's frame is copied out of
    /// its texture, read back and put in the window.
    fn present(&self, detail: &dispatch::DispatchSurfaceOutputDetail) {
        let Some(frame) = detail.as_custom::<DollySurfaceOutputDetail>().and_then(|detail| detail.x11.as_ref()) else {
            return;
        };
        let size = frame.texture.size;
        let pixels = frame.texture.object.gpu.with(|client| {
            let mut copy = Record::new(op::COPY_TEXTURE_TO_BUFFER, 72);
            copy.u64(8, frame.buffer.handle)
                .u32(24, frame.row_bytes)
                .u32(28, size.height)
                .u64(32, frame.texture.object.handle)
                .u32(60, size.width)
                .u32(64, size.height)
                .u32(68, 1);
            client.push(&copy, false);
            client.push(&Record::new(op::SUBMIT, 8), false);
            client.send(false);
            client.read(frame.buffer.handle, 0..u64::from(frame.row_bytes) * u64::from(size.height))
        });
        if let Some(pixels) = pixels {
            // SAFETY: the window is open while its surface is; pixels holds height rows of row_bytes.
            unsafe {
                ffi::x11_window_present(frame.window as *mut _, pixels.as_ptr(), size.width, size.height, frame.row_bytes as usize, 0)
            };
        }
    }
}

impl dispatch::ShaderModuleInterface for DollyShaderModule {
    fn get_compilation_info(&self) -> Pin<Box<dyn dispatch::ShaderCompilationInfoFuture>> {
        // WebGPU's messages reach the page's console, and its errors the next WAIT.
        Box::pin(ready(crate::CompilationInfo { messages: Vec::new() }))
    }
}

impl dispatch::BindGroupLayoutInterface for DollyBindGroupLayout {}
impl dispatch::BindGroupInterface for DollyBindGroup {}
impl dispatch::TextureViewInterface for DollyTextureView {}
impl dispatch::SamplerInterface for DollySampler {}
impl dispatch::PipelineLayoutInterface for DollyPipelineLayout {}

impl dispatch::RenderPipelineInterface for DollyRenderPipeline {
    fn get_bind_group_layout(&self, index: u32) -> dispatch::DispatchBindGroupLayout {
        group_layout(&self.layout, index)
    }
}

impl dispatch::ComputePipelineInterface for DollyComputePipeline {
    fn get_bind_group_layout(&self, index: u32) -> dispatch::DispatchBindGroupLayout {
        group_layout(&self.layout, index)
    }
}

impl dispatch::PipelineCacheInterface for DollyPipelineCache {
    fn get_data(&self) -> Option<Vec<u8>> {
        None
    }
}

impl dispatch::QuerySetInterface for DollyQuerySet {
    fn destroy(&self) {}
}

impl dispatch::ExternalTextureInterface for DollyExternalTexture {
    fn destroy(&self) {}
}

impl dispatch::BlasInterface for DollyBlas {
    fn prepare_compact_async(&self, _callback: dispatch::BlasCompactCallback) {}
    fn ready_for_compaction(&self) -> bool {
        false
    }
}

impl dispatch::TlasInterface for DollyTlas {}

impl dispatch::BufferInterface for DollyBuffer {
    fn map_async(&self, mode: crate::MapMode, range: Range<crate::BufferAddress>, callback: BufferMapCallback) {
        let data = match mode {
            crate::MapMode::Read => self.object.gpu.with(|client| client.read(self.object.handle, range.clone())),
            crate::MapMode::Write => {
                let shadow = self.shadow.as_ref().map(|shadow| shadow.lock().unwrap());
                shadow.map(|shadow| shadow[range.start as usize..range.end as usize].to_vec())
            },
        };
        let result = match data {
            Some(data) => {
                let write = matches!(mode, crate::MapMode::Write);
                *self.mapping.lock().unwrap() = Some(Mapping { range, data, write });
                Ok(())
            },
            None => Err(crate::BufferAsyncError),
        };
        // As wgpu-core does, the callback runs when the device is next polled or submitted to.
        self.object.gpu.callbacks.lock().unwrap().push(Box::new(move || callback(result)));
    }

    fn get_mapped_range(
        &self,
        sub_range: Range<crate::BufferAddress>,
    ) -> Result<dispatch::DispatchBufferMappedRange, crate::MapRangeError> {
        let mut mapping = self.mapping.lock().unwrap();
        let Some(mapping) = mapping.as_mut() else {
            return Err(crate::MapRangeError(String::from("the buffer is not mapped")));
        };
        if sub_range.start < mapping.range.start || sub_range.end > mapping.range.end {
            return Err(crate::MapRangeError(String::from("the range is outside the mapping")));
        }
        let start = (sub_range.start - mapping.range.start) as usize;
        let length = (sub_range.end - sub_range.start) as usize;
        // The mapping's bytes stay where they are until it is unmapped, which wgpu allows only
        // once its views are gone.
        let ptr = core::ptr::NonNull::new(mapping.data[start..].as_mut_ptr()).unwrap();
        Ok(dispatch::DispatchBufferMappedRange::custom(DollyBufferMappedRange { ptr, length }))
    }

    fn unmap(&self) {
        let Some(mapping) = self.mapping.lock().unwrap().take() else {
            return;
        };
        if !mapping.write {
            return;
        }
        if let Some(shadow) = &self.shadow {
            shadow.lock().unwrap()[mapping.range.start as usize..mapping.range.end as usize]
                .copy_from_slice(&mapping.data);
        }
        let length = mapping.data.len() & !3;
        self.object.gpu.with(|client| client.write(self.object.handle, mapping.range.start, &mapping.data[..length]));
    }

    fn destroy(&self) {}
}

#[derive(Debug)]
pub struct DollyBufferMappedRange {
    ptr: core::ptr::NonNull<u8>,
    length: usize,
}

// SAFETY: the bytes belong to the buffer's mapping, which outlives its views.
unsafe impl Send for DollyBufferMappedRange {}
// SAFETY: as above; a view is used by one thread at a time.
unsafe impl Sync for DollyBufferMappedRange {}

impl dispatch::BufferMappedRangeInterface for DollyBufferMappedRange {
    fn len(&self) -> usize {
        self.length
    }

    unsafe fn read_slice(&self) -> &[u8] {
        // SAFETY: see DollyBuffer::get_mapped_range.
        unsafe { core::slice::from_raw_parts(self.ptr.as_ptr(), self.length) }
    }

    unsafe fn write_slice(&mut self) -> WriteOnly<'_, [u8]> {
        // SAFETY: see DollyBuffer::get_mapped_range.
        unsafe { WriteOnly::new(core::ptr::NonNull::slice_from_raw_parts(self.ptr, self.length)) }
    }
}

impl dispatch::QueueWriteBufferInterface for DollyQueueWriteBuffer {
    fn len(&self) -> usize {
        self.data.len()
    }

    unsafe fn write_slice(&mut self) -> WriteOnly<'_, [u8]> {
        WriteOnly::from_mut(&mut *self.data)
    }
}

impl dispatch::TextureInterface for DollyTexture {
    fn create_view(&self, desc: &crate::TextureViewDescriptor<'_>) -> dispatch::DispatchTextureView {
        let info = &self.info;
        let gpu = &info.object.gpu;
        let width = (info.size.width >> desc.base_mip_level).max(1);
        let height = (info.size.height >> desc.base_mip_level).max(1);
        if info.surface {
            return dispatch::DispatchTextureView::custom(DollyTextureView { object: object(gpu, 0), texture: info.clone(), width, height });
        }
        let format = match desc.format {
            Some(format) if format != info.format => convert::texture_format(format).unwrap_or(0),
            _ => 0,
        };
        let aspect = convert::aspect(desc.aspect).unwrap_or_else(|| {
            gpu.validation(alloc::format!("gpu@0 has no aspect {:?}", desc.aspect));
            0
        });
        let handle = gpu.create(|handle| {
            let mut record = Record::new(op::CREATE_VIEW, 56);
            record
                .u64(8, handle)
                .u64(16, info.object.handle)
                .u32(24, format)
                .u32(28, desc.dimension.map_or(0, convert::view_dimension))
                .u32(32, aspect)
                .u32(36, desc.base_mip_level)
                .u32(40, desc.mip_level_count.unwrap_or(0))
                .u32(44, desc.base_array_layer)
                .u32(48, desc.array_layer_count.unwrap_or(0))
                .u32(52, 0x03020100);
            record
        });
        let object = Arc::new(Object { gpu: gpu.clone(), handle, parent: Some(info.clone()) });
        dispatch::DispatchTextureView::custom(DollyTextureView { object, texture: info.clone(), width, height })
    }

    fn destroy(&self) {}
}

#[derive(Debug)]
pub struct DollySurface {
    config: Mutex<Option<(Arc<Gpu>, wgt::Extent3d, wgt::TextureFormat)>>,
    /// The X window frames go to (x11-window.h), or zero for the page's surface, and the texture
    /// of its frames with the buffer they are read back through.
    x11: usize,
    frame: Mutex<Option<Arc<X11Frame>>>,
}

/// An X window's frame: drawn into a texture of its own and read back through a buffer, rows of
/// row_bytes, blue first.
#[derive(Debug)]
struct X11Frame {
    window: usize,
    texture: Arc<TextureInfo>,
    buffer: Arc<Object>,
    row_bytes: u32,
}

#[derive(Debug)]
pub struct DollySurfaceOutputDetail {
    x11: Option<Arc<X11Frame>>,
}

impl dispatch::SurfaceInterface for DollySurface {
    fn get_capabilities(&self, adapter: &dispatch::DispatchAdapter) -> wgt::SurfaceCapabilities {
        let format = match adapter.as_custom::<DollyAdapter>() {
            Some(adapter) if self.x11 == 0 => adapter.surface_format,
            _ => wgt::TextureFormat::Bgra8Unorm,
        };
        wgt::SurfaceCapabilities {
            format_capabilities: vec![wgt::SurfaceFormatCapabilities { format, color_spaces: wgt::SurfaceColorSpaces::SRGB }],
            formats: vec![format],
            present_modes: vec![wgt::PresentMode::Fifo],
            alpha_modes: vec![wgt::CompositeAlphaMode::Opaque],
            usages: wgt::TextureUsages::RENDER_ATTACHMENT,
        }
    }

    fn configure(&self, device: &dispatch::DispatchDevice, config: &crate::SurfaceConfiguration) {
        let device = device.as_custom::<DollyDevice>().unwrap();
        let format = if self.x11 == 0 { device.gpu.surface_format } else { wgt::TextureFormat::Bgra8Unorm };
        if config.format != format {
            device.gpu.validation(alloc::format!(
                "gpu@0's surface is {:?}, not {:?}",
                format, config.format
            ));
        }
        let size = wgt::Extent3d { width: config.width, height: config.height, depth_or_array_layers: 1 };
        *self.config.lock().unwrap() = Some((device.gpu.clone(), size, config.format));
    }

    fn get_current_texture(
        &self,
    ) -> (Option<dispatch::DispatchTexture>, crate::SurfaceStatus, dispatch::DispatchSurfaceOutputDetail) {
        let config = self.config.lock().unwrap();
        let (gpu, size, format) = config.as_ref().expect("This surface has not been configured yet.");
        if self.x11 != 0 {
            let frame = self.x11_frame(gpu, *size);
            let texture = DollyTexture { info: frame.texture.clone() };
            return (
                Some(dispatch::DispatchTexture::custom(texture)),
                crate::SurfaceStatus::Good,
                dispatch::DispatchSurfaceOutputDetail::custom(DollySurfaceOutputDetail { x11: Some(frame) }),
            );
        }
        let texture = DollyTexture {
            info: Arc::new(TextureInfo {
                object: object(gpu, 0),
                size: *size,
                format: *format,
                dimension: wgt::TextureDimension::D2,
                surface: true,
            }),
        };
        (Some(dispatch::DispatchTexture::custom(texture)), crate::SurfaceStatus::Good, dispatch::DispatchSurfaceOutputDetail::custom(DollySurfaceOutputDetail { x11: None }))
    }
}

impl DollySurface {
    /// The X window's frame of this size, made again when the size changes.
    fn x11_frame(&self, gpu: &Arc<Gpu>, size: wgt::Extent3d) -> Arc<X11Frame> {
        let mut frame = self.frame.lock().unwrap();
        if let Some(frame) = frame.as_ref().filter(|frame| frame.texture.size == size) {
            return frame.clone();
        }
        let usage = wgt::TextureUsages::RENDER_ATTACHMENT | wgt::TextureUsages::COPY_SRC;
        let texture = gpu.create(|handle| {
            let mut record = Record::new(op::CREATE_TEXTURE, 48);
            record
                .u64(8, handle)
                .u32(16, size.width)
                .u32(20, size.height)
                .u32(24, 1)
                .u32(28, 1)
                .u32(32, convert::texture_format(wgt::TextureFormat::Bgra8Unorm).unwrap())
                .u32(36, usage.bits())
                .u32(40, convert::texture_dimension(wgt::TextureDimension::D2))
                .bytes(44, &1u16.to_le_bytes());
            record
        });
        let row_bytes = (size.width * 4).next_multiple_of(256);
        let buffer = gpu.create(|handle| {
            let mut record = Record::new(op::CREATE_BUFFER, 32);
            let usage = wgt::BufferUsages::MAP_READ | wgt::BufferUsages::COPY_DST;
            record.u64(8, handle).u64(16, u64::from(row_bytes) * u64::from(size.height)).u32(24, usage.bits());
            record
        });
        let created = Arc::new(X11Frame {
            window: self.x11,
            texture: Arc::new(TextureInfo {
                object: object(gpu, texture),
                size,
                format: wgt::TextureFormat::Bgra8Unorm,
                dimension: wgt::TextureDimension::D2,
                surface: false,
            }),
            buffer: object(gpu, buffer),
            row_bytes,
        });
        *frame = Some(created.clone());
        created
    }
}

impl dispatch::SurfaceOutputDetailInterface for DollySurfaceOutputDetail {
    fn texture_discard(&self) {}
    fn texture_release(&self) {}
}
