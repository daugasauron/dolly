// display@0 kernel side: process framebuffer and input packets over the
// display lease in src/dolly.c.
#include "process-kernel.h"

#include <dolly/display.h>
#include <dolly/process.h>
#include <errno.h>
#include <stdint.h>
#include <string.h>

static void encode_display_surface(
    const dolly_display_surface *surface, uint64_t capacity,
    uint32_t buffer_index, dolly_process_display_surface_response *response) {
  *response = (dolly_process_display_surface_response){
      .generation = surface->generation,
      .capacity = capacity,
      .buffer_index = buffer_index,
      .width = surface->width,
      .height = surface->height,
      .stride = surface->stride,
      .pixel_format = surface->pixel_format,
  };
}

static int64_t display_acquire_packet(int pid, unsigned char *mailbox,
                                      uintptr_t request_size,
                                      uintptr_t response_capacity) {
  if (request_size != 0 ||
      response_capacity < sizeof(dolly_process_display_surface_response)) {
    return -EINVAL;
  }
  dolly_display_surface surface;
  const int result = dolly_kernel_display_acquire(pid, &surface);
  if (result != 0) return result;
  dolly_process_display_surface_response response;
  encode_display_surface(&surface, 0, 0, &response);
  return dolly_kernel_respond(mailbox, &response, sizeof(response));
}

static int64_t display_set_size_packet(int pid, unsigned char *mailbox,
                                       uintptr_t request_size,
                                       uintptr_t response_capacity) {
  if (request_size != sizeof(dolly_process_display_size_request) ||
      response_capacity < sizeof(dolly_process_display_surface_response)) {
    return -EINVAL;
  }
  dolly_process_display_size_request request;
  memcpy(&request, mailbox, sizeof(request));
  dolly_display_surface surface;
  const int result = dolly_kernel_display_set_size(
      pid, request.generation, request.width, request.height, &surface);
  if (result != 0) return result;
  dolly_process_display_surface_response response;
  encode_display_surface(&surface, 0, 0, &response);
  return dolly_kernel_respond(mailbox, &response, sizeof(response));
}

static int64_t display_begin_frame_packet(int pid, unsigned char *mailbox,
                                          uintptr_t request_size,
                                          uintptr_t response_capacity) {
  if (request_size != sizeof(dolly_process_display_generation_request) ||
      response_capacity < sizeof(dolly_process_display_surface_response)) {
    return -EINVAL;
  }
  dolly_process_display_generation_request request;
  memcpy(&request, mailbox, sizeof(request));
  dolly_display_frame frame;
  const int result = dolly_kernel_display_begin_frame(
      pid, request.generation, &frame);
  if (result != 0) return result;
  dolly_display_surface surface = {
      .generation = request.generation,
      .width = frame.width,
      .height = frame.height,
      .stride = frame.stride,
      .pixel_format = frame.pixel_format,
  };
  dolly_process_display_surface_response response;
  encode_display_surface(&surface, frame.capacity, frame.buffer_index, &response);
  return dolly_kernel_respond(mailbox, &response, sizeof(response));
}

static int64_t display_write_frame_packet(int pid, unsigned char *mailbox,
                                          uintptr_t request_size,
                                          uintptr_t response_capacity) {
  if (request_size < sizeof(dolly_process_display_write_request) ||
      response_capacity != 0) return -EINVAL;
  dolly_process_display_write_request request;
  memcpy(&request, mailbox, sizeof(request));
  if (request.reserved != 0 || request.size > SIZE_MAX ||
      request.offset > SIZE_MAX ||
      request.size != request_size - sizeof(request)) return -EINVAL;
  return dolly_kernel_display_write_frame(
      pid, request.generation, request.buffer_index,
      (size_t)request.offset, mailbox + sizeof(request),
      (size_t)request.size);
}

static int64_t display_present_packet(int pid, unsigned char *mailbox,
                                      uintptr_t request_size,
                                      uintptr_t response_capacity) {
  if (request_size != sizeof(dolly_process_display_present_request) ||
      response_capacity != 0) return -EINVAL;
  dolly_process_display_present_request request;
  memcpy(&request, mailbox, sizeof(request));
  if (request.reserved != 0) return -EINVAL;
  return dolly_kernel_display_present(
      pid, request.generation, request.buffer_index);
}

