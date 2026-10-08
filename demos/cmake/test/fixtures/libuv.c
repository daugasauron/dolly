#include <uv.h>
#include <assert.h>
#include <fcntl.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <termios.h>
#include <unistd.h>

static uv_loop_t loop;
static int phase, fs_calls, timer_calls, exit_calls, read_calls, work_calls;
static uv_timer_t timer;
static uv_work_t cancelled, work;
static uv_fs_t request;
static uv_process_t child;
static uv_pipe_t output;
static char collected[64];
static size_t collected_size;
static uv_tty_t tty;
static uv_tty_t tty_output;
static uv_signal_t interrupt;
static uv_signal_t resize;
static int terminal_status;
static int terminal_columns, terminal_rows;
static struct termios original_terminal;

static void finish_terminal(int status) {
  terminal_status = status;
  assert(uv_tty_reset_mode() == 0);
  struct termios restored;
  assert(tcgetattr(0, &restored) == 0);
  assert((restored.c_lflag & (ICANON | ECHO)) ==
         (original_terminal.c_lflag & (ICANON | ECHO)));
  assert(restored.c_oflag == original_terminal.c_oflag);
  uv_close((uv_handle_t*)&tty, NULL);
  uv_close((uv_handle_t*)&interrupt, NULL);
  uv_close((uv_handle_t*)&resize, NULL);
}

static void terminal_resize(uv_signal_t* handle, int signal) {
  assert(signal == SIGWINCH);
  int columns, rows;
  assert(uv_tty_get_winsize(&tty, &columns, &rows) == 0);
  assert(columns != terminal_columns || rows != terminal_rows);
  terminal_columns = columns;
  terminal_rows = rows;
  puts("LIBUV-RESIZED"); fflush(stdout);
}

static void terminal_interrupt(uv_signal_t* handle, int signal) {
  (void)handle;
  assert(signal == SIGINT);
  FILE* marker = fopen("interrupt-handled", "w");
  assert(marker && fclose(marker) == 0);
  finish_terminal(130);
}

static void terminal_read(uv_stream_t* handle, ssize_t count, const uv_buf_t* buf) {
  (void)handle;
  assert(count >= 0);
  if (count > 0) {
    assert(collected_size + count < sizeof(collected));
    memcpy(collected + collected_size, buf->base, count);
    collected_size += count;
    if (collected_size == 5) {
      assert(strcmp(collected, "hello") == 0);
      finish_terminal(0);
    }
  }
  free(buf->base);
}

static void timer_done(uv_timer_t* handle) {
  assert(phase == 1);
  timer_calls++;
  uv_close((uv_handle_t*)handle, NULL);
}

static void fs_done(uv_fs_t* req) {
  assert(phase == 1 && req->result == 0 && req->statbuf.st_size == 5);
  fs_calls++;
  uv_fs_req_cleanup(req);
}

static void work_run(uv_work_t* req) {
  assert(phase == 1 && req == &work);
  assert(uv_cancel((uv_req_t*)req) == UV_EBUSY);
  work_calls++;
}

static void work_done(uv_work_t* req, int status) {
  assert(phase == 1);
  if (req == &cancelled) assert(status == UV_ECANCELED);
  else assert(status == 0 && work_calls == 1);
}

static void allocate(uv_handle_t* handle, size_t suggested, uv_buf_t* buf) {
  (void)handle; (void)suggested;
  *buf = uv_buf_init(malloc(64), 64);
}

static void read_output(uv_stream_t* stream, ssize_t count, const uv_buf_t* buf) {
  if (count > 0) {
    assert(collected_size + count < sizeof(collected));
    memcpy(collected + collected_size, buf->base, count);
    collected_size += count;
    read_calls++;
    /* The first line must arrive while the child is still waiting for input. */
    if (collected_size == 6) {
      assert(memcmp(collected, "FIRST\n", 6) == 0 && exit_calls == 0);
      int fd = open("child-ready", O_WRONLY | O_CREAT, 0600);
      assert(fd >= 0); close(fd);
    }
  } else if (count < 0) {
    assert(count == UV_EOF);
    uv_close((uv_handle_t*)stream, NULL);
  }
  free(buf->base);
}

