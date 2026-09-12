DOLLY 3
MODULE bhop

REQUIRES TOOL cc
REQUIRES TOOL make
REQUIRES TOOL c++
REQUIRES TOOL pi
REQUIRES TOOL download
REQUIRES TOOL tar
REQUIRES TOOL rm
REQUIRES HEADER cpp
REQUIRES HEADER quickjs-runner
REQUIRES HEADER sdl2
REQUIRES LIB dolly-js
REQUIRES LIB SDL2

SOURCE HOST /static/bhop/source.tar /tmp/bhop-source.tar 215c847c6da05473492913dc3da68d496ce9d9761183edca1f8a6cf31e390c66
SOURCE HOST /static/default/stb_truetype.h /tmp/bhop-stb/stb_truetype.h ecd30b05e0dd4fea3a13c26810dd9e1992dc379049482c393d5a19e6b5090aab
SLOP tar -xf /tmp/bhop-source.tar -C /
FILE /usr/src/dolly/game-agent/COPYING

FILE /usr/src/dolly/bhop/bhop-movement.h
    #ifndef DOLLY_BHOP_MOVEMENT_H
    #define DOLLY_BHOP_MOVEMENT_H
    #include <math.h>
    #include <string.h>
    
    #define BH_STEP 0.01f
    #define BH_RADIUS 16.0f
    #define BH_HEIGHT 72.0f
    #define BH_GRAVITY 800.0f
    #define BH_RUN_SPEED 250.0f
    
    typedef struct { float low[3], high[3]; } bh_box;
    typedef struct {
      float position[3], velocity[3];
      int ground, jump_queue, jumps;
    } bh_player;
    typedef struct { float fraction, normal[3]; int box; } bh_trace;
    
    static float bh_speed(const bh_player *player) {
      return hypotf(player->velocity[0], player->velocity[2]);
    }
    
    // Original implementation of GoldSrc's projection-limited acceleration rule.
    // Only the air projection is capped at 30; the acceleration uses full wishspeed.
    static void bh_accelerate(bh_player *player, float yaw, float forward, float side, int air) {
      float length = hypotf(forward, side);
      if (length == 0) return;
      float direction[3] = {
        (sinf(yaw) * forward + cosf(yaw) * side) / length, 0,
        (-cosf(yaw) * forward + sinf(yaw) * side) / length
      };
      float projection = player->velocity[0] * direction[0] + player->velocity[2] * direction[2];
      float available = (air ? 30.0f : BH_RUN_SPEED) - projection;
      float acceleration = fminf(available, (air ? 10.0f : 5.0f) * BH_RUN_SPEED * BH_STEP);
      if (acceleration <= 0) return;
      player->velocity[0] += direction[0] * acceleration;
      player->velocity[2] += direction[2] * acceleration;
    }
    
    static bh_trace bh_sweep(const float position[3], const float delta[3],
                             const bh_box *boxes, int count) {
      bh_trace best = {.fraction = 1, .box = -1};
      for (int box = 0; box < count; ++box) {
        if (boxes[box].low[0] >= boxes[box].high[0] || boxes[box].low[1] >= boxes[box].high[1] ||
            boxes[box].low[2] >= boxes[box].high[2]) continue;
        float enter = -INFINITY, leave = INFINITY, normal[3] = {0};
        int intersects = 1;
        for (int axis = 0; axis < 3; ++axis) {
          float low = boxes[box].low[axis] - (axis == 1 ? BH_HEIGHT : BH_RADIUS);
          float high = boxes[box].high[axis] + (axis == 1 ? 0 : BH_RADIUS);
          if (fabsf(delta[axis]) < 1e-8f) {
            if (position[axis] <= low || position[axis] >= high) { intersects = 0; break; }
            continue;
          }
          float first = (low - position[axis]) / delta[axis];
          float last = (high - position[axis]) / delta[axis];
          float sign = -1;
          if (first > last) { float swap = first; first = last; last = swap; sign = 1; }
          if (first > enter) {
            enter = first;
            memset(normal, 0, sizeof(normal));
            normal[axis] = sign;
          }
          leave = fminf(leave, last);
          if (enter > leave) { intersects = 0; break; }
        }
        if (intersects && enter >= 0 && enter < best.fraction && leave >= 0) {
          best.fraction = enter;
          best.box = box;
          memcpy(best.normal, normal, sizeof(normal));
        }
      }
      return best;
    }
    
    static void bh_slide(bh_player *player, const bh_box *boxes, int count) {
      float remaining = BH_STEP;
      for (int bump = 0; bump < 4 && remaining > 0; ++bump) {
        float delta[3];
        for (int axis = 0; axis < 3; ++axis) delta[axis] = player->velocity[axis] * remaining;
        bh_trace hit = bh_sweep(player->position, delta, boxes, count);
        for (int axis = 0; axis < 3; ++axis)
          player->position[axis] += delta[axis] * hit.fraction + hit.normal[axis] * 0.01f;
        if (hit.box < 0) break;
        remaining *= 1 - hit.fraction;
        float inward = 0;
        for (int axis = 0; axis < 3; ++axis) inward += player->velocity[axis] * hit.normal[axis];
        if (inward < 0) for (int axis = 0; axis < 3; ++axis)
          player->velocity[axis] -= inward * hit.normal[axis];
      }
    }
    
    static void bh_ground(bh_player *player, const bh_box *boxes, int count) {
      player->ground = -1;
      if (player->velocity[1] > 0) return;
      const float down[3] = {0, -2, 0};
      bh_trace floor = bh_sweep(player->position, down, boxes, count);
      if (floor.box >= 0 && floor.normal[1] > 0.7f) {
        player->position[1] -= 2 * floor.fraction - 0.01f;
        player->velocity[1] = 0;
        player->ground = floor.box;
      }
    }
    
    static void bh_tick(bh_player *player, float yaw, float forward, float side,
                        const bh_box *boxes, int count) {
      bh_ground(player, boxes, count);
      if (player->jump_queue > 0 && player->ground >= 0) {
        player->velocity[1] = sqrtf(2 * BH_GRAVITY * 45);
        player->ground = -1;
        player->jump_queue = 0;
        ++player->jumps;
      }
      if (player->jump_queue > 0) --player->jump_queue;
      if (player->ground >= 0) {
        float speed = bh_speed(player);
        if (speed > 0) {
          float retained = fmaxf(0, speed - fmaxf(75, speed) * 4 * BH_STEP) / speed;
          player->velocity[0] *= retained;
          player->velocity[2] *= retained;
        }
      }
      bh_accelerate(player, yaw, forward, side, player->ground < 0);
      if (player->ground >= 0 && bh_speed(player) > BH_RUN_SPEED) {
        float scale = BH_RUN_SPEED / bh_speed(player);
        player->velocity[0] *= scale;
        player->velocity[2] *= scale;
      }
      player->velocity[1] -= BH_GRAVITY * BH_STEP / 2;
      bh_slide(player, boxes, count);
      player->velocity[1] -= BH_GRAVITY * BH_STEP / 2;
      bh_ground(player, boxes, count);
    }
    #endif

