DOLLY 2
MODULE gamedev

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

FILE /usr/src/dolly/gamedev/gamedev.mk
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
    
    all: /usr/lib/libm.a /usr/lib/libraylib.a /usr/lib/libbox3d.a /usr/lib/libdolly-raylib.a /usr/bin/graphics-demo
    
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
    
    /usr/bin/graphics-demo: /usr/src/dolly/gamedev/graphics-demo.c /usr/lib/libdolly-raylib.a /usr/lib/libraylib.a /usr/lib/libbox3d.a /usr/lib/libm.a
    	$(CC) -std=c17 -O2 -fno-builtin $< -o $@ -ldolly-raylib -lraylib -lbox3d -lm
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
    #include <time.h>
    
    // Upstream PLATFORM_MEMORY polls a Unix tty and optionally sleeps after each
    // frame. Dolly supplies input through dolly_display_next_event(), which already
    // provides the frame wait, so satisfy those unreachable backend hooks locally
    // instead of growing the command ABI with a second input path.
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
    
    int nanosleep(const struct timespec *duration, struct timespec *remaining) {
      (void)duration;
      if (remaining != NULL) memset(remaining, 0, sizeof(*remaining));
      return 0;
    }
    
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
FILE /usr/src/dolly/gamedev/graphics-demo.c
    #define _POSIX_C_SOURCE 200809L
    
    #include <box3d/box3d.h>
    #include <dolly/raylib.h>
    #include <rlgl.h>
    
    #include <errno.h>
    #include <math.h>
    #include <stdio.h>
    #include <stdlib.h>
    #include <string.h>
    #include <time.h>
    
    enum { MAX_BODIES = 80, TARGET_COUNT = 3 };
    
    typedef enum {
      BODY_BOX,
      BODY_SPHERE,
    } body_shape;
    
    typedef struct {
      b3BodyId body;
      body_shape shape;
      Vector3 size;
      Color color;
      int target;
    } game_body;
    
    typedef struct {
      b3WorldId world;
      b3BodyId player;
      b3BodyId anchor;
      b3BodyId pendulum;
      game_body bodies[MAX_BODIES];
      int body_count;
      b3BodyId targets[TARGET_COUNT];
      b3Pos target_origins[TARGET_COUNT];
      int collected[TARGET_COUNT];
      int score;
      int forward;
      int backward;
      int left;
      int right;
      int jump_requested;
      int explosion_requested;
      int reset_requested;
      float explosion_flash;
    } game;
    
    static const Color COLOR_INK = {236, 232, 220, 255};
    static const Color COLOR_MUTED = {126, 126, 118, 255};
    static const Color COLOR_YELLOW = {242, 212, 92, 255};
    static const Color COLOR_ORANGE = {206, 126, 67, 255};
    static const Color COLOR_BLUE = {82, 132, 147, 255};
    static const Color COLOR_BACKGROUND = {31, 32, 30, 255};
    static const Color COLOR_PANEL = {45, 46, 43, 255};
    
    static int usage(const char *program, int status) {
      fprintf(status == 0 ? stdout : stderr,
              "usage: %s [--frames COUNT]\n"
              "WASD/arrows move, Space jumps, E/click explodes, R resets, "
              "Q/Escape exits\n",
              program);
      return status;
    }
    
    static double monotonic_seconds(void) {
      struct timespec now = {0};
      if (clock_gettime(CLOCK_MONOTONIC, &now) != 0) return 0;
      return (double)now.tv_sec + (double)now.tv_nsec / 1000000000.0;
    }
    
    static Vector3 ray_vector(b3Pos value) {
      return (Vector3){(float)value.x, (float)value.y, (float)value.z};
    }
    
    static int remember_body(game *state, b3BodyId body, body_shape shape,
                             Vector3 size, Color color, int target) {
      if (state->body_count >= MAX_BODIES) return -1;
      state->bodies[state->body_count++] =
          (game_body){body, shape, size, color, target};
      return 0;
    }
    
    static b3BodyId add_box(game *state, b3Pos position, Vector3 half_size,
                            b3BodyType type, b3Quat rotation, Color color) {
      b3BodyDef body_definition = b3DefaultBodyDef();
      body_definition.type = type;
      body_definition.position = position;
      body_definition.rotation = rotation;
      b3BodyId body = b3CreateBody(state->world, &body_definition);
    
      b3BoxHull box = b3MakeBoxHull(half_size.x, half_size.y, half_size.z);
      b3ShapeDef shape = b3DefaultShapeDef();
      shape.density = 1.0f;
      shape.baseMaterial.friction = 0.72f;
      shape.baseMaterial.restitution = 0.05f;
      b3CreateHullShape(body, &shape, &box.base);
      remember_body(state, body, BODY_BOX, half_size, color, -1);
      return body;
    }
    
    static b3BodyId add_sphere(game *state, b3Pos position, float radius,
                               b3BodyType type, Color color, int target) {
      b3BodyDef body_definition = b3DefaultBodyDef();
      body_definition.type = type;
      body_definition.position = position;
      b3BodyId body = b3CreateBody(state->world, &body_definition);
    
      b3Sphere sphere = {{0.0f, 0.0f, 0.0f}, radius};
      b3ShapeDef shape = b3DefaultShapeDef();
      shape.density = target >= 0 ? 0.7f : 1.3f;
      shape.baseMaterial.friction = 0.65f;
      shape.baseMaterial.restitution = target >= 0 ? 0.42f : 0.18f;
      b3CreateSphereShape(body, &shape, &sphere);
      remember_body(state, body, BODY_SPHERE,
                    (Vector3){radius, radius, radius}, color, target);
      return body;
    }
    
    static void add_tower(game *state, int target, float x, float z,
                          Color first, Color second) {
      const Vector3 block = {1.05f, 0.32f, 0.32f};
      for (int level = 0; level < 6; ++level) {
        int turn = level & 1;
        for (int column = -1; column <= 1; ++column) {
          b3Pos position = {x + (turn ? column * 0.72f : 0.0f),
                            0.34f + level * 0.66f,
                            z + (turn ? 0.0f : column * 0.72f)};
          Vector3 half_size = turn ? (Vector3){0.32f, block.y, block.x}
                                   : block;
          add_box(state, position, half_size, b3_dynamicBody, b3Quat_identity,
                  ((level + column) & 1) ? first : second);
        }
      }
    
      b3Pos core_position = {x, 4.45f, z};
      b3BodyId core = add_sphere(state, core_position, 0.48f, b3_dynamicBody,
                                 COLOR_YELLOW, target);
      state->targets[target] = core;
      state->target_origins[target] = core_position;
    }
    
    static int reset_world(game *state) {
      if (state->world.index1 != 0) b3DestroyWorld(state->world);
      memset(state, 0, sizeof(*state));
    
      b3WorldDef world_definition = b3DefaultWorldDef();
      world_definition.gravity = (b3Vec3){0.0f, -13.0f, 0.0f};
      world_definition.workerCount = 1;
      state->world = b3CreateWorld(&world_definition);
      if (state->world.index1 == 0) return -1;
    
      add_box(state, (b3Pos){0.0f, -0.55f, 0.0f},
              (Vector3){11.0f, 0.55f, 8.0f}, b3_staticBody, b3Quat_identity,
              COLOR_PANEL);
      add_box(state, (b3Pos){-11.1f, 2.0f, 0.0f},
              (Vector3){0.2f, 2.5f, 8.0f}, b3_staticBody, b3Quat_identity,
              COLOR_MUTED);
      add_box(state, (b3Pos){11.1f, 2.0f, 0.0f},
              (Vector3){0.2f, 2.5f, 8.0f}, b3_staticBody, b3Quat_identity,
              COLOR_MUTED);
      add_box(state, (b3Pos){0.0f, 2.0f, -8.1f},
              (Vector3){11.0f, 2.5f, 0.2f}, b3_staticBody, b3Quat_identity,
              COLOR_MUTED);
      add_box(state, (b3Pos){-7.1f, 0.7f, 2.2f},
              (Vector3){2.3f, 0.22f, 1.35f}, b3_staticBody,
              b3MakeQuatFromAxisAngle(b3Vec3_axisZ, -0.20f), COLOR_MUTED);
      add_box(state, (b3Pos){7.1f, 0.7f, 2.2f},
              (Vector3){2.3f, 0.22f, 1.35f}, b3_staticBody,
              b3MakeQuatFromAxisAngle(b3Vec3_axisZ, 0.20f), COLOR_MUTED);
    
      add_tower(state, 0, -5.1f, -1.8f, COLOR_BLUE, COLOR_ORANGE);
      add_tower(state, 1, 0.0f, -3.2f, COLOR_ORANGE, COLOR_BLUE);
      add_tower(state, 2, 5.1f, -1.8f, COLOR_BLUE, COLOR_ORANGE);
    
      state->player = add_sphere(state, (b3Pos){0.0f, 1.0f, 5.0f}, 0.62f,
                                 b3_dynamicBody, COLOR_YELLOW, -1);
    
      state->anchor = add_sphere(state, (b3Pos){0.0f, 7.5f, 1.8f}, 0.16f,
                                 b3_staticBody, COLOR_YELLOW, -1);
      state->pendulum = add_sphere(state, (b3Pos){3.5f, 5.0f, 1.8f}, 0.72f,
                                   b3_dynamicBody, COLOR_ORANGE, -1);
      b3DistanceJointDef rope = b3DefaultDistanceJointDef();
      rope.base.bodyIdA = state->anchor;
      rope.base.bodyIdB = state->pendulum;
      rope.length = 4.3f;
      rope.enableSpring = true;
      rope.hertz = 1.8f;
      rope.dampingRatio = 0.08f;
      rope.lowerSpringForce = -5000.0f;
      rope.upperSpringForce = 5000.0f;
      b3CreateDistanceJoint(state->world, &rope);
      b3Body_ApplyLinearImpulseToCenter(state->pendulum,
                                        (b3Vec3){0.0f, 0.0f, -18.0f}, true);
      return 0;
    }
    
    static void draw_body(const game_body *body) {
      b3Pos position = b3Body_GetPosition(body->body);
      if (body->shape == BODY_SPHERE) {
        DrawSphereEx(ray_vector(position), body->size.x, 8, 12, body->color);
        DrawSphereWires(ray_vector(position), body->size.x, 6, 8,
                        Fade(COLOR_INK, 0.34f));
        return;
      }
    
      b3Quat rotation = b3Body_GetRotation(body->body);
      float radians = 0.0f;
      b3Vec3 axis = b3GetAxisAngle(&radians, rotation);
      float axis_length_squared =
          axis.x * axis.x + axis.y * axis.y + axis.z * axis.z;
      Vector3 rotation_axis = axis_length_squared < 0.000001f
                                  ? (Vector3){0.0f, 1.0f, 0.0f}
                                  : (Vector3){axis.x, axis.y, axis.z};
      Vector3 size = {body->size.x * 2.0f, body->size.y * 2.0f,
                      body->size.z * 2.0f};
      rlPushMatrix();
      rlTranslatef((float)position.x, (float)position.y, (float)position.z);
      rlRotatef(radians * RAD2DEG, rotation_axis.x, rotation_axis.y,
                rotation_axis.z);
      DrawCubeV((Vector3){0.0f, 0.0f, 0.0f}, size, body->color);
      DrawCubeWiresV((Vector3){0.0f, 0.0f, 0.0f}, size,
                     Fade(COLOR_INK, 0.26f));
      rlPopMatrix();
    }
    
    static void draw_text(Font font, const char *text, float x, float y,
                          float size, Color color) {
      DrawTextEx(font, text, (Vector2){x, y}, size, 1.0f, color);
    }
    
    static float measure_text(Font font, const char *text, float size) {
      return MeasureTextEx(font, text, size, 1.0f).x;
    }
    
    static void draw_scene(game *state, Font font, int width, int height,
                           unsigned long frame) {
      b3Pos player_position = b3Body_GetPosition(state->player);
      float camera_sway = sinf((float)frame * 0.006f) * 0.7f;
      Camera3D camera = {0};
      camera.position = (Vector3){(float)player_position.x * 0.10f + camera_sway,
                                  11.5f, 18.5f};
      camera.target = (Vector3){0.0f, 2.2f, -0.8f};
      camera.up = (Vector3){0.0f, 1.0f, 0.0f};
      camera.fovy = 45.0f;
      camera.projection = CAMERA_PERSPECTIVE;
    
      BeginDrawing();
      ClearBackground(COLOR_BACKGROUND);
      DrawRectangleGradientV(0, 0, width, height,
                             (Color){47, 49, 46, 255}, COLOR_BACKGROUND);
    
      BeginMode3D(camera);
      DrawGrid(22, 1.0f);
      for (int index = 0; index < state->body_count; ++index)
        draw_body(&state->bodies[index]);
    
      b3Pos anchor = b3Body_GetPosition(state->anchor);
      b3Pos pendulum = b3Body_GetPosition(state->pendulum);
      DrawLine3D(ray_vector(anchor), ray_vector(pendulum), COLOR_YELLOW);
    
      if (state->explosion_flash > 0.0f) {
        DrawSphereWires(ray_vector(player_position),
                        4.2f * (1.0f - state->explosion_flash) + 0.7f, 8, 12,
                        Fade(COLOR_YELLOW, state->explosion_flash));
      }
      EndMode3D();
    
      DrawRectangleRounded((Rectangle){16, 14, 342, 68}, 0.18f, 6,
                           Fade(COLOR_PANEL, 0.95f));
      draw_text(font, "DOLLY BOXFALL 3D", 29, 21, 23, COLOR_YELLOW);
      draw_text(font, "WASD move  SPACE jump  E blast  R reset  Q exit",
                29, 52, 14, COLOR_INK);
    
      char score[32];
      snprintf(score, sizeof(score), "%d / %d CORES", state->score,
               TARGET_COUNT);
      float score_width = measure_text(font, score, 22);
      draw_text(font, score, (float)width - score_width - 23, 22, 22,
                state->score == TARGET_COUNT ? COLOR_YELLOW : COLOR_INK);
      if (state->score == TARGET_COUNT) {
        const char *message = "ALL TOWERS DOWN";
        float message_width = measure_text(font, message, 32);
        DrawRectangle((int)((float)width / 2 - message_width / 2 - 17),
                      height / 2 - 31, (int)message_width + 34, 56,
                      Fade(COLOR_PANEL, 0.92f));
        draw_text(font, message, (float)width / 2 - message_width / 2,
                  (float)height / 2 - 17, 32, COLOR_YELLOW);
      }
    }
    
    static int event_is_quit(const dolly_input_event *event) {
      return event->type == DOLLY_INPUT_EVENT_KEY &&
             event->action != DOLLY_KEY_ACTION_RELEASE &&
             (dolly_raylib_code_is(event, "Escape") ||
              dolly_raylib_code_is(event, "KeyQ"));
    }
    
    static void handle_event(game *state, const dolly_input_event *event) {
      if (event->type == DOLLY_INPUT_EVENT_KEY) {
        int down = event->action != DOLLY_KEY_ACTION_RELEASE;
        if (dolly_raylib_code_is(event, "KeyW") ||
            dolly_raylib_code_is(event, "ArrowUp"))
          state->forward = down;
        if (dolly_raylib_code_is(event, "KeyS") ||
            dolly_raylib_code_is(event, "ArrowDown"))
          state->backward = down;
        if (dolly_raylib_code_is(event, "KeyA") ||
            dolly_raylib_code_is(event, "ArrowLeft"))
          state->left = down;
        if (dolly_raylib_code_is(event, "KeyD") ||
            dolly_raylib_code_is(event, "ArrowRight"))
          state->right = down;
        if (down && dolly_raylib_code_is(event, "Space"))
          state->jump_requested = 1;
        if (down && dolly_raylib_code_is(event, "KeyE"))
          state->explosion_requested = 1;
        if (down && dolly_raylib_code_is(event, "KeyR"))
          state->reset_requested = 1;
      } else if (event->type == DOLLY_INPUT_EVENT_POINTER &&
                 event->action == DOLLY_POINTER_ACTION_PRESS) {
        state->explosion_requested = 1;
      }
    }
    
    static void update_game(game *state) {
      b3Vec3 velocity = b3Body_GetLinearVelocity(state->player);
      velocity.x = (float)(state->right - state->left) * 6.5f;
      velocity.z = (float)(state->backward - state->forward) * 6.5f;
      b3Body_SetLinearVelocity(state->player, velocity);
    
      if (state->jump_requested) {
        if (fabsf(velocity.y) < 2.0f)
          b3Body_ApplyLinearImpulseToCenter(state->player,
                                            (b3Vec3){0.0f, 7.0f, 0.0f}, true);
        state->jump_requested = 0;
      }
      if (state->explosion_requested) {
        b3ExplosionDef explosion = b3DefaultExplosionDef();
        explosion.position = b3Body_GetPosition(state->player);
        explosion.radius = 0.7f;
        explosion.falloff = 4.5f;
        explosion.impulsePerArea = 34.0f;
        b3World_Explode(state->world, &explosion);
        state->explosion_flash = 1.0f;
        state->explosion_requested = 0;
      }
    
      b3World_Step(state->world, 1.0f / 60.0f, 4);
      if (state->explosion_flash > 0.0f) {
        state->explosion_flash -= 0.055f;
        if (state->explosion_flash < 0.0f) state->explosion_flash = 0.0f;
      }
    
      for (int index = 0; index < TARGET_COUNT; ++index) {
        if (state->collected[index]) continue;
        b3Pos position = b3Body_GetPosition(state->targets[index]);
        double dx = position.x - state->target_origins[index].x;
        double dz = position.z - state->target_origins[index].z;
        if (position.y < 2.0 || dx * dx + dz * dz > 5.0) {
          state->collected[index] = 1;
          state->score++;
        }
      }
    
      b3Pos position = b3Body_GetPosition(state->player);
      if (position.y < -5.0) {
        b3Body_SetTransform(state->player, (b3Pos){0.0f, 2.0f, 5.0f},
                            b3Quat_identity);
        b3Body_SetLinearVelocity(state->player, b3Vec3_zero);
      }
    }
    
    int main(int argc, char **argv) {
      unsigned long frame_limit = 0;
      if (argc == 2 && strcmp(argv[1], "--help") == 0) return usage(argv[0], 0);
      if (argc == 3 && strcmp(argv[1], "--frames") == 0) {
        char *end = NULL;
        errno = 0;
        frame_limit = strtoul(argv[2], &end, 10);
        if (errno != 0 || end == argv[2] || *end != '\0' || frame_limit == 0)
          return usage(argv[0], 2);
      } else if (argc != 1) {
        return usage(argv[0], 2);
      }
    
      dolly_raylib graphics;
      int status =
          dolly_raylib_open_sized(&graphics, "Dolly Boxfall 3D", 640, 360);
      if (status != 0) {
        fprintf(stderr, "graphics-demo: display initialization failed: %s\n",
                strerror(-status));
        return 1;
      }
      if (dolly_raylib_set_cursor(&graphics, DOLLY_DISPLAY_CURSOR_CROSSHAIR) != 0) {
        dolly_raylib_close(&graphics);
        fputs("graphics-demo: could not select the game cursor\n", stderr);
        return 1;
      }
    
      Font font = LoadFontEx("/usr/share/fonts/IosevkaTerm-SemiBold.ttf", 32,
                             NULL, 0);
      if (!IsFontValid(font)) {
        dolly_raylib_close(&graphics);
        fputs("graphics-demo: could not load the sandbox font\n", stderr);
        return 1;
      }
      game state = {0};
      if (reset_world(&state) != 0) {
        UnloadFont(font);
        dolly_raylib_close(&graphics);
        fputs("graphics-demo: could not create the Box3D world\n", stderr);
        return 1;
      }
    
      int result = 0;
      int quit = 0;
      unsigned long frame = 0;
      double previous_time = monotonic_seconds();
      double physics_accumulator = 0.0;
      while (!quit && (frame_limit == 0 || frame < frame_limit)) {
        if (frame != 0) {
          status = dolly_raylib_wait_frame(&graphics, 1000.0);
          if (status < 0) {
            result = 1;
            break;
          }
        }
    
        dolly_input_event event;
        do {
          status = dolly_raylib_next_event(&graphics, &event, 0);
          if (status < 0) {
            result = 1;
            quit = 1;
            break;
          }
          if (status == 1) {
            if (event_is_quit(&event)) quit = 1;
            handle_event(&state, &event);
          }
        } while (status == 1 && !quit);
        if (quit) break;
    
        if (state.reset_requested) {
          if (reset_world(&state) != 0) {
            result = 1;
            break;
          }
        }
    
        double now = monotonic_seconds();
        double elapsed = previous_time > 0.0 && now >= previous_time
                             ? now - previous_time
                             : 1.0 / 60.0;
        previous_time = now;
        if (elapsed > 0.1) elapsed = 0.1;
        physics_accumulator += elapsed;
        for (int steps = 0; physics_accumulator >= 1.0 / 60.0 && steps < 6;
             ++steps, physics_accumulator -= 1.0 / 60.0)
          update_game(&state);
    
        draw_scene(&state, font, (int)graphics.surface.width,
                   (int)graphics.surface.height, frame);
        if (dolly_raylib_end_frame(&graphics) != 0) {
          result = 1;
          break;
        }
        ++frame;
      }
    
      b3DestroyWorld(state.world);
      UnloadFont(font);
      if (dolly_raylib_close(&graphics) != 0) result = 1;
      if (result == 0) puts("graphics-demo: terminal restored");
      return result;
    }