static void child_done(uv_process_t* handle, int64_t status, int signal) {
  assert(status == 7 && signal == 0);
  exit_calls++;
  uv_close((uv_handle_t*)handle, NULL);
}

static void forbidden_thread(void* ignored) { abort(); }

static uv_pipe_t duplex;
static uv_write_t ping;
static uv_shutdown_t ping_end;
static char echoed[8];
static size_t echoed_size;
static int echo_exits;

static void echo_read(uv_stream_t* stream, ssize_t count, const uv_buf_t* buf) {
  if (count > 0) {
    assert(echoed_size + count <= sizeof(echoed));
    memcpy(echoed + echoed_size, buf->base, count);
    echoed_size += count;
  } else if (count < 0) {
    assert(count == UV_EOF);
    uv_close((uv_handle_t*)stream, NULL);
  }
  free(buf->base);
}

static void ping_written(uv_write_t* req, int status) {
  assert(status == 0 && uv_shutdown(&ping_end, req->handle, NULL) == 0);
}

static void echo_done(uv_process_t* handle, int64_t status, int signal) {
  assert(status == 0 && signal == 0);
  echo_exits++;
  uv_close((uv_handle_t*)handle, NULL);
}

/* One pipe both ways is the child's descriptor 0: a socket pair. The child
   answers on it after our shutdown has given it end of file. */
static void two_way_pipe(char* program) {
  uv_process_t echo;
  char* args[] = {program, "echo", NULL};
  assert(uv_pipe_init(&loop, &duplex, 0) == 0);
  uv_stdio_container_t stdio[3] = {
    {.flags = UV_CREATE_PIPE | UV_READABLE_PIPE | UV_WRITABLE_PIPE, .data.stream = (uv_stream_t*)&duplex},
    {.flags = UV_INHERIT_FD, .data.fd = 1}, {.flags = UV_INHERIT_FD, .data.fd = 2}};
  uv_process_options_t options = {.file = program, .args = args,
    .stdio_count = 3, .stdio = stdio, .exit_cb = echo_done};
  assert(uv_spawn(&loop, &echo, &options) == 0);
  uv_buf_t bytes = uv_buf_init("ping", 4);
  assert(uv_write(&ping, (uv_stream_t*)&duplex, &bytes, 1, ping_written) == 0);
  assert(uv_read_start((uv_stream_t*)&duplex, allocate, echo_read) == 0);
  assert(uv_run(&loop, UV_RUN_DEFAULT) == 0);
  assert(echo_exits == 1 && echoed_size == 4 && memcmp(echoed, "PING", 4) == 0);
}

static void spawn_failures(void) {
  uv_process_t failed;
  char* args[] = {"missing", NULL};
  uv_process_options_t options = {.file = "/no-such-libuv-command", .args = args};
  assert(uv_spawn(&loop, &failed, &options) == UV_ENOENT);
  uv_close((uv_handle_t*)&failed, NULL);
  assert(uv_run(&loop, UV_RUN_DEFAULT) == 0);

  options.flags = UV_PROCESS_DETACHED;
  assert(uv_spawn(&loop, &failed, &options) == UV_ENOTSUP);
  uv_close((uv_handle_t*)&failed, NULL);
  assert(uv_run(&loop, UV_RUN_DEFAULT) == 0);
  options.flags = 0;

  uv_pipe_t pipe;
  assert(uv_pipe_init(&loop, &pipe, 0) == 0);
  uv_stdio_container_t stdio[3] = {{.flags = UV_IGNORE},
    {.flags = UV_CREATE_PIPE | UV_WRITABLE_PIPE, .data.stream = (uv_stream_t*)&pipe},
    {.flags = UV_INHERIT_FD, .data.fd = -1}};
  options.file = "/bin/slop";
  options.stdio_count = 3;
  options.stdio = stdio;
  assert(uv_spawn(&loop, &failed, &options) == UV_EBADF);
  uv_os_fd_t descriptor;
  assert(uv_fileno((uv_handle_t*)&pipe, &descriptor) == UV_EBADF);
  uv_close((uv_handle_t*)&pipe, NULL);
  uv_close((uv_handle_t*)&failed, NULL);
  assert(uv_run(&loop, UV_RUN_DEFAULT) == 0);
}