FILE /usr/src/dolly/bhop/bhop-course.h
    #ifndef DOLLY_BHOP_COURSE_H
    #define DOLLY_BHOP_COURSE_H
    #include "bhop-movement.h"
    
    enum { BH_PADS = 33, BH_PAD_DELAY = 10, BH_PAD_RETURN = 200 };
    typedef struct {
      bh_box pads[BH_PADS];
      int cooldown[BH_PADS], collapses;
    } bh_course;
    
    static int bh_checkpoint(int pad) { return pad >= 0 && pad < BH_PADS && pad % 8 == 0; }
    static void bh_course_init(bh_course *course) {
      const float x[BH_PADS] = {0, 0, 48, 110, 160, 180, 140, 70, 0,
        -60, -130, -180, -160, -100, -20, 60, 120,
        180, 220, 190, 120, 40, -40, -120, -180,
        -200, -150, -80, 0, 80, 150, 190, 180};
      const float top[BH_PADS] = {0, 0, 0, 16, 16, 32, 32, 48, 48,
        32, 16, 0, -16, -16, 0, 0, 0,
        0, 16, 16, 32, 32, 48, 48, 64,
        64, 80, 80, 96, 96, 112, 112, 128};
      memset(course, 0, sizeof(*course));
      float z = 0;
      for (int i = 0; i < BH_PADS; ++i) {
        int section = i ? (i - 1) / 8 : 0;
        if (i) z -= i == 1 ? 400 : 220 + section * 10;
        float width = i == 0 ? 512 : bh_checkpoint(i) ? 224 : 88 - section * 8;
        float depth = bh_checkpoint(i) ? (i == 0 ? 512 : 256) : width;
        course->pads[i] = (bh_box){{x[i] - width / 2, top[i] - 32, z - depth / 2},
          {x[i] + width / 2, top[i], z + depth / 2}};
      }
    }
    static void bh_course_tick(bh_course *course, bh_player *player, float yaw, float forward, float side) {
      bh_box solid[BH_PADS];
      memcpy(solid, course->pads, sizeof(solid));
      for (int i = 0; i < BH_PADS; ++i) {
        if (course->cooldown[i] && --course->cooldown[i] == BH_PAD_RETURN) ++course->collapses;
        if (course->cooldown[i] > 0 && course->cooldown[i] <= BH_PAD_RETURN)
          solid[i].high[1] = solid[i].low[1];
      }
      bh_tick(player, yaw, forward, side, solid, BH_PADS);
      int pad = player->ground;
      if (pad >= 0 && !bh_checkpoint(pad) && !course->cooldown[pad])
        course->cooldown[pad] = BH_PAD_DELAY + BH_PAD_RETURN;
    }
    #endif

