//! `<dolly/upload.h>` and `<dolly/download.h>`, whose clients `cc` links into every program.
use std::ffi::{CString, c_char, c_int};
use std::io;
use std::os::unix::ffi::OsStrExt;
use std::path::Path;

#[allow(unsafe_code)]
unsafe extern "C" {
    fn dolly_upload_file(path: *const c_char) -> c_int;
    fn dolly_download_file(path: *const c_char) -> c_int;
}

/// Emscripten's libc numbers errno as WASI does.
const ECANCELED: i32 = 11;

/// Writes a file the user picks in the browser to `destination`, a new path; `Ok(false)` when
/// they cancel. The browser keeps the file's name and path.
pub fn upload(destination: &Path) -> io::Result<bool> {
    let destination = CString::new(destination.as_os_str().as_bytes())?;
    #[allow(unsafe_code)]
    let status = unsafe { dolly_upload_file(destination.as_ptr()) };
    match status {
        0 => Ok(true),
        status if status == -ECANCELED => Ok(false),
        status => Err(io::Error::from_raw_os_error(-status)),
    }
}

/// Offers the regular file at `path`, at most 1 GiB, for the browser to save: the page shows a
/// Save button, and nothing reaches its downloads until the user clicks it.
pub fn offer(path: &Path) -> io::Result<()> {
    let path = CString::new(path.as_os_str().as_bytes())?;
    #[allow(unsafe_code)]
    let status = unsafe { dolly_download_file(path.as_ptr()) };
    if status < 0 { Err(io::Error::from_raw_os_error(-status)) } else { Ok(()) }
}
