DOLLY 3
MODULE libuv

REQUIRES HEADER libc
REQUIRES HEADER runtime
REQUIRES TOOL cc
REQUIRES TOOL ar
REQUIRES TOOL make
REQUIRES TOOL cp
REQUIRES TOOL tar
REQUIRES TOOL rm

SOURCE HOST /static/neovim/libuv.tar /tmp/libuv/source.tar d28d193a41b305f389d8e3a2dbe186ba0c5762c2b9aab24febfc32b8fb026920
SLOP tar -xf /tmp/libuv/source.tar -C /
SLOP make -C /tmp/libuv
SLOP cp /tmp/libuv/libuv.a /usr/lib/libuv.a
SLOP cp -R /tmp/libuv/source/include/. /usr/include

FILE /tmp/libuv/check.c
    #include <uv.h>
    #include <assert.h>
    static int completed;
    static void done(uv_timer_t* timer) { completed = 1; uv_close((uv_handle_t*)timer, 0); }
    int main(void) {
      uv_loop_t loop; uv_timer_t timer;
      assert(uv_get_total_memory() == 0);
      assert(uv_loop_init(&loop) == 0 && uv_timer_init(&loop, &timer) == 0);
      assert(uv_timer_start(&timer, done, 1, 0) == 0);
      assert(uv_run(&loop, UV_RUN_DEFAULT) == 0 && completed);
      return uv_loop_close(&loop);
    }
SLOP cc -O0 /tmp/libuv/check.c -luv -o /tmp/libuv/check
SLOP /tmp/libuv/check

EXPORTS LIB uv /usr/lib/libuv.a
EXPORTS HEADER uv /usr/include/uv.h
EXPORTS HEADER uv-platform /usr/include/uv
FILE /usr/share/licenses/libuv/LICENSE

SLOP rm -rf /tmp/libuv
