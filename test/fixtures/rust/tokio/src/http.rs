use std::ffi::{c_char, c_int, c_void, CString};
use std::io;
use std::time::Duration;

#[repr(C)]
#[derive(Default)]
struct Chunk {
    status: u32,
    kind: u32,
    error: u32,
    eof: u32,
    length: usize,
}

unsafe extern "C" {
    fn dolly_http_start(method: *const c_char, url: *const c_char, headers: *const c_char,
        body: *const c_void, body_size: usize, flags: u32, sequence: *mut u32) -> c_int;
    fn dolly_http_poll(sequence: u32, chunk: *mut Chunk, data: *mut c_void, capacity: usize) -> c_int;
    fn dolly_http_cancel(sequence: u32) -> c_int;
}

struct Request(u32);

impl Drop for Request {
    fn drop(&mut self) {
        unsafe { dolly_http_cancel(self.0); }
    }
}

pub async fn get(url: &str, mut body: impl FnMut(&[u8])) -> io::Result<()> {
    let url = CString::new(url)?;
    let mut sequence = 0;
    let result = unsafe {
        dolly_http_start(c"GET".as_ptr(), url.as_ptr(), c"".as_ptr(),
            std::ptr::null(), 0, 0, &mut sequence)
    };
    if result < 0 { return Err(io::Error::from_raw_os_error(-result)); }
    let request = Request(sequence);
    let mut buffer = vec![0u8; 65536];
    loop {
        let mut chunk = Chunk::default();
        let result = unsafe {
            dolly_http_poll(request.0, &mut chunk, buffer.as_mut_ptr().cast(), buffer.len())
        };
        if result < 0 { return Err(io::Error::from_raw_os_error(-result)); }
        if result == 0 {
            tokio::time::sleep(Duration::from_millis(2)).await;
            continue;
        }
        if chunk.error != 0 { return Err(io::Error::from_raw_os_error(chunk.error as i32)); }
        assert!(chunk.length <= buffer.len());
        if chunk.kind == 3 {
            assert_eq!(chunk.status, 200);
            body(&buffer[..chunk.length]);
        }
        if chunk.eof != 0 { return Ok(()); }
    }
}