FILE /usr/src/dolly/bhop/bhop-check.c
    #include "bhop-course.h"
    #include <stdio.h>
    
    #define CHECK(condition) do { if (!(condition)) { \
      fprintf(stderr, "bhop movement check failed at line %d: %s\n", __LINE__, #condition); return 1; \
    } } while (0)
    
    int main(void) {
      bh_player player = {.velocity = {0, 0, -300}};
      bh_accelerate(&player, 0, 1, 0, 1);
      CHECK(player.velocity[2] == -300);
      bh_accelerate(&player, 0, 0, 1, 1);
      CHECK(player.velocity[0] == 25 && player.velocity[2] == -300);
      bh_accelerate(&player, 0, 0, 1, 1);
      CHECK(player.velocity[0] == 30 && bh_speed(&player) > 300);
      player = (bh_player){0};
      bh_accelerate(&player, 0, 1, 1, 1);
      CHECK(fabsf(bh_speed(&player) - 25) < 0.001f);
    
      bh_player strafe = {.velocity = {0, 0, -300}}, held = strafe;
      for (int tick = 0; tick < 100; ++tick) {
        float yaw = atan2f(strafe.velocity[2], strafe.velocity[0]) + acosf(5 / bh_speed(&strafe));
        bh_accelerate(&strafe, yaw, 0, 1, 1);
        bh_accelerate(&held, 0, 0, 1, 1);
      }
      CHECK(bh_speed(&strafe) > 420 && bh_speed(&held) < 302);
      printf("bhop: synchronized strafe %.3f u/s; fixed-direction strafe %.3f u/s\n",
        bh_speed(&strafe), bh_speed(&held));
    
      const bh_box floor = {{-10000, -100, -10000}, {10000, 0, 10000}};
      player = (bh_player){.position = {0, 0.01f, 0}, .velocity = {100, 0, 0}};
      bh_tick(&player, 0, 0, 0, &floor, 1);
      CHECK(fabsf(player.velocity[0] - 96) < 0.001f && player.ground == 0);
      player = (bh_player){.position = {0, 0.01f, 0}, .velocity = {600, 0, 0}, .jump_queue = 2};
      float peak = 0;
      for (int tick = 0; tick < 65; ++tick) {
        bh_tick(&player, 0, 0, 0, &floor, 1);
        peak = fmaxf(peak, player.position[1]);
        CHECK(fabsf(player.velocity[0] - 600) < 0.001f);
      }
      CHECK(peak > 44.9f && peak < 45.1f && player.jumps == 1);
      while (player.ground < 0) bh_tick(&player, 0, 0, 0, &floor, 1);
      player.jump_queue = 2;
      bh_tick(&player, 0, 0, 0, &floor, 1);
      CHECK(player.jumps == 2 && player.ground == -1 && player.velocity[0] == 600);
      for (int tick = 0; tick < 100; ++tick) bh_tick(&player, 0, 0, 0, &floor, 1);
      CHECK(player.jumps == 2 && player.ground == 0 && bh_speed(&player) < 250);
    
      const bh_box wall = {{100, -100, -100}, {110, 200, 100}};
      player = (bh_player){.position = {60, 10, 0}, .velocity = {5000, 0, -100}};
      bh_slide(&player, &wall, 1);
      CHECK(player.position[0] < 84 && player.position[0] > 83.9f);
      CHECK(player.velocity[0] == 0 && player.velocity[2] == -100);
      CHECK(fabsf(player.position[2] + 1) < 0.001f);
      puts("bhop: projection cap, full-wish acceleration, diagonal input, friction, 45-unit jump, landing momentum and swept wall sliding passed");
    
      bh_course course;
      bh_course_init(&course);
      bh_box pad = course.pads[1];
      player = (bh_player){.position = {(pad.low[0] + pad.high[0]) / 2, pad.high[1] + 0.01f,
        (pad.low[2] + pad.high[2]) / 2}};
      bh_course_tick(&course, &player, 0, 0, 0);
      CHECK(course.cooldown[1] == BH_PAD_DELAY + BH_PAD_RETURN && player.ground == 1);
      for (int i = 1; i < BH_PAD_DELAY; ++i) {
        bh_course_tick(&course, &player, 0, 0, 0);
        CHECK(player.ground == 1);
      }
      bh_course_tick(&course, &player, 0, 0, 0);
      CHECK(player.ground == -1 && course.collapses == 1);
      for (int i = 0; i < BH_PAD_RETURN; ++i) bh_course_tick(&course, &player, 0, 0, 0);
      CHECK(course.cooldown[1] == 0 && player.position[1] < pad.low[1]);
      player = (bh_player){.position = {0, 0.01f, 0}};
      for (int i = 0; i < 250; ++i) bh_course_tick(&course, &player, 0, 0, 0);
      CHECK(player.ground == 0 && course.cooldown[0] == 0);
      bh_course_init(&course);
      player = (bh_player){.position = {0, 0.01f, -400}};
      bh_course_tick(&course, &player, 0, 0, 0);
      player.jump_queue = 2;
      for (int i = 0; i < BH_PAD_DELAY + 1; ++i) bh_course_tick(&course, &player, 0, 0, 0);
      CHECK(player.jumps == 1 && player.position[1] > 20 && course.collapses == 1);
      puts("bhop: 100ms collapse, 2s return, safe checkpoints and immediate jumping passed");
    
      float fastest = 0;
      for (int next = 1; next < BH_PADS; ++next) {
        bh_course_init(&course);
        bh_box start = course.pads[next - 1], end = course.pads[next];
        float sx = (start.low[0] + start.high[0]) / 2, sz = (start.low[2] + start.high[2]) / 2;
        float ex = (end.low[0] + end.high[0]) / 2, ez = (end.low[2] + end.high[2]) / 2;
        // Check each gap independently with real swept physics, not just the ballistic formula.
        // Checkpoints provide a run-up; ordinary pads must be crossed without stopping.
        if (bh_checkpoint(next - 1)) sz = start.low[2] + 8;
        float rise = end.high[1] - start.high[1];
        float flight = (sqrtf(2 * BH_GRAVITY * 45) + sqrtf(2 * BH_GRAVITY * (45 - rise))) / BH_GRAVITY;
        float vx = (ex - sx) / flight, vz = (ez - sz) / flight;
        float speed = hypotf(vx, vz);
        fastest = fmaxf(fastest, speed);
        CHECK(speed < 440 && (!bh_checkpoint(next - 1) || speed < BH_RUN_SPEED));
        player = (bh_player){.position = {sx, start.high[1] + 0.01f, sz},
          .velocity = {vx, 0, vz}, .jump_queue = 2};
        int landed = -1;
        for (int tick = 0; tick < 100 && landed < 0; ++tick) {
          bh_course_tick(&course, &player, 0, 0, 0);
          if (player.ground >= 0) landed = player.ground;
        }
        CHECK(landed == next);
      }
      printf("bhop: all 32 individual gaps reachable, maximum center-landing speed %.1f u/s\n", fastest);
      return 0;
    }

