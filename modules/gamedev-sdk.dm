DOLLY 3
MODULE gamedev-sdk

REQUIRES HEADER libc
REQUIRES HEADER display
REQUIRES TOOL   ar
REQUIRES TOOL   cc
REQUIRES TOOL   make
REQUIRES TOOL   mkdir
REQUIRES TOOL   rm
REQUIRES TOOL   tar

# raylib 6.0 and Box3D 0.1.0 are unchanged upstream source archives.
SOURCE HOST /static/gamedev/raylib.tar /tmp/raylib.tar b16dd083b9205e14f8b79a1d91c934b579c9a92bcb4e3af0e374f3e71dcf82d3
SOURCE HOST /static/gamedev/box3d.tar  /tmp/box3d.tar  5a502138e8f7b47c5994bdd279e9dcddeae0b8e147e3b92ab79b723bd07e4377

FILE /usr/src/dolly/gamedev/sdk.mk
    CC := cc
    AR := ar
    RAYLIB_SOURCE := /usr/src/raylib/src
    RAYLIB_MODULES := rcore rshapes rtextures rtext rmodels
    RAYLIB_OBJECTS := $(patsubst %,/usr/src/raylib/build/%.o,$(RAYLIB_MODULES))
    BOX3D_SOURCE := /usr/src/box3d/src
    BOX3D_SOURCES := $(filter-out $(BOX3D_SOURCE)/timer.c,$(wildcard $(BOX3D_SOURCE)/*.c))
    BOX3D_OBJECTS := $(patsubst $(BOX3D_SOURCE)/%.c,/usr/src/box3d/build/%.o,$(BOX3D_SOURCES))
    MATH_COMPAT_OBJECT := /usr/src/dolly/gamedev/build/math-compat.o
    
    .PHONY: all
    
    all: /usr/lib/libm.a /usr/lib/libraylib.a /usr/lib/libbox3d.a /usr/lib/libdolly-raylib.a
    
    /usr/src/raylib/build/%.o: $(RAYLIB_SOURCE)/%.c
    	mkdir -p /usr/src/raylib/build
    	$(CC) -std=gnu99 -O2 -D_GNU_SOURCE -DPLATFORM_MEMORY -DGRAPHICS_API_OPENGL_SOFTWARE -DSUPPORT_CUSTOM_FRAME_CONTROL=1 -DSW_FRAMEBUFFER_OUTPUT_BGRA=0 -fno-strict-aliasing -fno-builtin -I $(RAYLIB_SOURCE) -c $< -o $@
    
    # rtext.c triggers the embedded LLVM backend's current high-optimization
    # memory/trap limit. Text layout is not the software 3D render hot path, so
    # keep this one upstream translation unit at the reliable bootstrap level.
    /usr/src/raylib/build/rtext.o: $(RAYLIB_SOURCE)/rtext.c
    	mkdir -p /usr/src/raylib/build
    	$(CC) -std=gnu99 -O0 -D_GNU_SOURCE -DPLATFORM_MEMORY -DGRAPHICS_API_OPENGL_SOFTWARE -DSUPPORT_CUSTOM_FRAME_CONTROL=1 -DSW_FRAMEBUFFER_OUTPUT_BGRA=0 -fno-strict-aliasing -fno-builtin -I $(RAYLIB_SOURCE) -c $< -o $@
    
    /usr/lib/libraylib.a: $(RAYLIB_OBJECTS)
    	$(AR) rcs $@ $(RAYLIB_OBJECTS)
    	cp $(RAYLIB_SOURCE)/raylib.h /usr/include/raylib.h
    	cp $(RAYLIB_SOURCE)/raymath.h /usr/include/raymath.h
    	cp $(RAYLIB_SOURCE)/rlgl.h /usr/include/rlgl.h
    
    /usr/src/box3d/build/%.o: $(BOX3D_SOURCE)/%.c
    	mkdir -p /usr/src/box3d/build
    	$(CC) -std=gnu17 -O2 -fno-builtin -U__SIZEOF_INT128__ -DBOX3D_DISABLE_SIMD -I /usr/src/box3d/include -I $(BOX3D_SOURCE) -c $< -o $@
    
    /usr/src/box3d/build/platform.o: /usr/src/dolly/gamedev/box3d-platform.c
    	mkdir -p /usr/src/box3d/build
    	$(CC) -std=gnu17 -O2 -fno-builtin -U__SIZEOF_INT128__ -DBOX3D_DISABLE_SIMD -I /usr/src/box3d/include -I $(BOX3D_SOURCE) -c $< -o $@
    
    /usr/lib/libbox3d.a: $(BOX3D_OBJECTS) /usr/src/box3d/build/platform.o
    	$(AR) rcs $@ $^
    	mkdir -p /usr/include/box3d
    	cp /usr/src/box3d/include/box3d/*.h /usr/include/box3d
    
    $(MATH_COMPAT_OBJECT): /usr/src/dolly/gamedev/math-compat.c
    	mkdir -p /usr/src/dolly/gamedev/build
    	$(CC) -std=c17 -O2 -fno-builtin -fno-sanitize-coverage -c $< -o $@
    
    /usr/lib/libm.a: $(MATH_COMPAT_OBJECT)
    	$(AR) rcs $@ $^
    
    /usr/lib/libdolly-raylib.a: /usr/src/dolly/gamedev/dolly-raylib.c /usr/src/dolly/gamedev/dolly-raylib.h /usr/lib/libraylib.a
    	mkdir -p /usr/include/dolly /usr/src/dolly/gamedev/build
    	cp /usr/src/dolly/gamedev/dolly-raylib.h /usr/include/dolly/raylib.h
    	$(CC) -std=c17 -O2 -fno-builtin -I /usr/src/dolly/gamedev -c /usr/src/dolly/gamedev/dolly-raylib.c -o /usr/src/dolly/gamedev/build/dolly-raylib.o
    	$(AR) rcs $@ /usr/src/dolly/gamedev/build/dolly-raylib.o

FILE /usr/src/dolly/gamedev/math-compat.c
    #include <math.h>
    #include <stdlib.h>
    
    int abs(int value) { return value < 0 ? -value : value; }
    float asinf(float value) { return (float)asin((double)value); }
    float atan2f(float left, float right) {
      return (float)atan2((double)left, (double)right);
    }
    float ceilf(float value) { return (float)ceil((double)value); }
    float fabsf(float value) { return (float)fabs((double)value); }
    float floorf(float value) { return (float)floor((double)value); }
    double fmax(double left, double right) {
      if (left != left) return right;
      if (right != right) return left;
      return left > right ? left : right;
    }
    double fmin(double left, double right) {
      if (left != left) return right;
      if (right != right) return left;
      return left < right ? left : right;
    }
    float fmodf(float left, float right) {
      return (float)fmod((double)left, (double)right);
    }
    float hypotf(float left, float right) {
      return (float)hypot((double)left, (double)right);
    }
    float powf(float left, float right) {
      return (float)pow((double)left, (double)right);
    }
    float roundf(float value) { return (float)round((double)value); }
    float sqrtf(float value) { return (float)sqrt((double)value); }
FILE /usr/src/dolly/gamedev/box3d-platform.c
    #define _POSIX_C_SOURCE 200809L
    
    // Dolly's Box3D target adapter replaces upstream timer.c. Box3D's built-in
    // scheduler links pthread primitives even when the normal one-worker world
    // never creates a thread. Dolly deliberately executes tasks serially inside
    // one Wasm userspace, so synchronization objects carry no host capability and
    // worker handles are inert. The scheduler's calling thread still drains every
    // queued task in b3SchedulerFinishTask.
    
    #include "core.h"
    
    #include <stdint.h>
    #include <string.h>
    #include <time.h>
    
    uint64_t b3GetTicks(void) {
      struct timespec now = {0};
      if (clock_gettime(CLOCK_MONOTONIC, &now) != 0) return 0;
      return (uint64_t)now.tv_sec * UINT64_C(1000000000) +
             (uint64_t)now.tv_nsec;
    }
    
    float b3GetMilliseconds(uint64_t ticks) {
      return (float)((double)(b3GetTicks() - ticks) / 1000000.0);
    }
    
    float b3GetMillisecondsAndReset(uint64_t *ticks) {
      const uint64_t now = b3GetTicks();
      const float elapsed = (float)((double)(now - *ticks) / 1000000.0);
      *ticks = now;
      return elapsed;
    }
    
    void b3Yield(void) {}
    void b3Sleep(int milliseconds) { (void)milliseconds; }
    
    struct b3Mutex { unsigned unused; };
    struct b3Semaphore { int count; };
    struct b3Thread { unsigned unused; };
    
    b3Mutex *b3CreateMutex(void) {
      return b3AllocZeroed(sizeof(b3Mutex));
    }
    
    void b3DestroyMutex(b3Mutex *mutex) {
      b3Free(mutex, sizeof(b3Mutex));
    }
    
    void b3LockMutex(b3Mutex *mutex) { (void)mutex; }
    void b3UnlockMutex(b3Mutex *mutex) { (void)mutex; }
    
    b3Semaphore *b3CreateSemaphore(int initial_count) {
      b3Semaphore *semaphore = b3Alloc(sizeof(b3Semaphore));
      semaphore->count = initial_count;
      return semaphore;
    }
    
    void b3DestroySemaphore(b3Semaphore *semaphore) {
      b3Free(semaphore, sizeof(b3Semaphore));
    }
    
    void b3WaitSemaphore(b3Semaphore *semaphore) {
      if (semaphore->count > 0) semaphore->count--;
    }
    
    void b3SignalSemaphore(b3Semaphore *semaphore) {
      semaphore->count++;
    }
    
    b3Thread *b3CreateThread(b3ThreadFunction *function, void *context,
                             const char *name) {
      (void)function;
      (void)context;
      (void)name;
      return b3AllocZeroed(sizeof(b3Thread));
    }
    
    void b3JoinThread(b3Thread *thread) {
      b3Free(thread, sizeof(b3Thread));
    }
    
    // This deterministic djb2 variant is part of upstream timer.c rather than the
    // OS-independent core. Keep the exact algorithm when replacing that complete
    // translation unit so hull and mesh hashes stay compatible with upstream.
    uint32_t b3Hash(uint32_t hash, const uint8_t *data, int count) {
      uint32_t result = hash;
      int index = 0;
      while (index + 8 <= count) {
        uint64_t word;
        memcpy(&word, data + index, sizeof(word));
    #if defined(__BYTE_ORDER__) && __BYTE_ORDER__ == __ORDER_BIG_ENDIAN__
        word = ((word & UINT64_C(0x00000000000000ff)) << 56) |
               ((word & UINT64_C(0x000000000000ff00)) << 40) |
               ((word & UINT64_C(0x0000000000ff0000)) << 24) |
               ((word & UINT64_C(0x00000000ff000000)) << 8) |
               ((word & UINT64_C(0x000000ff00000000)) >> 8) |
               ((word & UINT64_C(0x0000ff0000000000)) >> 24) |
               ((word & UINT64_C(0x00ff000000000000)) >> 40) |
               ((word & UINT64_C(0xff00000000000000)) >> 56);
    #endif
        result = (result << 5) + result + (uint32_t)word;
        result = (result << 5) + result + (uint32_t)(word >> 32);
        index += 8;
      }
      while (index < count) {
        result = (result << 5) + result + data[index];
        index++;
      }
      return result;
    }
FILE /usr/src/dolly/gamedev/dolly-raylib.c
    #include "dolly-raylib.h"
    
    #include <rlgl.h>
    
    #include <errno.h>
    #include <stddef.h>
    #include <stdio.h>
    #include <string.h>
    #include <termios.h>
    
    // Upstream PLATFORM_MEMORY polls a Unix tty. Dolly supplies input through
    // dolly_display_next_event(), so satisfy those unreachable backend hooks
    // locally instead of growing the command ABI with a second input path.
    int tcgetattr(int descriptor, struct termios *attributes) {
      (void)descriptor;
      (void)attributes;
      errno = ENOTTY;
      return -1;
    }
    
    int tcsetattr(int descriptor, int action, const struct termios *attributes) {
      (void)descriptor;
      (void)action;
      (void)attributes;
      errno = ENOTTY;
      return -1;
    }
    
    int getchar(void) { return EOF; }
    
    int dolly_raylib_open_sized(dolly_raylib *context, const char *title,
                                uint32_t max_width, uint32_t max_height) {
      if (context == NULL || max_width == 0 || max_height == 0) return -EINVAL;
      memset(context, 0, sizeof(*context));
      int status = dolly_display_acquire(&context->surface);
      if (status != 0) return status;
    
      uint32_t width = context->surface.width;
      uint32_t height = context->surface.height;
      if (width > max_width || height > max_height) {
        if ((uint64_t)width * max_height > (uint64_t)height * max_width) {
          height = (uint32_t)((uint64_t)height * max_width / width);
          width = max_width;
        } else {
          width = (uint32_t)((uint64_t)width * max_height / height);
          height = max_height;
        }
        if (width == 0) width = 1;
        if (height == 0) height = 1;
        status = dolly_display_set_size(context->surface.generation, width, height,
                                        &context->surface);
        if (status != 0) {
          dolly_display_release(context->surface.generation);
          memset(context, 0, sizeof(*context));
          return status;
        }
      }
    
      InitWindow((int)context->surface.width, (int)context->surface.height, title);
      if (!IsWindowReady()) {
        dolly_display_release(context->surface.generation);
        memset(context, 0, sizeof(*context));
        return -EIO;
      }
      SetTraceLogLevel(LOG_WARNING);
      context->open = 1;
      return 0;
    }
    
    int dolly_raylib_open(dolly_raylib *context, const char *title) {
      return dolly_raylib_open_sized(context, title, 800, 450);
    }
    
    int dolly_raylib_end_frame(dolly_raylib *context) {
      if (context == NULL || !context->open) return -EINVAL;
      // SUPPORT_CUSTOM_FRAME_CONTROL makes EndDrawing flush raylib's render batch
      // without copying into PLATFORM_MEMORY's private presentation buffer or
      // sleeping. Dolly supplies both presentation and pacing below.
      EndDrawing();
    
      dolly_display_frame frame;
      int status = dolly_display_begin_frame(context->surface.generation, &frame);
      if (status == 0 && frame.pixel_format == DOLLY_DISPLAY_PIXEL_RGBA8 &&
          frame.width == context->surface.width &&
          frame.height == context->surface.height &&
          (size_t)frame.stride * frame.height <= frame.capacity) {
        rlCopyFramebuffer(0, 0, (int)frame.width, (int)frame.height,
                          PIXELFORMAT_UNCOMPRESSED_R8G8B8A8, frame.pixels);
        status = dolly_display_present(context->surface.generation,
                                       frame.buffer_index);
      } else if (status == 0) {
        status = -EIO;
      }
      return status;
    }
    
    int dolly_raylib_wait_frame(dolly_raylib *context,
                                double timeout_milliseconds) {
      if (context == NULL || !context->open) return -EINVAL;
      return dolly_display_wait_frame(context->surface.generation,
                                      &context->animation_frame_sequence,
                                      timeout_milliseconds);
    }
    
    int dolly_raylib_set_cursor(dolly_raylib *context, uint32_t cursor) {
      if (context == NULL || !context->open) return -EINVAL;
      return dolly_display_set_cursor(context->surface.generation, cursor);
    }
    
    int dolly_raylib_next_event(dolly_raylib *context, dolly_input_event *event,
                                double timeout_milliseconds) {
      if (context == NULL || !context->open) return -EINVAL;
      return dolly_display_next_event(context->surface.generation, event,
                                      timeout_milliseconds);
    }
    
    int dolly_raylib_close(dolly_raylib *context) {
      if (context == NULL || !context->open) return -EINVAL;
      CloseWindow();
      int status = dolly_display_release(context->surface.generation);
      memset(context, 0, sizeof(*context));
      return status;
    }
    
    int dolly_raylib_code_is(const dolly_input_event *event, const char *code) {
      if (event == NULL || code == NULL || event->type != DOLLY_INPUT_EVENT_KEY)
        return 0;
      size_t length = strlen(code);
      return event->code_length == length &&
             memcmp(event->data + event->key_length, code, length) == 0;
    }
FILE /usr/src/dolly/gamedev/dolly-raylib.h
    #ifndef DOLLY_RAYLIB_H
    #define DOLLY_RAYLIB_H
    
    #include <dolly/display.h>
    #include <raylib.h>
    
    typedef struct {
      dolly_display_surface surface;
      uint32_t animation_frame_sequence;
      int open;
    } dolly_raylib;
    
    // PLATFORM_MEMORY renders wholly inside Wasm. The adapter copies its completed
    // software frame directly into Dolly's inactive buffer without an intermediate
    // raylib Image. The default open caps software rendering at 800x450; callers
    // can choose another upper bound while retaining the browser viewport ratio.
    int dolly_raylib_open(dolly_raylib *context, const char *title);
    int dolly_raylib_open_sized(dolly_raylib *context, const char *title,
                                uint32_t max_width, uint32_t max_height);
    int dolly_raylib_end_frame(dolly_raylib *context);
    int dolly_raylib_wait_frame(dolly_raylib *context, double timeout_milliseconds);
    int dolly_raylib_set_cursor(dolly_raylib *context, uint32_t cursor);
    int dolly_raylib_next_event(dolly_raylib *context, dolly_input_event *event,
                                double timeout_milliseconds);
    int dolly_raylib_close(dolly_raylib *context);
    int dolly_raylib_code_is(const dolly_input_event *event, const char *code);
    
    #endif
SLOP tar \
  -xf /tmp/raylib.tar \
  -C /
SLOP tar \
  -xf /tmp/box3d.tar \
  -C /
SLOP CWD /usr/src/dolly/gamedev make \
  -f /usr/src/dolly/gamedev/sdk.mk

FILE /usr/include/raymath.h
FILE /usr/include/rlgl.h
FILE /usr/share/licenses/raylib/LICENSE
FILE /usr/share/licenses/box3d/LICENSE
FOLDER /usr/src/raylib
FOLDER /usr/src/box3d

EXPORTS LIB    raylib       /usr/lib/libraylib.a
EXPORTS LIB    box3d        /usr/lib/libbox3d.a
EXPORTS LIB    dolly-raylib /usr/lib/libdolly-raylib.a
EXPORTS LIB    m            /usr/lib/libm.a
EXPORTS HEADER raylib       /usr/include/raylib.h
EXPORTS HEADER box3d        /usr/include/box3d
EXPORTS HEADER dolly-raylib /usr/include/dolly/raylib.h

SLOP rm \
  -rf \
  /tmp/box3d.tar \
  /usr/src/raylib/build \
  /usr/src/box3d/build \
  /usr/src/dolly/gamedev/build \
  /tmp/raylib.tar