FILE /home/dolly/.pi/agent/skills/dolly-gamedev/SKILL.md
    ---
    name: dolly-gamedev
    description: Build interactive C games in Dolly with raylib 6, Box3D 0.1, and the exclusive in-Wasm framebuffer.
    ---
    
    # Dolly gamedev
    
    Use raylib for software-rendered 2D or 3D graphics and Box3D for three-dimensional
    rigid-body physics. Both are pinned upstream libraries compiled from source,
    sequentially, while `Dollyfile-gamedev` executes.
    
    ## Installed surface
    
    - raylib 6.0: `/usr/include/raylib.h`, `/usr/include/raymath.h`,
      `/usr/include/rlgl.h`, and `/usr/lib/libraylib.a`
    - Box3D 0.1.0: `/usr/include/box3d/` and `/usr/lib/libbox3d.a`
    - Dolly presentation adapter: `/usr/include/dolly/raylib.h` and
      `/usr/lib/libdolly-raylib.a`
    - Retained source: `/usr/src/raylib`, `/usr/src/box3d`, and
      `/usr/src/dolly/gamedev`
    - Example 3D physics game: `/usr/src/dolly/gamedev/graphics-demo.c`
    
    Build a game with:
    
    ```make
    game: game.c
    	cc -std=c17 game.c -o game -ldolly-raylib -lraylib -lbox3d -lm
    ```
    
    ## Frame loop
    
    Call `dolly_raylib_open()` once. For each frame, call raylib `BeginDrawing()`,
    draw normally, then call `dolly_raylib_end_frame()` instead of `EndDrawing()`.
    Call `dolly_raylib_wait_frame()` once per loop for browser animation-frame
    pacing. Read semantic browser events with `dolly_raylib_next_event()` and use
    `dolly_raylib_set_cursor()` with a `DOLLY_DISPLAY_CURSOR_*` value when the game
    needs a pointer style. Close with `dolly_raylib_close()` on every exit path.
    The runtime also releases a stranded lease when a foreground command exits or
    is interrupted.
    
    The raylib build uses upstream `PLATFORM_MEMORY`, so rendering stays in Wasm.
    The adapter asks raylib's software rasterizer to copy directly into Dolly's
    inactive RGBA buffer, with no intermediate `Image` allocation. The browser
    only presents that buffer. `dolly_raylib_open()` caps rendering at 800x450;
    for a software-rendered 3D scene, prefer
    `dolly_raylib_open_sized(..., 640, 360)`. The viewport aspect ratio is
    preserved and the browser scales the completed frame to its canvas.
    
    There is no DOM, canvas, WebGL, browser callback, host filesystem, or socket
    API inside a game. Keep automated checks finite with a `--frames N` option.
    
    ## Box3D
    
    Box3D uses opaque IDs, `b3Vec3`/`b3Pos`, quaternions, and C17. Initialize every
    definition with its default helper, such as `b3DefaultWorldDef()` or
    `b3DefaultBodyDef()`. Make boxes with `b3MakeBoxHull()` and
    `b3CreateHullShape()`. Use `b3CreateSphereShape()` for spheres and step with a
    fixed timestep, normally `b3World_Step(world, 1.0f / 60.0f, 4)`.
    
    Dolly intentionally runs Box3D with one worker. Its small target adapter
    replaces upstream's pthread-based timer/scheduler translation unit with clocks
    and serial task semantics inside the same Wasm userspace. This changes no
    physics API, gives the library no new browser import, and matches Dolly's
    compatibility-over-parallelism runtime model.
SLOP tar \
  -xf /tmp/raylib.tar \
  -C /
SLOP tar \
  -xf /tmp/box3d.tar \
  -C /
SLOP CWD /usr/src/dolly/gamedev make \
  -f /usr/src/dolly/gamedev/gamedev.mk

EXPORTS TOOL graphics-demo

SLOP graphics-demo \
  --help

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
  /tmp/gamedev \
  /tmp/raylib.tar
