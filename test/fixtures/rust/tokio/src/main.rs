use std::os::unix::process::ExitStatusExt;
use std::time::{Duration, Instant};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
mod http;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let executable = std::env::args().next().unwrap();
    if let Some(mode) = std::env::args().nth(1) {
        std::thread::sleep(Duration::from_millis(if mode == "long" { 10_000 } else { 80 }));
        if mode == "child" {
            assert_eq!(std::env::var("TOKIO_CHILD")?, "inherited");
            assert_eq!(std::env::current_dir()?.to_str(), Some("/tmp/tokio-files"));
            println!("tokio-child-out");
            eprintln!("tokio-child-err");
            std::process::exit(7);
        }
        std::process::exit(3);
    }
    let unavailable = std::thread::Builder::new().spawn(|| {}).unwrap_err();
    println!("TOKIO-THREADS-UNAVAILABLE {:?}", unavailable.raw_os_error());
    assert_eq!(zlib_rs::adler32(1, b"Wikipedia"), 0x11e60398);
    let input = b"Wikipedia".repeat(2000);
    let mut compressed = vec![0; input.len()];
    let mut deflate = zlib_rs::Deflate::new(6, true, 15);
    assert_eq!(deflate.compress(&input, &mut compressed, zlib_rs::DeflateFlush::Finish).unwrap(),
        zlib_rs::Status::StreamEnd);
    let mut output = vec![0; input.len()];
    let mut inflate = zlib_rs::Inflate::new(true, 15);
    assert_eq!(inflate.decompress(&compressed[..deflate.total_out() as usize], &mut output,
        zlib_rs::InflateFlush::Finish).unwrap(), zlib_rs::Status::StreamEnd);
    assert_eq!(output, input);
    println!("ZLIB-SCALAR-ROUNDTRIP-OK");
    let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build()?;
    runtime.block_on(async {
        let started = Instant::now();
        let (sender, receiver) = tokio::sync::oneshot::channel();
        let task = tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(30)).await;
            sender.send(42).unwrap();
        });
        assert_eq!(receiver.await?, 42);
        task.await?;
        assert!(started.elapsed() >= Duration::from_millis(20));
        let cancelled = tokio::spawn(std::future::pending::<()>());
        cancelled.abort();
        assert!(cancelled.await.unwrap_err().is_cancelled());
        println!("TOKIO-TASKS-TIMERS-OK");

        tokio::fs::create_dir_all("/tmp/tokio-files").await?;
        let mut file = tokio::fs::File::create("/tmp/tokio-files/input").await?;
        file.write_all(b"shared wasm files").await?;
        file.flush().await?;
        drop(file);
        let mut text = String::new();
        tokio::fs::File::open("/tmp/tokio-files/input").await?.read_to_string(&mut text).await?;
        assert_eq!(text, "shared wasm files");
        tokio::fs::rename("/tmp/tokio-files/input", "/tmp/tokio-files/output").await?;
        assert_eq!(std::fs::read("/tmp/tokio-files/output")?, b"shared wasm files");
        assert!(tokio::fs::read_dir("/tmp/tokio-files").await?.next_entry().await?.is_some());
        println!("TOKIO-FILES-OK");

        let output = tokio::time::timeout(Duration::from_secs(2),
            tokio::process::Command::new(&executable).arg("child")
                .env("TOKIO_CHILD", "inherited").current_dir("/tmp/tokio-files")
                .kill_on_drop(true).output()).await??;
        assert_eq!(output.status.code(), Some(7));
        assert_eq!(output.stdout, b"tokio-child-out\n");
        assert_eq!(output.stderr, b"tokio-child-err\n");
        let started = Instant::now();
        let status = tokio::time::timeout(Duration::from_secs(2),
            tokio::process::Command::new(&executable).arg("quiet").status()).await??;
        assert_eq!(status.code(), Some(3));
        assert!(started.elapsed() < Duration::from_secs(1));
        println!("TOKIO-PROCESSES-OK");

        let mut child = tokio::process::Command::new(&executable).arg("long").kill_on_drop(true).spawn()?;
        assert!(tokio::time::timeout(Duration::from_millis(30), child.wait()).await.is_err());
        tokio::time::timeout(Duration::from_secs(2), child.kill()).await??;
        assert_eq!(child.try_wait()?.unwrap().signal(), Some(9));
        let child = tokio::process::Command::new(&executable).arg("long").kill_on_drop(true).spawn()?;
        let pid = child.id().unwrap();
        drop(child);
        tokio::time::sleep(Duration::from_millis(100)).await;
        assert_eq!(unsafe { libc::waitpid(pid as i32, std::ptr::null_mut(), libc::WNOHANG) }, -1);
        assert_eq!(std::io::Error::last_os_error().raw_os_error(), Some(libc::ECHILD));
        println!("TOKIO-CANCELLATION-OK");

        let mut signal = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::user_defined1())?;
        assert_eq!(unsafe { libc::kill(libc::getpid(), libc::SIGUSR1) }, 0);
        tokio::time::timeout(Duration::from_secs(1), signal.recv()).await?.unwrap();
        println!("TOKIO-SIGNALS-OK");

        let error = tokio::net::TcpStream::connect("127.0.0.1:9").await.unwrap_err();
        assert_eq!(error.raw_os_error(), Some(libc::ENOSYS));
        println!("TOKIO-SOCKETS-DENIED-OK");

        let origin = std::env::var("TOKIO_HTTP_ORIGIN")?;
        let mut received = Vec::new();
        let mut arrivals = Vec::new();
        let ticks = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let counter = ticks.clone();
        let ticker = tokio::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_millis(10)).await;
                counter.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            }
        });
        tokio::time::timeout(Duration::from_secs(3), http::get(&format!("{origin}/stream"), |bytes| {
            if !bytes.is_empty() { arrivals.push(Instant::now()); }
            received.extend_from_slice(bytes);
        })).await??;
        ticker.abort();
        assert!(ticker.await.unwrap_err().is_cancelled());
        assert_eq!(received, b"first\nsecond\n");
        assert!(arrivals.last().unwrap().duration_since(arrivals[0]) >= Duration::from_millis(100));
        assert!(ticks.load(std::sync::atomic::Ordering::Relaxed) >= 5);
        assert!(tokio::time::timeout(Duration::from_millis(100),
            http::get(&format!("{origin}/slow"), |_| {})).await.is_err());
        let error = http::get(&format!("{origin}/denied"), |_| {}).await.unwrap_err();
        assert_eq!(error.raw_os_error(), Some(libc::EACCES));
        // A new request also proves cancellation released the broker slot.
        http::get(&format!("{origin}/stream"), |_| {}).await?;
        println!("TOKIO-HTTP-STREAM-CANCEL-POLICY-OK");
        Ok::<(), Box<dyn std::error::Error>>(())
    })?;
    println!("TOKIO-DOLLY-PASSED");
    Ok(())
}
