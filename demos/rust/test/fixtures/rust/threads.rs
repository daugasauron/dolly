use std::sync::{mpsc, Arc, Barrier, Mutex};
use std::thread;

fn main() {
    let workers = 4;
    // Every worker waits until all are running, so serial execution would hang.
    let barrier = Arc::new(Barrier::new(workers));
    let total = Arc::new(Mutex::new(0u64));
    let (sender, receiver) = mpsc::channel();
    let handles: Vec<_> = (0..workers as u64).map(|worker| {
        let (barrier, total, sender) = (barrier.clone(), total.clone(), sender.clone());
        thread::Builder::new().stack_size(256 * 1024).spawn(move || {
            barrier.wait();
            let sum: u64 = (worker * 1000..(worker + 1) * 1000).sum();
            *total.lock().unwrap() += sum;
            sender.send((worker, thread::current().id())).unwrap();
            worker
        }).unwrap()
    }).collect();
    drop(sender);
    let ids: Vec<_> = receiver.iter().collect();
    let joined: u64 = handles.into_iter().map(|handle| handle.join().unwrap()).sum();
    assert_eq!((ids.len(), joined, *total.lock().unwrap()), (workers, 6, (0..4000).sum()));
    assert!(ids.iter().all(|(_, id)| *id != thread::current().id()));
    let scoped = thread::scope(|scope| scope.spawn(|| thread::available_parallelism().unwrap().get()).join().unwrap());
    println!("RUST-THREADS-OK {scoped}");
}