static uv_pipe_t listener, accepted, connecting;
static uv_connect_t connection;
static uv_write_t greeting;
static int served;

static void served_read(uv_stream_t* stream, ssize_t count, const uv_buf_t* buf) {
  if (count > 0) {
    assert(count == 5 && memcmp(buf->base, "named", 5) == 0);
    served++;
    uv_close((uv_handle_t*)stream, NULL);
    uv_close((uv_handle_t*)&listener, NULL);
  }
  free(buf->base);
}

static void accept_one(uv_stream_t* server, int status) {
  assert(status == 0 && uv_pipe_init(&loop, &accepted, 0) == 0);
  assert(uv_accept(server, (uv_stream_t*)&accepted) == 0);
  assert(uv_read_start((uv_stream_t*)&accepted, allocate, served_read) == 0);
}

static void greeted(uv_write_t* req, int status) {
  assert(status == 0);
  uv_close((uv_handle_t*)req->handle, NULL);
}

static void connected(uv_connect_t* req, int status) {
  assert(status == 0);
  uv_buf_t bytes = uv_buf_init("named", 5);
  assert(uv_write(&greeting, req->handle, &bytes, 1, greeted) == 0);
}

/* A named pipe is a local socket at a path: libuv's own server and client,
   and the path gone once the listener closes. */
static void named_pipe(void) {
  assert(uv_pipe_init(&loop, &listener, 0) == 0);
  assert(uv_pipe_bind(&listener, "named.sock") == 0);
  assert(uv_listen((uv_stream_t*)&listener, 4, accept_one) == 0);
  assert(uv_pipe_init(&loop, &connecting, 0) == 0);
  uv_pipe_connect(&connection, &connecting, "named.sock", connected);
  assert(uv_run(&loop, UV_RUN_DEFAULT) == 0);
  assert(served == 1 && access("named.sock", F_OK) != 0);
}

