//! Files from and to the browser page Dolly runs in, as PhotoCraft's web build has them: File ›
//! Open takes a file the user picks in the browser, and each file a save writes is offered for
//! the browser to save.
use photocraft_ui_egui::FileDialogAnswer;
use std::path::Path;
use std::sync::atomic::{AtomicU32, Ordering};

/// The Open dialog's answer: the picked file's contents, `None` when the user cancels. The page
/// keeps the file's name, so the document is named for what its bytes are.
pub fn open(multiple: bool, extensions: Option<&[String]>) -> Option<FileDialogAnswer> {
    static UPLOADS: AtomicU32 = AtomicU32::new(0);
    let path = std::env::temp_dir().join(format!("photocraft-upload-{}-{}", std::process::id(), UPLOADS.fetch_add(1, Ordering::Relaxed)));
    let uploaded = photocraft_dolly_page::upload(&path).and_then(|picked| picked.then(|| std::fs::read(&path)).transpose());
    let _ = std::fs::remove_file(&path);
    let bytes = match uploaded {
        Ok(bytes) => bytes?,
        Err(e) => return Some(FileDialogAnswer::Unavailable(format!("upload: {e}"))),
    };
    // A command's own files (curves, actions, brushes) are known by the extension it asks for.
    let extension = photocraft_codecs::detect(&bytes).map(|format| format.extensions()[0]).or(extensions.and_then(|e| e.first()).map(String::as_str));
    let name = extension.map_or_else(|| "upload".to_string(), |extension| format!("upload.{extension}"));
    Some(if multiple { FileDialogAnswer::ContentsMany(vec![(name, bytes)]) } else { FileDialogAnswer::Contents(name, bytes) })
}

/// Offers the file a save wrote at `path`. The save is done whether or not it can be offered
/// (four offers already wait, or it is over 1 GiB).
pub fn offer(path: &str) {
    if let Err(e) = photocraft_dolly_page::offer(Path::new(path)) {
        log::warn!("couldn't offer {path} to the browser: {e}");
    }
}
