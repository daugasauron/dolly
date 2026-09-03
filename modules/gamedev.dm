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
    BUILD_ROOT := /tmp/gamedev
    RAYLIB_SOURCE := /usr/src/raylib/src
    RAYLIB_MODULES := rcore rshapes rtextures rtext rmodels
    RAYLIB_OBJECTS := $(patsubst %,$(BUILD_ROOT)/raylib/%.o,$(RAYLIB_MODULES))
    BOX3D_SOURCE := /usr/src/box3d/src
    BOX3D_SOURCES := $(wildcard $(BOX3D_SOURCE)/*.c)
    BOX3D_OBJECTS := $(patsubst $(BOX3D_SOURCE)/%.c,$(BUILD_ROOT)/box3d/%.o,$(BOX3D_SOURCES))
    BOX3D_DOLLY_OBJECT := $(BUILD_ROOT)/box3d-dolly.o
    
    .PHONY: all
    
    all: /usr/lib/libraylib.a /usr/lib/libbox3d.a /usr/lib/libdolly-raylib.a /usr/bin/graphics-demo
    
    $(BUILD_ROOT)/raylib/%.o: $(RAYLIB_SOURCE)/%.c
    	mkdir -p $(BUILD_ROOT)/raylib
    	$(CC) -std=gnu99 -O2 -D_GNU_SOURCE -DPLATFORM_MEMORY -DGRAPHICS_API_OPENGL_SOFTWARE -fno-strict-aliasing -I $(RAYLIB_SOURCE) -c $< -o $@
    
    /usr/lib/libraylib.a: $(RAYLIB_OBJECTS)
    	$(AR) rcs $@ $(RAYLIB_OBJECTS)
    	cp $(RAYLIB_SOURCE)/raylib.h /usr/include/raylib.h
    	cp $(RAYLIB_SOURCE)/raymath.h /usr/include/raymath.h
    	cp $(RAYLIB_SOURCE)/rlgl.h /usr/include/rlgl.h
    
    $(BUILD_ROOT)/box3d/%.o: $(BOX3D_SOURCE)/%.c
    	mkdir -p $(BUILD_ROOT)/box3d
    	$(CC) -std=gnu17 -O2 -DBOX3D_DISABLE_SIMD -I /usr/src/box3d/include -I $(BOX3D_SOURCE) -c $< -o $@
    
    $(BOX3D_DOLLY_OBJECT): /usr/src/dolly/gamedev/box3d-dolly.c
    	mkdir -p $(BUILD_ROOT)
    	$(CC) -std=c17 -O2 -c $< -o $@
    
    /usr/lib/libbox3d.a: $(BOX3D_OBJECTS) $(BOX3D_DOLLY_OBJECT)
    	$(AR) rcs $@ $(BOX3D_OBJECTS) $(BOX3D_DOLLY_OBJECT)
    	mkdir -p /usr/include/box3d
    	cp /usr/src/box3d/include/box3d/base.h /usr/include/box3d/base.h
    	cp /usr/src/box3d/include/box3d/box3d.h /usr/include/box3d/box3d.h
    	cp /usr/src/box3d/include/box3d/collision.h /usr/include/box3d/collision.h
    	cp /usr/src/box3d/include/box3d/config.h /usr/include/box3d/config.h
    	cp /usr/src/box3d/include/box3d/constants.h /usr/include/box3d/constants.h
    	cp /usr/src/box3d/include/box3d/id.h /usr/include/box3d/id.h
    	cp /usr/src/box3d/include/box3d/math_functions.h /usr/include/box3d/math_functions.h
    	cp /usr/src/box3d/include/box3d/types.h /usr/include/box3d/types.h
    
    /usr/lib/libdolly-raylib.a: /usr/src/dolly/gamedev/dolly-raylib.c /usr/src/dolly/gamedev/dolly-raylib.h /usr/lib/libraylib.a
    	mkdir -p /usr/include/dolly $(BUILD_ROOT)
    	cp /usr/src/dolly/gamedev/dolly-raylib.h /usr/include/dolly/raylib.h
    	$(CC) -std=c17 -O2 -I /usr/src/dolly/gamedev -c /usr/src/dolly/gamedev/dolly-raylib.c -o $(BUILD_ROOT)/dolly-raylib.o
    	$(AR) rcs $@ $(BUILD_ROOT)/dolly-raylib.o
    
    /usr/bin/graphics-demo: /usr/src/dolly/gamedev/graphics-demo.c /usr/lib/libdolly-raylib.a /usr/lib/libraylib.a /usr/lib/libbox3d.a
    	$(CC) -std=c17 -O2 $< -o $@ -ldolly-raylib -lraylib -lbox3d
FILE /usr/src/dolly/gamedev/box3d-dolly.c
    #include <errno.h>
    #include <pthread.h>
    #include <semaphore.h>
    #include <string.h>
    
    // Box3D's Emscripten platform object refers to these primitives even when
    // a world has one worker. Dolly is intentionally single-threaded above its
    // shared-memory machine ABI, so the locks are local no-ops and attempts to
    // create a worker fail explicitly. Keep every Dolly Box3D world at one worker.
    int pthread_mutex_init(pthread_mutex_t *mutex,
                           const pthread_mutexattr_t *attributes) {
      (void)attributes;
      memset(mutex, 0, sizeof(*mutex));
      return 0;
    }
    
    int pthread_mutex_destroy(pthread_mutex_t *mutex) {
      (void)mutex;
      return 0;
    }
    
    int pthread_mutex_lock(pthread_mutex_t *mutex) {
      (void)mutex;
      return 0;
    }
    
    int pthread_mutex_unlock(pthread_mutex_t *mutex) {
      (void)mutex;
      return 0;
    }
    
    int sem_init(sem_t *semaphore, int shared, unsigned value) {
      (void)shared;
      (void)value;
      memset(semaphore, 0, sizeof(*semaphore));
      return 0;
    }
    
    int sem_destroy(sem_t *semaphore) {
      (void)semaphore;
      return 0;
    }
    
    int sem_wait(sem_t *semaphore) {
      (void)semaphore;
      return 0;
    }
    
    int sem_post(sem_t *semaphore) {
      (void)semaphore;
      return 0;
    }
    
    int pthread_create(pthread_t *thread, const pthread_attr_t *attributes,
                       void *(*entry)(void *), void *context) {
      (void)thread;
      (void)attributes;
      (void)entry;
      (void)context;
      return ENOTSUP;
    }
    
    int pthread_join(pthread_t thread, void **result) {
      (void)thread;
      (void)result;
      return ENOTSUP;
    }
FILE /usr/src/dolly/gamedev/dolly-raylib.c
    #include "dolly-raylib.h"
    
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
    
    int dolly_raylib_open(dolly_raylib *context, const char *title) {
      if (context == NULL) return -EINVAL;
      memset(context, 0, sizeof(*context));
      int status = dolly_display_acquire(&context->surface);
      if (status != 0) return status;
    
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
    
    int dolly_raylib_end_frame(dolly_raylib *context) {
      if (context == NULL || !context->open) return -EINVAL;
      EndDrawing();
    
      Image image = LoadImageFromScreen();
      if (!IsImageValid(image) || image.format != PIXELFORMAT_UNCOMPRESSED_R8G8B8A8 ||
          image.width != (int)context->surface.width ||
          image.height != (int)context->surface.height) {
        if (IsImageValid(image)) UnloadImage(image);
        return -EIO;
      }
    
      dolly_display_frame frame;
      int status = dolly_display_begin_frame(context->surface.generation, &frame);
      size_t length = (size_t)image.width * (size_t)image.height * 4;
      if (status == 0 && frame.pixel_format == DOLLY_DISPLAY_PIXEL_RGBA8 &&
          frame.width == context->surface.width &&
          frame.height == context->surface.height && length <= frame.capacity) {
        memcpy(frame.pixels, image.data, length);
        status = dolly_display_present(context->surface.generation,
                                       frame.buffer_index);
      } else if (status == 0) {
        status = -EIO;
      }
      UnloadImage(image);
      return status;
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
      int open;
    } dolly_raylib;
    
    // PLATFORM_MEMORY renders wholly inside Wasm. This adapter leases Dolly's
    // visible framebuffer and copies each completed raylib frame into it.
    int dolly_raylib_open(dolly_raylib *context, const char *title);
    int dolly_raylib_end_frame(dolly_raylib *context);
    int dolly_raylib_next_event(dolly_raylib *context, dolly_input_event *event,
                                double timeout_milliseconds);
    int dolly_raylib_close(dolly_raylib *context);
    int dolly_raylib_code_is(const dolly_input_event *event, const char *code);
    
    #endif
FILE /usr/src/dolly/gamedev/graphics-demo.c
    #include <box3d/box3d.h>
    #include <dolly/raylib.h>
    #include <rlgl.h>
    
    #include <errno.h>
    #include <math.h>
    #include <stdio.h>
    #include <stdlib.h>
    #include <string.h>
    
    enum { MAX_BOXES = 64, GEM_COUNT = 5 };
    
    typedef struct {
      b3BodyId body;
      Vector3 half_size;
      Color color;
    } game_box;
    
    typedef struct {
      b3WorldId world;
      b3BodyId player;
      game_box boxes[MAX_BOXES];
      int box_count;
      int left;
      int right;
      int forward;
      int backward;
      int score;
      int collected[GEM_COUNT];
      int width;
      int height;
      Camera3D camera;
    } game;
    
    static const Color COLOR_INK = { 236, 232, 220, 255 };
    static const Color COLOR_MUTED = { 126, 126, 118, 255 };
    static const Color COLOR_YELLOW = { 242, 212, 92, 255 };
    static const Color COLOR_ORANGE = { 226, 132, 68, 255 };
    static const Color COLOR_BLUE = { 94, 160, 180, 255 };
    static const Color COLOR_BACKGROUND = { 25, 29, 39, 255 };
    static const Color COLOR_PANEL = { 42, 47, 58, 255 };
    static const b3Vec3 GEMS[GEM_COUNT] = {
        {-6.0f, 1.1f, -5.0f}, {-3.5f, 1.1f, 4.5f}, {0.0f, 1.1f, 0.0f},
        {3.8f, 1.1f, -4.0f}, {6.0f, 1.1f, 4.8f}};
    
    static int usage(const char *program, int status) {
      fprintf(status == 0 ? stdout : stderr,
              "usage: %s [--frames COUNT]\n"
              "WASD or arrows move, Space jumps, click drops a cube, "
              "Q/Escape exits\n",
              program);
      return status;
    }
    
    static b3BodyId add_box(game *state, b3Vec3 position, Vector3 half_size,
                            b3BodyType type, Color color) {
      b3BodyDef body_definition = b3DefaultBodyDef();
      body_definition.type = type;
      body_definition.position = position;
      b3BodyId body = b3CreateBody(state->world, &body_definition);
      b3BoxHull hull = b3MakeBoxHull(half_size.x, half_size.y, half_size.z);
      b3ShapeDef shape = b3DefaultShapeDef();
      shape.density = 1.0f;
      shape.baseMaterial.friction = 0.65f;
      shape.baseMaterial.restitution = 0.08f;
      b3CreateHullShape(body, &shape, &hull.base);
      if (state->box_count < MAX_BOXES) {
        state->boxes[state->box_count++] =
            (game_box){body, half_size, color};
      }
      return body;
    }
    
    static void draw_box(const game_box *box) {
      b3Pos position = b3Body_GetPosition(box->body);
      b3Quat rotation = b3Body_GetRotation(box->body);
      float radians = 0.0f;
      b3Vec3 axis = b3GetAxisAngle(&radians, rotation);
      Vector3 size = {box->half_size.x * 2.0f, box->half_size.y * 2.0f,
                      box->half_size.z * 2.0f};
      rlPushMatrix();
      rlTranslatef((float)position.x, (float)position.y, (float)position.z);
      if (fabsf(radians) > 0.0001f)
        rlRotatef(radians * RAD2DEG, axis.x, axis.y, axis.z);
      DrawCubeV((Vector3){0.0f, 0.0f, 0.0f}, size, box->color);
      DrawCubeWiresV((Vector3){0.0f, 0.0f, 0.0f}, size,
                     Fade(COLOR_INK, 0.48f));
      rlPopMatrix();
    }
    
    static void draw_scene(game *state, int width, int height, unsigned long tick) {
      BeginDrawing();
      ClearBackground(COLOR_BACKGROUND);
    
      for (int band = 0; band < 10; ++band) {
        Color shade = (Color){(unsigned char)(22 + band * 2),
                              (unsigned char)(27 + band * 2),
                              (unsigned char)(39 + band * 3), 255};
        DrawRectangle(0, band * height / 10, width, height / 10 + 1, shade);
      }
    
      b3Pos player = b3Body_GetPosition(state->player);
      state->camera.target = (Vector3){(float)player.x, 1.4f, (float)player.z};
      state->camera.position = (Vector3){(float)player.x + 13.0f, 11.0f,
                                         (float)player.z + 13.0f};
      BeginMode3D(state->camera);
      DrawPlane((Vector3){0.0f, 0.01f, 0.0f}, (Vector2){20.0f, 20.0f},
                COLOR_PANEL);
      DrawGrid(20, 1.0f);
      for (int index = 0; index < state->box_count; ++index)
        draw_box(&state->boxes[index]);
      for (int index = 0; index < GEM_COUNT; ++index) {
        if (!state->collected[index] &&
            fabsf((float)player.x - GEMS[index].x) < 0.85f &&
            fabsf((float)player.z - GEMS[index].z) < 0.85f) {
          state->collected[index] = 1;
          ++state->score;
        }
        if (!state->collected[index]) {
          float pulse = 0.24f + 0.06f * sinf((float)tick * 0.08f + index);
          DrawSphere((Vector3){GEMS[index].x, GEMS[index].y + pulse,
                               GEMS[index].z},
                     0.34f, COLOR_YELLOW);
          DrawSphereWires((Vector3){GEMS[index].x, GEMS[index].y + pulse,
                                    GEMS[index].z},
                          0.42f, 8, 8, Fade(COLOR_YELLOW, 0.35f));
        }
      }
      EndMode3D();
    
      DrawRectangleRounded((Rectangle){18, 18, 310, 72}, 0.18f, 6,
                           Fade(COLOR_PANEL, 0.94f));
      DrawText("DOLLY BOXYARD / BOX3D", 34, 29, 24, COLOR_YELLOW);
      DrawText("WASD move  SPACE jump  click: drop cube", 34, 61, 16, COLOR_INK);
      char score[32];
      snprintf(score, sizeof(score), "%d / %d", state->score, GEM_COUNT);
      int score_width = MeasureText(score, 24);
      DrawText(score, width - score_width - 28, 29, 24,
               state->score == GEM_COUNT ? COLOR_YELLOW : COLOR_INK);
      if (state->score == GEM_COUNT) {
        const char *message = "3D SANDBOX CLEARED";
        int message_width = MeasureText(message, 34);
        DrawRectangle(width / 2 - message_width / 2 - 18, height / 2 - 33,
                      message_width + 36, 62, Fade(COLOR_PANEL, 0.92f));
        DrawText(message, width / 2 - message_width / 2, height / 2 - 18,
                 34, COLOR_YELLOW);
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
        if (dolly_raylib_code_is(event, "KeyA") ||
            dolly_raylib_code_is(event, "ArrowLeft"))
          state->left = down;
        if (dolly_raylib_code_is(event, "KeyD") ||
            dolly_raylib_code_is(event, "ArrowRight"))
          state->right = down;
        if (dolly_raylib_code_is(event, "KeyW") ||
            dolly_raylib_code_is(event, "ArrowUp"))
          state->forward = down;
        if (dolly_raylib_code_is(event, "KeyS") ||
            dolly_raylib_code_is(event, "ArrowDown"))
          state->backward = down;
        if (down && (dolly_raylib_code_is(event, "Space") ||
                     dolly_raylib_code_is(event, "KeyJ"))) {
          b3Pos position = b3Body_GetPosition(state->player);
          if (position.y < 1.25f)
            b3Body_ApplyLinearImpulseToCenter(
                state->player, (b3Vec3){0.0f, 5.8f, 0.0f}, true);
        }
      } else if (event->type == DOLLY_INPUT_EVENT_POINTER &&
                 event->action == DOLLY_POINTER_ACTION_PRESS &&
                 state->box_count < MAX_BOXES) {
        float x = 16.0f * (float)event->width_css_px / (float)state->width - 8.0f;
        float z = 16.0f * (float)event->height_css_px / (float)state->height - 8.0f;
        add_box(state,
                (b3Vec3){x, 8.0f, z},
                (Vector3){0.48f, 0.48f, 0.48f}, b3_dynamicBody,
                state->box_count & 1 ? COLOR_ORANGE : COLOR_BLUE);
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
      int status = dolly_raylib_open(&graphics, "Dolly Boxyard / Box3D");
      if (status != 0) {
        fprintf(stderr, "graphics-demo: display initialization failed: %s\n",
                strerror(-status));
        return 1;
      }
    
      game state = {0};
      state.width = (int)graphics.surface.width;
      state.height = (int)graphics.surface.height;
      state.camera = (Camera3D){(Vector3){13.0f, 11.0f, 13.0f},
                                (Vector3){0.0f, 1.4f, 0.0f},
                                (Vector3){0.0f, 1.0f, 0.0f}, 45.0f,
                                CAMERA_PERSPECTIVE};
      b3WorldDef world_definition = b3DefaultWorldDef();
      world_definition.gravity = (b3Vec3){0.0f, -12.0f, 0.0f};
      world_definition.workerCount = 1;
      state.world = b3CreateWorld(&world_definition);
    
      add_box(&state, (b3Vec3){0.0f, -0.5f, 0.0f},
              (Vector3){10.0f, 0.5f, 10.0f}, b3_staticBody, COLOR_PANEL);
      add_box(&state, (b3Vec3){-6.2f, 0.7f, 1.5f},
              (Vector3){2.2f, 0.25f, 1.3f}, b3_staticBody, COLOR_MUTED);
      add_box(&state, (b3Vec3){5.4f, 1.25f, -2.8f},
              (Vector3){2.0f, 0.25f, 1.5f}, b3_staticBody, COLOR_MUTED);
      for (int level = 0; level < 4; ++level) {
        for (int column = 0; column < 4 - level; ++column) {
          add_box(&state,
                  (b3Vec3){2.8f + (column - (3 - level) * 0.5f) * 1.05f,
                           0.52f + level * 1.04f, 3.2f},
                  (Vector3){0.5f, 0.5f, 0.5f}, b3_dynamicBody,
                  (level + column) & 1 ? COLOR_ORANGE : COLOR_BLUE);
        }
      }
      state.player = add_box(&state, (b3Vec3){-5.8f, 1.0f, -5.8f},
                             (Vector3){0.52f, 0.75f, 0.52f},
                             b3_dynamicBody, COLOR_YELLOW);
      b3MotionLocks player_locks = {0};
      player_locks.angularX = true;
      player_locks.angularZ = true;
      b3Body_SetMotionLocks(state.player, player_locks);
    
      int result = 0;
      unsigned long frame = 0;
      int quit = 0;
      while (!quit && (frame_limit == 0 || frame < frame_limit)) {
        dolly_input_event event;
        do {
          status = dolly_raylib_next_event(&graphics, &event, frame == 0 ? 0 : 16);
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
    
        b3Vec3 velocity = b3Body_GetLinearVelocity(state.player);
        velocity.x = (float)(state.right - state.left) * 5.2f;
        velocity.z = (float)(state.backward - state.forward) * 5.2f;
        b3Body_SetLinearVelocity(state.player, velocity);
        b3World_Step(state.world, 1.0f / 60.0f, 4);
    
        b3Pos player_position = b3Body_GetPosition(state.player);
        if (player_position.y < -4.0f) {
          b3Body_SetTransform(state.player, (b3Vec3){-5.8f, 3.0f, -5.8f},
                              b3Quat_identity);
          b3Body_SetLinearVelocity(state.player, b3Vec3_zero);
        }
        draw_scene(&state, (int)graphics.surface.width,
                   (int)graphics.surface.height, frame);
        if (dolly_raylib_end_frame(&graphics) != 0) {
          result = 1;
          break;
        }
        ++frame;
      }
    
      b3DestroyWorld(state.world);
      if (dolly_raylib_close(&graphics) != 0) result = 1;
      if (result == 0) puts("graphics-demo: terminal restored");
      return result;
    }
FILE /home/dolly/.pi/agent/skills/dolly-gamedev/SKILL.md
    ---
    name: dolly-gamedev
    description: Build interactive C games in Dolly with raylib 6, Box3D, and the exclusive in-Wasm framebuffer.
    ---
    
    # Dolly gamedev
    
    Use raylib for software rendering and Box3D for physics. Both are real pinned
    upstream libraries compiled from source while `Dollyfile-gamedev` executes.
    
    ## Installed surface
    
    - raylib 6.0: `/usr/include/raylib.h`, `/usr/include/raymath.h`,
      `/usr/lib/libraylib.a`
    - Box3D 0.1.0: `/usr/include/box3d/`, `/usr/lib/libbox3d.a`
    - Dolly adapter: `/usr/include/dolly/raylib.h`,
      `/usr/lib/libdolly-raylib.a`
    - Complete retained sources: `/usr/src/raylib`, `/usr/src/box3d`, and
      `/usr/src/dolly/gamedev`
    - Example game: `/usr/src/dolly/gamedev/graphics-demo.c`
    
    Build a game with:
    
    ```make
    game: game.c
    	cc -std=c17 game.c -o game -ldolly-raylib -lraylib -lbox3d
    ```
    
    ## Frame loop
    
    Call `dolly_raylib_open()` once. For each frame, call raylib `BeginDrawing()`,
    draw normally, then call `dolly_raylib_end_frame()` instead of `EndDrawing()`.
    Read semantic browser events with `dolly_raylib_next_event()`. Close with
    `dolly_raylib_close()` on every exit path. The runtime also releases a stranded
    lease when a foreground command exits or is interrupted.
    
    The raylib build uses upstream `PLATFORM_MEMORY`, so rendering stays in Wasm;
    the adapter only copies its completed RGBA image into Dolly's shared display.
    There is no DOM, canvas, WebGL, browser callback, host filesystem, or socket API
    inside a game. Keep automated checks finite with a `--frames N` option.
    
    Box3D uses opaque IDs and C17. Initialize definitions with helpers such as
    `b3DefaultWorldDef()`, set `workerCount` to 1, use a fixed step (normally
    1/60 with four substeps), and compile with the libraries after the
    object/source that references them.

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
EXPORTS HEADER raylib       /usr/include/raylib.h
EXPORTS HEADER box3d        /usr/include/box3d
EXPORTS HEADER dolly-raylib /usr/include/dolly/raylib.h

SLOP rm \
  -rf \
  /tmp/box3d.tar \
  /tmp/gamedev \
  /tmp/raylib.tar