static int64_t display_wait_frame_packet(int pid, unsigned char *mailbox,
                                         uintptr_t request_size,
                                         uintptr_t response_capacity) {
  if (request_size != sizeof(dolly_process_display_wait_request) ||
      response_capacity < sizeof(dolly_process_display_wait_response)) {
    return -EINVAL;
  }
  dolly_process_display_wait_request request;
  memcpy(&request, mailbox, sizeof(request));
  if (request.reserved != 0) return -EINVAL;
  uint32_t sequence = request.sequence;
  const int result = dolly_kernel_display_poll_frame(
      pid, request.generation, request.sequence, &sequence);
  if (result < 0) return result;
  if (result == 0 && dolly_kernel_deadline_pending(request.deadline_nanoseconds)) {
    return DOLLY_PROCESS_DISPATCH_DEFERRED;
  }
  const dolly_process_display_wait_response response = {result, sequence};
  return dolly_kernel_respond(mailbox, &response, sizeof(response));
}

static int64_t display_set_cursor_packet(int pid, unsigned char *mailbox,
                                         uintptr_t request_size,
                                         uintptr_t response_capacity) {
  if (request_size != sizeof(dolly_process_display_cursor_request) ||
      response_capacity != 0) return -EINVAL;
  dolly_process_display_cursor_request request;
  memcpy(&request, mailbox, sizeof(request));
  if (request.reserved != 0) return -EINVAL;
  return dolly_kernel_display_set_cursor(
      pid, request.generation, request.cursor);
}

static int64_t display_next_event_packet(int pid, unsigned char *mailbox,
                                         uintptr_t request_size,
                                         uintptr_t response_capacity) {
  if (request_size != sizeof(dolly_process_display_event_request) ||
      response_capacity < sizeof(dolly_process_display_event_response)) {
    return -EINVAL;
  }
  dolly_process_display_event_request request;
  memcpy(&request, mailbox, sizeof(request));
  dolly_input_event event;
  memset(&event, 0, sizeof(event));
  const int result = dolly_kernel_display_poll_event(
      pid, request.generation, &event);
  if (result < 0) return result;
  if (result == 0 && dolly_kernel_deadline_pending(request.deadline_nanoseconds)) {
    return DOLLY_PROCESS_DISPATCH_DEFERRED;
  }
  dolly_process_display_event_response response = {.result = result};
  _Static_assert(sizeof(response.event) == sizeof(event),
                 "process/display event layouts diverged");
  if (result == 1) memcpy(response.event, &event, sizeof(event));
  return dolly_kernel_respond(mailbox, &response, sizeof(response));
}

static int64_t display_release_packet(int pid, unsigned char *mailbox,
                                      uintptr_t request_size,
                                      uintptr_t response_capacity) {
  if (request_size != sizeof(dolly_process_display_generation_request) ||
      response_capacity != 0) return -EINVAL;
  dolly_process_display_generation_request request;
  memcpy(&request, mailbox, sizeof(request));
  return dolly_kernel_display_release(pid, request.generation);
}

static int64_t display_call(int pid, int tid, uint32_t operation, unsigned char *mailbox,
                            uintptr_t request_size, uintptr_t response_capacity) {
  switch (operation) {
    case DOLLY_PROCESS_DISPLAY_ACQUIRE:
      return display_acquire_packet(pid, mailbox, request_size, response_capacity);
    case DOLLY_PROCESS_DISPLAY_SET_SIZE:
      return display_set_size_packet(pid, mailbox, request_size, response_capacity);
    case DOLLY_PROCESS_DISPLAY_BEGIN_FRAME:
      return display_begin_frame_packet(pid, mailbox, request_size, response_capacity);
    case DOLLY_PROCESS_DISPLAY_WRITE_FRAME:
      return display_write_frame_packet(pid, mailbox, request_size, response_capacity);
    case DOLLY_PROCESS_DISPLAY_PRESENT:
      return display_present_packet(pid, mailbox, request_size, response_capacity);
    case DOLLY_PROCESS_DISPLAY_WAIT_FRAME:
      return display_wait_frame_packet(pid, mailbox, request_size, response_capacity);
    case DOLLY_PROCESS_DISPLAY_SET_CURSOR:
      return display_set_cursor_packet(pid, mailbox, request_size, response_capacity);
    case DOLLY_PROCESS_DISPLAY_NEXT_EVENT:
      return display_next_event_packet(pid, mailbox, request_size, response_capacity);
    case DOLLY_PROCESS_DISPLAY_RELEASE:
      return display_release_packet(pid, mailbox, request_size, response_capacity);
  }
  return -EINVAL;
}

static void display_release(int pid, int tid) {
  if (tid == 0) dolly_kernel_display_release_owner(pid);
}

const dolly_kernel_module dolly_display_kernel = {
    DOLLY_PROCESS_DISPLAY_ACQUIRE, DOLLY_PROCESS_DISPLAY_RELEASE, display_call, display_release};
