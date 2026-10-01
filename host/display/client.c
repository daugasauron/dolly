#include <dolly/display.h>
#include <dolly/process.h>
#include <dolly/host.h>
#include <errno.h>
#include <limits.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

DOLLY_HOST_REQUIRE(display, 0, DOLLY_DISPLAY_ABI_DIGEST);

static uint64_t monotonic_nanoseconds(void) {
  struct timespec value;
  return clock_gettime(CLOCK_MONOTONIC, &value) == 0
      ? (uint64_t)value.tv_sec * 1000000000u + (uint64_t)value.tv_nsec : 0;
}

static unsigned char *display_pixels;
static size_t display_pixels_capacity;
static uint64_t display_frame_generation;
static size_t display_frame_size;
static uint32_t display_frame_index;

static int decode_display_surface(
    int64_t result, const dolly_display_surface_response *response,
    dolly_display_surface *surface) {
  if (result < 0) return (int)result;
  if ((uint64_t)result != sizeof(*response) || response->reserved != 0 ||
      response->generation == 0 || response->width == 0 ||
      response->height == 0 || response->stride != response->width * 4u ||
      response->pixel_format != DOLLY_DISPLAY_PIXEL_RGBA8 ||
      response->width > DOLLY_DISPLAY_MAX_WIDTH ||
      response->height > DOLLY_DISPLAY_MAX_HEIGHT ||
      (uint64_t)response->stride * response->height >
          (uint64_t)DOLLY_DISPLAY_MAX_WIDTH * DOLLY_DISPLAY_MAX_HEIGHT * 4u) {
    return -EIO;
  }
  *surface = (dolly_display_surface){
      .generation = response->generation,
      .width = response->width,
      .height = response->height,
      .stride = response->stride,
      .pixel_format = response->pixel_format,
  };
  return 0;
}

static int display_deadline(double timeout_milliseconds, uint64_t *deadline) {
  if (deadline == NULL || timeout_milliseconds != timeout_milliseconds) {
    return -EINVAL;
  }
  if (timeout_milliseconds < 0) {
    *deadline = UINT64_MAX;
    return 0;
  }
  if (timeout_milliseconds == 0) {
    *deadline = 0;
    return 0;
  }
  const uint64_t now = monotonic_nanoseconds();
  const double delta = timeout_milliseconds * 1000000.0;
  if (now == 0 || delta < 0 || delta > (double)(UINT64_MAX - now)) {
    return -EINVAL;
  }
  *deadline = now + (uint64_t)delta;
  return 0;
}

int dolly_display_acquire(dolly_display_surface *surface) {
  if (surface == NULL) return -EINVAL;
  memset(surface, 0, sizeof(*surface));
  dolly_display_surface_response response = {0};
  const int64_t result = dolly_process_call(
      DOLLY_DISPLAY_ACQUIRE, NULL, 0, &response, sizeof(response));
  return decode_display_surface(result, &response, surface);
}

int dolly_display_set_size(uint64_t generation, uint32_t width,
                           uint32_t height, dolly_display_surface *surface) {
  if (surface == NULL || generation == 0 || width == 0 || height == 0) {
    return -EINVAL;
  }
  const dolly_display_size_request request = {
      generation, width, height,
  };
  dolly_display_surface_response response = {0};
  const int64_t result = dolly_process_call(
      DOLLY_DISPLAY_SET_SIZE, &request, sizeof(request),
      &response, sizeof(response));
  return decode_display_surface(result, &response, surface);
}

int dolly_display_begin_frame(uint64_t generation, dolly_display_frame *frame) {
  if (generation == 0 || frame == NULL) return -EINVAL;
  memset(frame, 0, sizeof(*frame));
  const dolly_display_generation_request request = {generation};
  dolly_display_surface_response response = {0};
  const int64_t result = dolly_process_call(
      DOLLY_DISPLAY_BEGIN_FRAME, &request, sizeof(request),
      &response, sizeof(response));
  dolly_display_surface surface;
  int status = decode_display_surface(result, &response, &surface);
  if (status != 0) return status;
  const uint64_t expected = (uint64_t)surface.stride * surface.height;
  if (response.capacity != expected || response.capacity > SIZE_MAX ||
      response.buffer_index >= DOLLY_DISPLAY_FRAME_COUNT) return -EIO;
  if ((size_t)response.capacity > display_pixels_capacity) {
    unsigned char *replacement = realloc(display_pixels, (size_t)response.capacity);
    if (replacement == NULL) return -ENOMEM;
    display_pixels = replacement;
    display_pixels_capacity = (size_t)response.capacity;
  }
  display_frame_generation = generation;
  display_frame_size = (size_t)response.capacity;
  display_frame_index = response.buffer_index;
  *frame = (dolly_display_frame){
      .pixels = display_pixels,
      .capacity = display_frame_size,
      .buffer_index = response.buffer_index,
      .width = surface.width,
      .height = surface.height,
      .stride = surface.stride,
      .pixel_format = surface.pixel_format,
  };
  return 0;
}

