(module
  ;; Local stream sockets between Dolly processes, called through
  ;; dolly_process_0.call and served by the kernel. Both ends are processes of
  ;; this kernel and the bytes stay in its memory, as a pipe's do: there is no
  ;; network family, no datagram, no descriptor passing, and no browser import.
  ;; A socket is a descriptor of the process contract: it is read, written,
  ;; polled, duplicated, inherited and closed like any other. Reading returns
  ;; zero once the peer closed or shut down writing; writing then fails EPIPE.
  ;;
  ;; Every request starts with a dolly_socket_request (sockets.h); `argument`
  ;; is zero unless named below, and so is `descriptor` for CREATE and PAIR.
  ;; CREATE: argument CLOEXEC|NONBLOCK -> dolly_socket_descriptors, `first`
  ;;   an unconnected socket. PAIR: the same -> two connected sockets. ENFILE
  ;;   when the kernel holds no more sockets.
  ;; BIND: then a path of 1 to PATH_MAX bytes -> empty. Creates the file the
  ;;   address is; EADDRINUSE when the name exists.
  ;; LISTEN: argument the backlog -> empty. EDESTADDRREQ when unbound.
  ;; ACCEPT: argument CLOEXEC|NONBLOCK -> dolly_socket_descriptors, `first` a
  ;;   connected socket. Waits for a connection; EAGAIN when nonblocking.
  ;; CONNECT: then a path -> empty, connected once the listener's backlog has
  ;;   room, before it accepts. ECONNREFUSED when nothing listens at the path.
  ;; SHUTDOWN: argument SHUTDOWN_READ|SHUTDOWN_WRITE -> empty.
  ;; SEND: argument DONTWAIT, then the bytes -> dolly_process_io_result, the
  ;;   count taken (at least one, or it waits). RECEIVE: argument DONTWAIT ->
  ;;   up to the response capacity in bytes. As write and read with a flag.
  ;; NAME: argument PEER or zero -> the path that socket or its peer was
  ;;   bound to, empty when unnamed.
  (global (export "DOLLY_SOCKET_CREATE") i32 (i32.const 160))
  (global (export "DOLLY_SOCKET_PAIR") i32 (i32.const 161))
  (global (export "DOLLY_SOCKET_BIND") i32 (i32.const 162))
  (global (export "DOLLY_SOCKET_LISTEN") i32 (i32.const 163))
  (global (export "DOLLY_SOCKET_ACCEPT") i32 (i32.const 164))
  (global (export "DOLLY_SOCKET_CONNECT") i32 (i32.const 165))
  (global (export "DOLLY_SOCKET_SHUTDOWN") i32 (i32.const 166))
  (global (export "DOLLY_SOCKET_SEND") i32 (i32.const 167))
  (global (export "DOLLY_SOCKET_RECEIVE") i32 (i32.const 168))
  (global (export "DOLLY_SOCKET_NAME") i32 (i32.const 169))
  (global (export "DOLLY_SOCKET_CLOEXEC") i32 (i32.const 1))
  (global (export "DOLLY_SOCKET_NONBLOCK") i32 (i32.const 2))
  (global (export "DOLLY_SOCKET_DONTWAIT") i32 (i32.const 1))
  (global (export "DOLLY_SOCKET_PEER") i32 (i32.const 1))
  (global (export "DOLLY_SOCKET_SHUTDOWN_READ") i32 (i32.const 1))
  (global (export "DOLLY_SOCKET_SHUTDOWN_WRITE") i32 (i32.const 2))
  (global (export "DOLLY_SOCKET_PATH_MAX") i32 (i32.const 107))
)