FILE /usr/src/dolly/bhop/bhop.c
    #define _POSIX_C_SOURCE 200809L
    #include "bhop-course.h"
    #include "agent/input.h"
    #include <dolly/raylib.h>
    #include <raymath.h>
    #include <rlgl.h>
    #include <errno.h>
    #include <stdio.h>
    #include <stdlib.h>
    #include <time.h>
    
    enum { PLATFORM_COUNT = BH_PADS };
    static const Color SKY = {20, 28, 38, 255}, INK = {231, 235, 234, 255};
    static const Color ACCENT = {255, 185, 82, 255}, CYAN = {84, 218, 205, 255};
    static const Color MUTED = {145, 159, 172, 255};
    static const char *record_path = "/workspace/bhop-foundry-record.txt";
    
    typedef struct {
      bh_player player;
      bh_course course;
      int forward, backward, left, right, turn_left, turn_right, looking, quit;
      int checkpoint, furthest, deaths, finished, practice, ticks, jumps, air_ticks, gain_ticks;
      float yaw, pitch, elapsed, best, peak_speed, landing_speed;
    } game;
    
    static double seconds(void) {
      struct timespec now;
      return clock_gettime(CLOCK_MONOTONIC, &now) == 0
        ? now.tv_sec + now.tv_nsec / 1e9 : 0;
    }
    static Color blend(Color from, Color to, float amount) {
      amount = Clamp(amount, 0, 1);
      return (Color){from.r + (to.r - from.r) * amount, from.g + (to.g - from.g) * amount,
        from.b + (to.b - from.b) * amount, 255};
    }
    static Vector3 center(bh_box box) {
      return (Vector3){(box.low[0] + box.high[0]) / 2, (box.low[1] + box.high[1]) / 2,
        (box.low[2] + box.high[2]) / 2};
    }
    static int is_checkpoint(int index) { return bh_checkpoint(index); }
    static void clear_keys(game *state) {
      state->forward = state->backward = state->left = state->right = 0;
      state->turn_left = state->turn_right = 0;
      state->player.jump_queue = 0;
    }
    static void respawn(game *state, int restart) {
      if (restart) {
        state->checkpoint = state->furthest = state->deaths = state->finished = 0;
        state->practice = 0;
        state->ticks = state->jumps = state->air_ticks = state->gain_ticks = 0;
        state->elapsed = state->peak_speed = state->landing_speed = 0;
      }
      memset(state->course.cooldown, 0, sizeof(state->course.cooldown));
      if (restart) state->course.collapses = 0;
      bh_box pad = state->course.pads[state->checkpoint];
      state->player = (bh_player){.position = {(pad.low[0] + pad.high[0]) / 2,
        pad.high[1] + 0.01f, (pad.low[2] + pad.high[2]) / 2 + (state->checkpoint == 0 ? 115 : 40)},
        .ground = state->checkpoint};
      Vector3 here = center(pad), next = center(state->course.pads[state->checkpoint + (state->checkpoint < BH_PADS - 1)]);
      state->yaw = atan2f(next.x - here.x, here.z - next.z);
      state->pitch = -0.06f;
      clear_keys(state);
    }
    static void tick(game *state) {
      if (!state->looking || state->finished) return;
      state->yaw += (state->turn_right - state->turn_left) * BH_STEP * 1.6f;
      int grounded = state->player.ground >= 0;
      int jumps = state->player.jumps;
      float before = bh_speed(&state->player);
      bh_course_tick(&state->course, &state->player, state->yaw, state->forward - state->backward,
        state->right - state->left);
      state->jumps += state->player.jumps - jumps;
      ++state->ticks;
      float speed = bh_speed(&state->player);
      state->peak_speed = fmaxf(state->peak_speed, speed);
      if (!grounded && (state->left || state->right || state->forward || state->backward)) {
        ++state->air_ticks;
        if (speed > before + 0.001f) ++state->gain_ticks;
      }
      if (state->player.position[2] < -180 || state->elapsed > 0) state->elapsed += BH_STEP;
      int pad = state->player.ground;
      if (!grounded && pad >= 0) state->landing_speed = speed;
      if (pad > state->furthest) state->furthest = pad;
      if (pad > state->checkpoint && is_checkpoint(pad)) state->checkpoint = pad;
      if (pad == PLATFORM_COUNT - 1 && !state->finished) {
        state->finished = 1;
        if (!state->practice && (!state->best || state->elapsed < state->best)) {
          state->best = state->elapsed;
          FILE *record = fopen(record_path, "w");
          if (record) { fprintf(record, "%.3f\n", state->best); fclose(record); }
        }
      }
      if (state->player.position[1] < -200) { ++state->deaths; respawn(state, 0); }
    }
    static void input(game *state, const dolly_input_event *event) {
      if (event->type == DOLLY_INPUT_EVENT_POINTER_CAPTURE) {
        state->looking = event->action != 0;
        clear_keys(state);
      } else if (event->type == DOLLY_INPUT_EVENT_POINTER_MOTION && state->looking) {
        state->yaw += (int32_t)event->width_css_px * 0.0000011f;
        state->pitch = Clamp(state->pitch - (int32_t)event->height_css_px * 0.0000011f, -1.48f, 1.48f);
      } else if (event->type == DOLLY_INPUT_EVENT_FOCUS && !event->action) {
        state->looking = 0;
        clear_keys(state);
      } else if (event->type == DOLLY_INPUT_EVENT_SCROLL && state->looking && (int32_t)event->action != 0) {
        state->player.jump_queue = 2;
      } else if (event->type == DOLLY_INPUT_EVENT_KEY) {
        int down = event->action != DOLLY_KEY_ACTION_RELEASE;
        if (dolly_raylib_code_is(event, "KeyW")) state->forward = down;
        if (dolly_raylib_code_is(event, "KeyS")) state->backward = down;
        if (dolly_raylib_code_is(event, "KeyA")) state->left = down;
        if (dolly_raylib_code_is(event, "KeyD")) state->right = down;
        if (dolly_raylib_code_is(event, "ArrowLeft")) state->turn_left = down;
        if (dolly_raylib_code_is(event, "ArrowRight")) state->turn_right = down;
        if (event->action == DOLLY_KEY_ACTION_PRESS) {
          if (dolly_raylib_code_is(event, "Space") && state->looking) state->player.jump_queue = 2;
          if (dolly_raylib_code_is(event, "KeyR")) respawn(state, 1);
          if (dolly_raylib_code_is(event, "KeyF")) { ++state->deaths; respawn(state, 0); }
          if (dolly_raylib_code_is(event, "KeyQ")) state->quit = 1;
          const char *sections[] = {"Digit1", "Digit2", "Digit3", "Digit4"};
          for (int i = 0; i < 4; ++i) if (dolly_raylib_code_is(event, sections[i])) {
            state->checkpoint = state->furthest = i * 8;
            state->finished = 0;
            state->practice = 1;
            state->elapsed = 0;
            respawn(state, 0);
          }
        }
      }
    }
    static void label(Font font, const char *message, float x, float y, float size, Color color) {
      DrawTextEx(font, message, (Vector2){x, y}, size, 0, color);
    }
    static void shaded_cube(Vector3 middle, Vector3 size, Color color, float fog) {
      static const int faces[6][4] = {{0, 4, 6, 2}, {1, 3, 7, 5}, {0, 1, 5, 4},
        {2, 6, 7, 3}, {0, 2, 3, 1}, {4, 5, 7, 6}};
      static const float light[] = {0.68f, 0.85f, 0.5f, 1, 0.72f, 0.9f};
      Vector3 corner[8];
      for (int i = 0; i < 8; ++i) corner[i] = (Vector3){middle.x + (i & 1 ? 0.5f : -0.5f) * size.x,
        middle.y + (i & 2 ? 0.5f : -0.5f) * size.y, middle.z + (i & 4 ? 0.5f : -0.5f) * size.z};
      for (int i = 0; i < 6; ++i) {
        Color shade = blend((Color){color.r * light[i], color.g * light[i], color.b * light[i], 255}, SKY, fog);
        DrawTriangle3D(corner[faces[i][0]], corner[faces[i][1]], corner[faces[i][2]], shade);
        DrawTriangle3D(corner[faces[i][0]], corner[faces[i][2]], corner[faces[i][3]], shade);
      }
    }
    static void platform(bh_box box, int index, int cooldown, float fade) {
      int hidden = cooldown > 0 && cooldown <= BH_PAD_RETURN;
      if (hidden) {
        int falling = BH_PAD_RETURN - cooldown;
        if (falling > 24) return;
        float drop = falling * falling * 0.65f;
        box.low[1] -= drop;
        box.high[1] -= drop;
        fade = fmaxf(fade, falling / 26.0f);
      }
      Vector3 middle = center(box);
      Color rim = blend(is_checkpoint(index) ? CYAN : cooldown ? (Color){255, 89, 58, 255} : ACCENT, SKY, fade);
      shaded_cube(middle, (Vector3){box.high[0] - box.low[0], box.high[1] - box.low[1], box.high[2] - box.low[2]},
        (Color){132, 144, 153, 255}, fade);
      DrawCube((Vector3){middle.x, box.high[1] - 3, middle.z},
        box.high[0] - box.low[0] + 1, 6, box.high[2] - box.low[2] + 1, rim);
      float y = box.high[1] + 0.07f;
      int columns = (int)ceilf((box.high[0] - box.low[0]) / 32);
      int rows = (int)ceilf((box.high[2] - box.low[2]) / 32);
      for (int row = 0; row < rows; ++row) for (int column = 0; column < columns; ++column) {
        float left = box.low[0] + column * 32, right = fminf(left + 32, box.high[0]);
        float back = box.low[2] + row * 32, front = fminf(back + 32, box.high[2]);
        Color tile = blend((row + column) & 1 ? (Color){190, 198, 201, 255} : (Color){215, 221, 220, 255}, SKY, fade);
        DrawTriangle3D((Vector3){left, y, back}, (Vector3){left, y, front}, (Vector3){right, y, front}, tile);
        DrawTriangle3D((Vector3){left, y, back}, (Vector3){right, y, front}, (Vector3){right, y, back}, tile);
      }
      if (is_checkpoint(index)) {
        DrawCube((Vector3){middle.x, box.low[1] - 116, middle.z}, 60, 232, 60,
          blend((Color){43, 59, 73, 255}, SKY, fade));
        for (int side = -1; side <= 1; side += 2) {
          float x = side < 0 ? box.low[0] - 8 : box.high[0] + 8;
          DrawCube((Vector3){x, box.high[1] + 24, middle.z + 30}, 5, 5, 130, rim);
          for (int end = -1; end <= 1; end += 2)
            DrawCube((Vector3){x, box.high[1] + 12, middle.z + 30 + end * 62}, 5, 24, 5, rim);
        }
      }
    }
    static void structure(Vector3 eye, Vector3 middle, Vector3 size, Color color) {
      float distance = Vector3Distance(eye, middle);
      if (distance < 1900) shaded_cube(middle, size, color, Clamp((distance - 550) / 1450, 0, 0.95f));
    }
    static void industrial_yard(const game *state, Vector3 eye) {
      const Color steel = {65, 82, 92, 255}, concrete = {101, 115, 120, 255};
      const Color rust = {128, 73, 46, 255}, blue = {40, 89, 117, 255};
      for (int i = 0; i < BH_PADS; i += 2) {
        Vector3 pad = center(state->course.pads[i]);
        if (fabsf(pad.z - eye.z) > 1800) continue;
        int section = i / 8;
        float floor = -250;
        structure(eye, (Vector3){0, floor, pad.z}, (Vector3){1280, 12, 480}, (Color){31, 46, 55, 255});
        for (int side = -1; side <= 1; side += 2) {
          float x = side * 520;
          structure(eye, (Vector3){x, 100, pad.z}, (Vector3){24, 700, 32}, steel);
          structure(eye, (Vector3){x - side * 12, 85, pad.z + 17}, (Vector3){5, 95, 2}, ACCENT);
          structure(eye, (Vector3){side * 625, -135, pad.z}, (Vector3){245, 210, 465}, section == 0 ? blue : concrete);
          if (section == 0) {
            // Stacked ribbed shipping containers and open sky at the loading yard.
            structure(eye, (Vector3){side * 660, 50, pad.z - 75}, (Vector3){270, 165, 300}, i % 4 ? rust : blue);
            for (int rib = 0; rib < 6; ++rib)
              structure(eye, (Vector3){side * 519, 50, pad.z - 200 + rib * 50}, (Vector3){8, 150, 7}, steel);
          } else if (section == 1) {
            // Tall windowed turbine hall, suspended ducts and overhead beams.
            structure(eye, (Vector3){side * 550, 260, pad.z}, (Vector3){32, 340, 460}, concrete);
            for (int window = 0; window < 3; ++window)
              structure(eye, (Vector3){side * 530, 285, pad.z - 150 + window * 150},
                (Vector3){3, 92, 105}, (Color){74, 136, 154, 255});
            structure(eye, (Vector3){side * 345, 330, pad.z}, (Vector3){68, 62, 475}, steel);
          } else {
            // Original reactor/silo shapes; low polygon counts suit the software renderer.
            float distance = Vector3Distance(eye, (Vector3){side * 710, 0, pad.z});
            if (distance < 1700) {
              Color tank = blend(section == 2 ? blue : concrete, SKY, Clamp((distance - 450) / 1450, 0, 0.94f));
              DrawCylinder((Vector3){side * 710, -220, pad.z}, 125, 145, section == 2 ? 590 : 790, 12, tank);
              DrawCylinder((Vector3){side * 710, section == 2 ? 220 : 400, pad.z}, 149, 149, 18, 12,
                blend(section == 2 ? CYAN : ACCENT, SKY, Clamp(distance / 2000, 0, 0.9f)));
            }
            structure(eye, (Vector3){side * 460, -170, pad.z}, (Vector3){14, 20, 470}, section == 2 ? CYAN : ACCENT);
          }
        }
        if (section == 1 || i % 4 == 0) {
          structure(eye, (Vector3){0, 425, pad.z}, (Vector3){1080, 24, 32}, steel);
          structure(eye, (Vector3){0, 409, pad.z}, (Vector3){240, 4, 18}, (Color){233, 219, 168, 255});
        }
        if (is_checkpoint(i)) {
          structure(eye, (Vector3){pad.x, pad.y + 194, pad.z - 100}, (Vector3){310, 46, 24}, blue);
          for (int side = -1; side <= 1; side += 2)
            structure(eye, (Vector3){pad.x + side * 152, pad.y + 90, pad.z - 100}, (Vector3){8, 220, 8}, CYAN);
        }
      }
    }
    static void draw(game *state, Font font, int width, int height) {
      BeginDrawing();
      ClearBackground(SKY);
      DrawRectangleGradientV(0, 0, width, height, (Color){12, 18, 27, 255}, SKY);
      Vector3 eye = {state->player.position[0], state->player.position[1] + 64, state->player.position[2]};
      Camera3D camera = {.position = eye, .target = {eye.x + sinf(state->yaw) * cosf(state->pitch),
        eye.y + sinf(state->pitch), eye.z - cosf(state->yaw) * cosf(state->pitch)},
        .up = {0, 1, 0}, .fovy = 74, .projection = CAMERA_PERSPECTIVE};
      BeginMode3D(camera);
      industrial_yard(state, eye);
      for (int i = 0; i < PLATFORM_COUNT; ++i) {
        float distance = Vector3Distance(eye, center(state->course.pads[i]));
        if (distance < 1900) platform(state->course.pads[i], i, state->course.cooldown[i],
          Clamp((distance - 450) / 1500, 0, 0.92f));
      }
      EndMode3D();
    
      DrawRectangle(0, 0, width, 62, (Color){12, 18, 25, 255});
      label(font, "A I R T I M E", 18, 10, 25, INK);
      label(font, "FOUNDRY / STRAFE TRIALS", 20, 39, 11, ACCENT);
      const char *sections[] = {"01 / LOADING YARD", "02 / TURBINE HALL", "03 / REACTOR", "04 / SILO RUN", "FINISH"};
      label(font, sections[state->checkpoint / 8], width / 2 - 95, 14, 14, CYAN);
      for (int i = 0; i < BH_PADS; ++i) {
        Color color = i <= state->furthest ? CYAN : is_checkpoint(i) ? INK : MUTED;
        DrawRectangle(width / 2 - 96 + i * 6, 43, 3, is_checkpoint(i) ? 8 : 4, color);
      }
      char text[160];
      if (state->practice) snprintf(text, sizeof(text), "%05.2f  /  PRACTICE", state->elapsed);
      else snprintf(text, sizeof(text), "%05.2f  /  BEST %s", state->elapsed, state->best > 0 ? TextFormat("%.2f", state->best) : "--");
      label(font, text, width - 230, 17, 18, INK);
      snprintf(text, sizeof(text), "PAD %02d/%02d    FALLS %d", state->furthest, PLATFORM_COUNT - 1, state->deaths);
      label(font, text, width - 230, 41, 11, MUTED);
    
      DrawRectangle(0, height - 96, width, 96, (Color){12, 18, 25, 255});
      float speed = bh_speed(&state->player);
      snprintf(text, sizeof(text), "%03.0f", speed);
      Color speed_color = speed > 300 ? CYAN : ACCENT;
      label(font, text, width / 2 - 50, height - 86, 40, speed_color);
      label(font, "UNITS / SECOND", width / 2 - 47, height - 43, 11, MUTED);
      DrawRectangle(20, height - 16, width - 40, 3, (Color){45, 58, 69, 255});
      DrawRectangle(20, height - 16, (width - 40) * fminf(speed / 800, 1), 3, speed_color);
      snprintf(text, sizeof(text), "%s  |  SYNC %.0f%%", state->player.ground < 0 ? "AIR" : "GROUND",
        state->air_ticks ? 100.0f * state->gain_ticks / state->air_ticks : 0);
      label(font, text, 20, height - 77, 13, INK);
      snprintf(text, sizeof(text), "LAND %.0f   PEAK %.0f", state->landing_speed, state->peak_speed);
      label(font, text, 20, height - 53, 11, MUTED);
      label(font, "WASD   SPACE / WHEEL JUMP", width - 222, height - 77, 11, INK);
      label(font, "R RESTART   F CHECKPOINT   Q EXIT", width - 222, height - 53, 10, MUTED);
      label(font, "1-4 PRACTICE A SECTION", width - 222, height - 33, 10, MUTED);
    
      DrawLine(width / 2 - 5, height / 2, width / 2 + 5, height / 2, INK);
      DrawLine(width / 2, height / 2 - 5, width / 2, height / 2 + 5, INK);
      int ground = state->player.ground;
      if (ground >= 0 && !is_checkpoint(ground)) {
        label(font, "JUMP!", width / 2 - 25, height / 2 + 25, 16, ACCENT);
        DrawRectangle(width / 2 - 32, height / 2 + 47,
          64 * (state->course.cooldown[ground] - BH_PAD_RETURN) / BH_PAD_DELAY, 3, ACCENT);
      }
      if (!state->looking || state->finished) {
        int panel_width = width > 540 ? 500 : width - 30, x = (width - panel_width) / 2;
        DrawRectangle(x, height / 2 - 74, panel_width, 178, (Color){12, 18, 25, 255});
        DrawRectangle(x, height / 2 - 74, panel_width, 2, ACCENT);
        label(font, state->finished ? "COURSE COMPLETE" : "CLICK TO TAKE THE MOUSE", x + 22, height / 2 - 54, 23, INK);
        label(font, "W to launch. In air, release W and strafe A / D", x + 22, height / 2 - 17, 12, MUTED);
        label(font, "while turning the mouse in the same direction.", x + 22, height / 2 + 3, 12, MUTED);
        label(font, "Yellow pads drop on touch. Cyan decks are safe.", x + 22, height / 2 + 26, 12, INK);
        label(font, state->finished ? "R to race again. Q returns to Slop." :
          "Space or either wheel direction jumps. Esc releases.", x + 22, height / 2 + 65, 12, ACCENT);
      }
    }
    static int usage(const char *name, int status) {
      fprintf(status ? stderr : stdout, "usage: %s [--frames COUNT]\n"
        "Click once for mouse look; Escape releases. WASD moves; Space and wheel up/down jump.\n"
        "Foundry: 32 jumps through the yard, turbine hall, reactor and silos.\n"
        "Yellow pads collapse 100ms after landing and return after 2s; cyan checkpoints stay solid.\n"
        "1-4 practices a section without recording a best time; R begins a full run.\n"
        "R restarts; F returns to a checkpoint; Q exits. Release W in air and match A/D with mouse turn.\n", name);
      return status;
    }
    static void agent_input(void *context, const dolly_input_event *event) { input(context, event); }
    static int agent_frame(game *state, Font font) {
      static unsigned char pixels[960 * 540 * 4];
      draw(state, font, 960, 540);
      EndDrawing();
      rlCopyFramebuffer(0, 0, 960, 540, PIXELFORMAT_UNCOMPRESSED_R8G8B8A8, pixels);
      return bh_agent_frame(pixels);
    }
    int main(int argc, char **argv) {
      unsigned long limit = 0;
      if (argc == 2 && strcmp(argv[1], "--help") == 0) return usage(argv[0], 0);
      if (argc == 3 && strcmp(argv[1], "--frames") == 0) {
        char *end;
        errno = 0;
        limit = strtoul(argv[2], &end, 10);
        if (errno || argv[2][0] < '0' || argv[2][0] > '9' || *end || !limit) return usage(argv[0], 2);
      } else if (argc != 1) return usage(argv[0], 2);
      game state = {0};
      const int agent = bh_agent_open(agent_input, &state);
      dolly_raylib graphics = {0};
      if (agent) {
        graphics.surface.width = 960; graphics.surface.height = 540;
        InitWindow(960, 540, "Dolly Airtime");
        if (!IsWindowReady()) return 1;
        SetTraceLogLevel(LOG_WARNING);
      } else if (dolly_raylib_open_sized(&graphics, "Dolly Airtime", 960, 540) != 0) return 1;
      if (!agent && dolly_raylib_set_cursor(&graphics, DOLLY_DISPLAY_CURSOR_CAPTURED) != 0) {
        dolly_raylib_close(&graphics);
        fputs("bhop: this runtime does not support captured mouse input\n", stderr);
        return 1;
      }
      Font font = LoadFontEx("/usr/share/fonts/IosevkaTerm-SemiBold.ttf", 32, NULL, 0);
      if (!IsFontValid(font)) { if (agent) CloseWindow(); else dolly_raylib_close(&graphics); return 1; }
      SetTextureFilter(font.texture, TEXTURE_FILTER_BILINEAR);
      rlSetClipPlanes(1, 2400);
      bh_course_init(&state.course);
      respawn(&state, 1);
      FILE *record = fopen(record_path, "r");
      if (record) { if (fscanf(record, "%f", &state.best) != 1 || !isfinite(state.best) || state.best < 0) state.best = 0; fclose(record); }
      double previous = seconds(), accumulator = 0;
      unsigned long frames = 0;
      int result = 0;
      while (!state.quit && (!limit || frames < limit)) {
        if (agent) {
          const struct timespec interval = {0, 8000000}; nanosleep(&interval, NULL);
          if (bh_agent_poll()) break;
        } else if (frames && dolly_raylib_wait_frame(&graphics, 1000) < 0) { result = 1; break; }
        dolly_input_event event;
        for (int i = 0; !agent && i < 256; ++i) {
          int status = dolly_raylib_next_event(&graphics, &event, 0);
          if (status < 0) { result = 1; state.quit = 1; break; }
          if (!status) break;
          input(&state, &event);
        }
        if (state.quit) break;
        double now = seconds();
        accumulator += now >= previous ? fmin(now - previous, 0.1) : 0;
        previous = now;
        int drawn = 0;
        for (int i = 0; accumulator >= BH_STEP && i < 10; ++i, accumulator -= BH_STEP) {
          if (agent) bh_agent_tick();
          tick(&state); drawn = 0;
          if (agent && bh_agent_capture_due()) {
            if (!agent_frame(&state, font)) { result = 1; break; }
            drawn = 1;
          }
        }
        if (result) break;
        if (agent) {
          if (!drawn && !agent_frame(&state, font)) { result = 1; break; }
        } else {
          draw(&state, font, graphics.surface.width, graphics.surface.height);
          if (dolly_raylib_end_frame(&graphics) != 0) { result = 1; break; }
        }
        ++frames;
      }
      UnloadFont(font);
      if (agent) { bh_agent_close(); CloseWindow(); } else dolly_raylib_close(&graphics);
      printf("bhop: ticks=%d jumps=%d falls=%d pad=%d peak=%.3f speed=%.3f collapses=%d\n",
        state.ticks, state.jumps, state.deaths, state.furthest, state.peak_speed, bh_speed(&state.player), state.course.collapses);
      return result;
    }