int dolly_display_present(uint64_t generation, uint32_t buffer_index) {
  if (generation == 0 || generation != display_frame_generation ||
      buffer_index != display_frame_index || display_frame_size == 0 ||
      display_pixels == NULL) return -EINVAL;
  const size_t header_size = sizeof(dolly_display_write_request);
  const size_t maximum_chunk = DOLLY_PROCESS_PACKET_LIMIT - header_size;
  unsigned char *packet = malloc(DOLLY_PROCESS_PACKET_LIMIT);
  if (packet == NULL) return -ENOMEM;
  size_t offset = 0;
  int status = 0;
  while (offset < display_frame_size) {
    const size_t chunk = display_frame_size - offset > maximum_chunk
        ? maximum_chunk : display_frame_size - offset;
    const dolly_display_write_request request = {
        .generation = generation,
        .offset = offset,
        .size = chunk,
        .buffer_index = buffer_index,
    };
    memcpy(packet, &request, sizeof(request));
    memcpy(packet + header_size, display_pixels + offset, chunk);
    const int64_t result = dolly_process_call(
        DOLLY_DISPLAY_WRITE_FRAME, packet, header_size + chunk,
        NULL, 0);
    if (result < 0) {
      status = (int)result;
      break;
    }
    if (result != 0) {
      status = -EIO;
      break;
    }
    offset += chunk;
  }
  free(packet);
  if (status != 0) return status;
  const dolly_display_present_request request = {
      generation, buffer_index, 0,
  };
  const int64_t result = dolly_process_call(
      DOLLY_DISPLAY_PRESENT, &request, sizeof(request), NULL, 0);
  if (result < 0) return (int)result;
  if (result != 0) return -EIO;
  display_frame_generation = 0;
  display_frame_size = 0;
  return 0;
}

int dolly_display_wait_frame(uint64_t generation, uint32_t *sequence,
                             double timeout_milliseconds) {
  if (generation == 0 || sequence == NULL) return -EINVAL;
  uint64_t deadline;
  int status = display_deadline(timeout_milliseconds, &deadline);
  if (status != 0) return status;
  const dolly_display_wait_request request = {
      generation, deadline, *sequence, 0,
  };
  dolly_display_wait_response response = {0};
  const int64_t result = dolly_process_call(
      DOLLY_DISPLAY_WAIT_FRAME, &request, sizeof(request),
      &response, sizeof(response));
  if (result < 0) return (int)result;
  if ((uint64_t)result != sizeof(response) ||
      (response.result != 0 && response.result != 1)) return -EIO;
  *sequence = response.sequence;
  return response.result;
}

int dolly_display_set_cursor(uint64_t generation, uint32_t cursor) {
  const dolly_display_cursor_request request = {generation, cursor, 0};
  const int64_t result = dolly_process_call(
      DOLLY_DISPLAY_SET_CURSOR, &request, sizeof(request), NULL, 0);
  return result < 0 ? (int)result : result == 0 ? 0 : -EIO;
}

int dolly_display_next_event(uint64_t generation, dolly_input_event *event,
                             double timeout_milliseconds) {
  if (generation == 0 || event == NULL) return -EINVAL;
  uint64_t deadline;
  int status = display_deadline(timeout_milliseconds, &deadline);
  if (status != 0) return status;
  const dolly_display_event_request request = {generation, deadline};
  dolly_display_event_response response = {0};
  const int64_t result = dolly_process_call(
      DOLLY_DISPLAY_NEXT_EVENT, &request, sizeof(request),
      &response, sizeof(response));
  if (result < 0) return (int)result;
  if ((uint64_t)result != sizeof(response) || response.reserved != 0 ||
      (response.result != 0 && response.result != 1)) return -EIO;
  if (response.result == 1) *event = response.event;
  return response.result;
}

int dolly_display_release(uint64_t generation) {
  const dolly_display_generation_request request = {generation};
  const int64_t result = dolly_process_call(
      DOLLY_DISPLAY_RELEASE, &request, sizeof(request), NULL, 0);
  if (result < 0) return (int)result;
  if (result != 0) return -EIO;
  display_frame_generation = 0;
  display_frame_size = 0;
  return 0;
}