int main(int argc, char** argv) {
  if (argc == 2 && strcmp(argv[1], "child") == 0) {
    assert(strcmp(getenv("LIBUV_CHILD"), "yes") == 0);
    puts("FIRST"); fflush(stdout);
    for (int i = 0; access("child-ready", F_OK) && i < 500; i++) uv_sleep(10);
    if (access("child-ready", F_OK)) return 9;
    puts("SECOND");
    return 7;
  }
  if (argc == 2 && strcmp(argv[1], "echo") == 0) {
    char bytes[8];
    ssize_t count, size = 0;
    assert(uv_guess_handle(0) == UV_NAMED_PIPE);
    while ((count = read(0, bytes + size, sizeof(bytes) - size)) > 0) size += count;
    for (ssize_t i = 0; i < size; i++) bytes[i] -= 'a' - 'A';
    return count == 0 && write(0, bytes, size) == size ? 0 : 9;
  }
  puts("LIBUV-START"); fflush(stdout);
  int descriptor_baseline = open("/dev/null", O_RDONLY);
  assert(descriptor_baseline >= 0); close(descriptor_baseline);
  assert(uv_loop_init(&loop) == 0);
  assert(uv_loop_fork(&loop) == UV_ENOSYS);
  if (argc == 2 && strcmp(argv[1], "tty") == 0) {
    assert(tcgetattr(0, &original_terminal) == 0);
    assert(uv_tty_init(&loop, &tty, 0, 1) == 0);
    assert(uv_tty_set_mode(&tty, UV_TTY_MODE_RAW) == 0);
    // Raw mode clears ISIG; set it again so Ctrl+C raises SIGINT for the
    // signal callback instead of arriving as input.
    struct termios raw;
    assert(tcgetattr(0, &raw) == 0 && !(raw.c_lflag & ISIG));
    raw.c_lflag |= ISIG;
    assert(tcsetattr(0, TCSANOW, &raw) == 0);
    assert(uv_tty_get_winsize(&tty, &terminal_columns, &terminal_rows) == 0 &&
           terminal_columns > 0 && terminal_rows > 0);
    int output_fd = dup(1), output_columns, output_rows;
    int output_status = uv_tty_init(&loop, &tty_output, output_fd, 0);
    assert(output_fd >= 0 && output_status == 0);
    assert(uv_tty_get_winsize(&tty_output, &output_columns, &output_rows) == 0);
    assert(output_columns == terminal_columns && output_rows == terminal_rows);
    uv_close((uv_handle_t*)&tty_output, NULL);
    assert(uv_signal_init(&loop, &interrupt) == 0);
    assert(uv_signal_start(&interrupt, terminal_interrupt, SIGINT) == 0);
    assert(uv_signal_init(&loop, &resize) == 0);
    assert(uv_signal_start(&resize, terminal_resize, SIGWINCH) == 0);
    assert(uv_read_start((uv_stream_t*)&tty, allocate, terminal_read) == 0);
    puts("LIBUV-TTY-READY"); fflush(stdout);
    assert(uv_run(&loop, UV_RUN_DEFAULT) == 0);
    assert(uv_loop_close(&loop) == 0);
    return terminal_status;
  }
  uv_thread_t thread;
  assert(uv_thread_create(&thread, forbidden_thread, NULL) != 0);
  spawn_failures();
  FILE* file = fopen("data", "w");
  assert(file && fputs("hello", file) >= 0 && fclose(file) == 0);
  assert(uv_fs_stat(&loop, &request, "data", fs_done) == 0);
  assert(uv_timer_init(&loop, &timer) == 0);
  assert(uv_timer_start(&timer, timer_done, 5, 0) == 0);
  assert(uv_queue_work(&loop, &cancelled, work_run, work_done) == 0);
  assert(uv_cancel((uv_req_t*)&cancelled) == 0);
  assert(uv_cancel((uv_req_t*)&cancelled) == UV_EBUSY);
  assert(uv_queue_work(&loop, &work, work_run, work_done) == 0);
  assert(fs_calls == 0 && timer_calls == 0 && work_calls == 0);
  phase = 1;
  assert(uv_pipe_init(&loop, &output, 0) == 0);
  char* args[] = {argv[0], "child", NULL};
  uv_stdio_container_t stdio[3] = {{.flags = UV_IGNORE},
    {.flags = UV_CREATE_PIPE | UV_WRITABLE_PIPE, .data.stream = (uv_stream_t*)&output},
    {.flags = UV_INHERIT_FD, .data.fd = 2}};
  char* environment[] = {"PATH=.", "LIBUV_CHILD=yes", NULL};
  uv_process_options_t options = {.file = "probe", .args = args,
    .flags = UV_PROCESS_WINDOWS_HIDE | UV_PROCESS_WINDOWS_VERBATIM_ARGUMENTS |
             UV_PROCESS_WINDOWS_FILE_PATH_EXACT_NAME,
    .env = environment, .cwd = "/tmp/dolly-libuv",
    .stdio_count = 3, .stdio = stdio, .exit_cb = child_done};
  int spawned = uv_spawn(&loop, &child, &options);
  if (spawned) fprintf(stderr, "uv_spawn: %s\n", uv_strerror(spawned));
  assert(spawned == 0);
  assert(uv_read_start((uv_stream_t*)&output, allocate, read_output) == 0);
  assert(uv_run(&loop, UV_RUN_DEFAULT) == 0);
  assert(fs_calls == 1 && timer_calls == 1 && work_calls == 1 && exit_calls == 1);
  assert(read_calls >= 2 && strcmp(collected, "FIRST\nSECOND\n") == 0);
  two_way_pipe(argv[0]);
  named_pipe();
  assert(uv_loop_close(&loop) == 0);
  uv_library_shutdown();
  int after = open("/dev/null", O_RDONLY);
  assert(after == descriptor_baseline); close(after);
  unlink("data"); unlink("child-ready");
  puts("LIBUV-OK: deferred work, cancellation, timers, files, streamed, two-way and named pipes and child exit");
  return 0;
}
