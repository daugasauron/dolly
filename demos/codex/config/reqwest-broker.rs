//! HTTP through Dolly's process ABI. The browser owns connections and redirects.
use super::body::{boxed, ResponseBody};
use super::Body;
use bytes::Bytes;
use futures_util::{stream, TryStreamExt};
use http::{HeaderMap, HeaderName, HeaderValue, Method, StatusCode};
use std::ffi::{c_char, c_int, c_void, CString};
use std::io;
use std::time::Duration;
use url::Url;

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
        body: *const c_void, size: usize, flags: u32, sequence: *mut u32) -> c_int;
    fn dolly_http_poll(sequence: u32, chunk: *mut Chunk, data: *mut c_void, capacity: usize) -> c_int;
    fn dolly_http_cancel(sequence: u32) -> c_int;
}

struct Transfer {
    sequence: u32,
    done: bool,
    buffer: Vec<u8>,
}

impl Drop for Transfer {
    fn drop(&mut self) {
        unsafe { dolly_http_cancel(self.sequence); }
    }
}

impl Transfer {
    async fn next(&mut self) -> io::Result<Option<(Chunk, Bytes)>> {
        if self.done { return Ok(None); }
        loop {
            let mut chunk = Chunk::default();
            let result = unsafe {
                dolly_http_poll(self.sequence, &mut chunk, self.buffer.as_mut_ptr().cast(), self.buffer.len())
            };
            if result < 0 { return Err(io::Error::from_raw_os_error(-result)); }
            if result == 0 {
                tokio::time::sleep(Duration::from_millis(2)).await;
                continue;
            }
            self.done = chunk.eof != 0;
            if chunk.error != 0 { return Err(io::Error::from_raw_os_error(chunk.error as i32)); }
            let data = self.buffer.get(..chunk.length)
                .ok_or_else(|| io::Error::other("invalid Dolly HTTP record length"))?;
            let data = Bytes::copy_from_slice(data);
            return Ok(Some((chunk, data)));
        }
    }
}

pub(super) async fn send(
    method: Method,
    url: Url,
    mut headers: HeaderMap,
    body: Body,
    #[cfg(feature = "cookies")] cookies: Option<std::sync::Arc<dyn crate::cookie::CookieStore>>,
) -> Result<http::Response<ResponseBody>, crate::Error> {
    let mut url = url;
    url.set_fragment(None);
    #[cfg(feature = "cookies")]
    if !headers.contains_key(http::header::COOKIE) {
        if let Some(value) = cookies.as_ref().and_then(|store| store.cookies(&url)) {
            headers.insert(http::header::COOKIE, value);
        }
    }
    let body = body.as_bytes().ok_or_else(|| crate::error::request(
        io::Error::new(io::ErrorKind::Unsupported, "Dolly HTTP streaming uploads are unavailable")))?;
    let method = CString::new(method.as_str()).map_err(crate::error::builder)?;
    let address = CString::new(url.as_str()).map_err(crate::error::builder)?;
    let mut lines = Vec::new();
    for (name, value) in &headers {
        lines.extend_from_slice(name.as_str().as_bytes());
        lines.extend_from_slice(b": ");
        lines.extend_from_slice(value.as_bytes());
        lines.extend_from_slice(b"\r\n");
    }
    let lines = CString::new(lines).map_err(crate::error::builder)?;
    let mut sequence = 0;
    loop {
        let result = unsafe {
            dolly_http_start(method.as_ptr(), address.as_ptr(), lines.as_ptr(),
                body.as_ptr().cast(), body.len(), 0, &mut sequence)
        };
        if result >= 0 { break; }
        let error = io::Error::from_raw_os_error(-result);
        if error.kind() != io::ErrorKind::ResourceBusy {
            return Err(crate::error::request(error));
        }
        tokio::time::sleep(Duration::from_millis(2)).await;
    }
    let mut transfer = Transfer { sequence, done: false, buffer: vec![0; 65536] };
    let mut headers = HeaderMap::new();
    let (status, first) = loop {
        let (chunk, data) = transfer.next().await.map_err(crate::error::request)?
            .ok_or_else(|| crate::error::request(io::Error::other("missing Dolly HTTP status")))?;
        match chunk.kind {
            1 => {
                if data.as_ref() != url.as_str().as_bytes() {
                    return Err(crate::error::request(io::Error::other("unexpected Dolly HTTP redirect")));
                }
            }
            2 => {
                if data.as_ref() == b"\r\n" {
                    break (StatusCode::from_u16(chunk.status as u16).map_err(crate::error::decode)?, None);
                }
                if data.starts_with(b"HTTP/1.1 ") { continue; }
                let colon = data.iter().position(|&byte| byte == b':')
                    .ok_or_else(|| crate::error::decode(io::Error::other("invalid Dolly HTTP header")))?;
                let name = HeaderName::from_bytes(&data[..colon]).map_err(crate::error::decode)?;
                let value = data[colon + 1..].trim_ascii();
                headers.append(name, HeaderValue::from_bytes(value).map_err(crate::error::decode)?);
            }
            3 => break (StatusCode::from_u16(chunk.status as u16).map_err(crate::error::decode)?, Some(data)),
            _ => return Err(crate::error::decode(io::Error::other("invalid Dolly HTTP record kind"))),
        }
    };
    #[cfg(feature = "cookies")]
    if let Some(store) = cookies {
        store.set_cookies(&mut crate::cookie::extract_response_cookie_headers(&headers), &url);
    }
    let bytes = stream::try_unfold((transfer, first), |(mut transfer, first)| async move {
        if let Some(data) = first {
            return Ok(Some((data, (transfer, None))));
        }
        match transfer.next().await? {
            Some((chunk, data)) if chunk.kind == 3 => Ok(Some((data, (transfer, None)))),
            Some(_) => Err(io::Error::other("unexpected Dolly HTTP body record")),
            None => Ok(None),
        }
    });
    let mut response = http::Response::new(boxed(http_body_util::StreamBody::new(bytes.map_ok(hyper::body::Frame::data))));
    *response.status_mut() = status;
    *response.headers_mut() = headers;
    Ok(response)
}
