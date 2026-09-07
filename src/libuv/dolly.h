#ifndef UV_DOLLY_H
#define UV_DOLLY_H

/* Dolly's libuv target uses upstream's poll backend and a serial child reaper. */
#define UV_PLATFORM_LOOP_FIELDS \
  struct pollfd* poll_fds; \
  size_t poll_fds_used; \
  size_t poll_fds_size; \
  unsigned char poll_fds_iterating; \
  uv_timer_t child_poll;

struct uv_loop_s;
void uv__dolly_process_cleanup(struct uv_loop_s* loop);

#endif