FILE /usr/src/dolly/bhop/bhop.mk
    .PHONY: all check
    all: /usr/bin/bhop
    /usr/bin/bhop: /usr/src/dolly/bhop/bhop.c /usr/src/dolly/bhop/bhop-movement.h /usr/src/dolly/bhop/bhop-course.h /usr/src/dolly/bhop/agent/input.c /usr/src/dolly/bhop/agent/input.h /usr/src/dolly/bhop/agent/timeline.h /usr/src/dolly/game-agent/control.h /usr/lib/libdolly-raylib.a /usr/lib/libraylib.a /usr/lib/libm.a
    	cc -std=c17 -O2 -fno-builtin $< /usr/src/dolly/bhop/agent/input.c -o $@ -ldolly-raylib -lraylib -lm
    check:
    	@output=/tmp/bhop-check.$$$$; status=0; cc -std=c17 -O2 -fno-builtin /usr/src/dolly/bhop/bhop-check.c -o "$$output" -lm && "$$output" || status=$$?; rm -f "$$output"; exit "$$status"

SLOP make -f /usr/src/dolly/bhop/bhop.mk all check

SLOP c++ -O1 -std=c++11 -I/usr/include/SDL2 -I/tmp/bhop-stb /usr/src/dolly/game-agent/viewer.cpp -o /usr/bin/bhop-viewer -lSDL2 -lm
SLOP cc -std=gnu11 -I/usr/include/dolly -DEMSCRIPTEN=1 -D_GNU_SOURCE -DQUICKJS_NG_BUILD -DNDEBUG -funsigned-char -fdolly-runtime-interrupt-handler /usr/src/dolly/bhop/agent/launch.c -ldolly-js -o /usr/bin/bhop-agent
SLOP rm -rf /tmp/bhop-source.tar /tmp/bhop-stb

EXPORTS TOOL bhop
EXPORTS TOOL bhop-agent
EXPORTS TOOL bhop-viewer
EXPORTS FOLDER bhop-agent-source /usr/src/dolly/bhop/agent
EXPORTS FOLDER game-agent-source /usr/src/dolly/game-agent
EXPORTS FOLDER game-input-source /usr/src/dolly/rts
