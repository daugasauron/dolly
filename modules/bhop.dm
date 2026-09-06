DOLLY 3
MODULE bhop

REQUIRES TOOL cc
REQUIRES TOOL make

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

FILE /usr/src/dolly/bhop/bhop-check.c
    #include "bhop-movement.h"
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
      return 0;
    }

FILE /usr/src/dolly/bhop/bhop.c
    #define _POSIX_C_SOURCE 200809L
    #include "bhop-movement.h"
    #include <dolly/raylib.h>
    #include <raymath.h>
    #include <rlgl.h>
    #include <errno.h>
    #include <stdio.h>
    #include <stdlib.h>
    #include <time.h>
    
    enum { PLATFORM_COUNT = 23 };
    static const Color SKY = {20, 28, 38, 255}, INK = {231, 235, 234, 255};
    static const Color ACCENT = {255, 185, 82, 255}, CYAN = {84, 218, 205, 255};
    static const Color MUTED = {145, 159, 172, 255};
    static const char *record_path = "/workspace/bhop-record.txt";
    
    typedef struct {
      bh_player player;
      bh_box boxes[PLATFORM_COUNT];
      int forward, backward, left, right, turn_left, turn_right, looking, quit;
      int checkpoint, furthest, deaths, finished, ticks, air_ticks, gain_ticks;
      float yaw, pitch, elapsed, best, peak_speed, last_speed, landing_speed;
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
    static int is_checkpoint(int index) { return index == 0 || index == 7 || index == 14 || index == 22; }
    
    static void make_course(game *state) {
      const float offsets[] = {0, 0, 48, 106, 152, 110, 42, 0, -64, -138, -180,
        -116, -34, 54, 90, 178, 240, 172, 72, -36, -100, -40, 0};
      for (int i = 0; i < PLATFORM_COUNT; ++i) {
        float width = i == 0 ? 512 : is_checkpoint(i) ? 240 : 112;
        float depth = i == 0 ? 512 : is_checkpoint(i) ? 210 : 112;
        float z = i == 0 ? 0 : -360 - (i - 1) * 168;
        float top = (i % 7 == 3 || i % 7 == 4) ? 16 : 0;
        state->boxes[i] = (bh_box){{offsets[i] - width / 2, top - 64, z - depth / 2},
          {offsets[i] + width / 2, top, z + depth / 2}};
      }
    }
    static void clear_keys(game *state) {
      state->forward = state->backward = state->left = state->right = 0;
      state->turn_left = state->turn_right = 0;
      state->player.jump_queue = 0;
    }
    static void respawn(game *state, int restart) {
      if (restart) {
        state->checkpoint = state->furthest = state->deaths = state->finished = 0;
        state->ticks = state->air_ticks = state->gain_ticks = 0;
        state->elapsed = state->peak_speed = state->landing_speed = 0;
      }
      bh_box pad = state->boxes[state->checkpoint];
      state->player = (bh_player){.position = {(pad.low[0] + pad.high[0]) / 2,
        pad.high[1] + 0.01f, (pad.low[2] + pad.high[2]) / 2 + (state->checkpoint == 0 ? 115 : 40)},
        .ground = state->checkpoint};
      state->yaw = 0;
      state->pitch = -0.06f;
      state->last_speed = 0;
      clear_keys(state);
    }
    static void tick(game *state) {
      if (!state->looking || state->finished) return;
      state->yaw += (state->turn_right - state->turn_left) * BH_STEP * 1.6f;
      int grounded = state->player.ground >= 0;
      float before = bh_speed(&state->player);
      bh_tick(&state->player, state->yaw, state->forward - state->backward,
        state->right - state->left, state->boxes, PLATFORM_COUNT);
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
        if (!state->best || state->elapsed < state->best) {
          state->best = state->elapsed;
          FILE *record = fopen(record_path, "w");
          if (record) { fprintf(record, "%.3f\n", state->best); fclose(record); }
        }
      }
      if (state->player.position[1] < -200) { ++state->deaths; respawn(state, 0); }
      state->last_speed = speed;
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
        }
      }
    }
    static void label(Font font, const char *message, float x, float y, float size, Color color) {
      DrawTextEx(font, message, (Vector2){x, y}, size, 0, color);
    }
    static void platform(bh_box box, int index, float fade) {
      Vector3 middle = center(box);
      Color rim = blend(is_checkpoint(index) ? CYAN : ACCENT, SKY, fade);
      Color stone = blend((Color){132, 144, 153, 255}, SKY, fade);
      DrawCube(middle, box.high[0] - box.low[0], 64, box.high[2] - box.low[2], stone);
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
      DrawCube((Vector3){middle.x, box.low[1] - 84, middle.z}, 22, 168, 22,
        blend((Color){43, 59, 73, 255}, SKY, fade));
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
      for (int i = 0; i < PLATFORM_COUNT; ++i) {
        float distance = Vector3Distance(eye, center(state->boxes[i]));
        if (distance < 1900) platform(state->boxes[i], i, Clamp((distance - 450) / 1500, 0, 0.92f));
      }
      for (int i = 0; i < 18; ++i) {
        float z = 250 - i * 240;
        if (fabsf(z - eye.z) > 1700) continue;
        float fade = Clamp((fabsf(z - eye.z) - 400) / 1400, 0, 0.93f);
        for (int side = -1; side <= 1; side += 2) {
          float x = side * 490;
          DrawCube((Vector3){x, 55, z}, 28, 530, 36, blend((Color){43, 56, 69, 255}, SKY, fade));
          DrawCube((Vector3){x, 95, z - 18.5f}, 7, 190, 2, blend(ACCENT, SKY, fade));
        }
        DrawCube((Vector3){0, -216, z}, 1020, 12, 15, blend((Color){38, 53, 66, 255}, SKY, fade));
      }
      EndMode3D();
    
      DrawRectangle(0, 0, width, 62, (Color){12, 18, 25, 255});
      label(font, "A I R T I M E", 18, 10, 25, INK);
      label(font, "GOLDSRC-STYLE STRAFE TRIALS", 20, 39, 11, ACCENT);
      char text[160];
      snprintf(text, sizeof(text), "%05.2f  /  BEST %s", state->elapsed, state->best > 0 ? TextFormat("%.2f", state->best) : "--");
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
    
      DrawLine(width / 2 - 5, height / 2, width / 2 + 5, height / 2, INK);
      DrawLine(width / 2, height / 2 - 5, width / 2, height / 2 + 5, INK);
      if (!state->looking || state->finished) {
        int panel_width = width > 540 ? 500 : width - 30, x = (width - panel_width) / 2;
        DrawRectangle(x, height / 2 - 74, panel_width, 150, (Color){12, 18, 25, 255});
        DrawRectangle(x, height / 2 - 74, panel_width, 2, ACCENT);
        label(font, state->finished ? "COURSE COMPLETE" : "CLICK TO TAKE THE MOUSE", x + 22, height / 2 - 54, 23, INK);
        label(font, "W to launch. In air, release W and strafe A / D", x + 22, height / 2 - 17, 12, MUTED);
        label(font, "while turning the mouse in the same direction.", x + 22, height / 2 + 3, 12, MUTED);
        label(font, state->finished ? "R to race again. Q returns to Slop." :
          "Space or either wheel direction jumps. Esc releases.", x + 22, height / 2 + 38, 12, ACCENT);
      }
    }
    static int usage(const char *name, int status) {
      fprintf(status ? stderr : stdout, "usage: %s [--frames COUNT]\n"
        "Click once for mouse look; Escape releases. WASD moves; Space and wheel up/down jump.\n"
        "R restarts; F returns to a checkpoint; Q exits. Release W in air and match A/D with mouse turn.\n", name);
      return status;
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
      dolly_raylib graphics;
      if (dolly_raylib_open_sized(&graphics, "Dolly Airtime", 960, 540) != 0) return 1;
      if (dolly_raylib_set_cursor(&graphics, DOLLY_DISPLAY_CURSOR_CAPTURED) != 0) {
        dolly_raylib_close(&graphics);
        fputs("bhop: this runtime does not support captured mouse input\n", stderr);
        return 1;
      }
      Font font = LoadFontEx("/usr/share/fonts/IosevkaTerm-SemiBold.ttf", 32, NULL, 0);
      if (!IsFontValid(font)) { dolly_raylib_close(&graphics); return 1; }
      SetTextureFilter(font.texture, TEXTURE_FILTER_BILINEAR);
      rlSetClipPlanes(1, 2400);
      game state = {0};
      make_course(&state);
      respawn(&state, 1);
      FILE *record = fopen(record_path, "r");
      if (record) { if (fscanf(record, "%f", &state.best) != 1 || !isfinite(state.best) || state.best < 0) state.best = 0; fclose(record); }
      double previous = seconds(), accumulator = 0;
      unsigned long frames = 0;
      int result = 0;
      while (!state.quit && (!limit || frames < limit)) {
        if (frames && dolly_raylib_wait_frame(&graphics, 1000) < 0) { result = 1; break; }
        dolly_input_event event;
        for (int i = 0; i < 256; ++i) {
          int status = dolly_raylib_next_event(&graphics, &event, 0);
          if (status < 0) { result = 1; state.quit = 1; break; }
          if (!status) break;
          input(&state, &event);
        }
        if (state.quit) break;
        double now = seconds();
        accumulator += now >= previous ? fmin(now - previous, 0.1) : 0;
        previous = now;
        for (int i = 0; accumulator >= BH_STEP && i < 10; ++i, accumulator -= BH_STEP) tick(&state);
        draw(&state, font, graphics.surface.width, graphics.surface.height);
        if (dolly_raylib_end_frame(&graphics) != 0) { result = 1; break; }
        ++frames;
      }
      UnloadFont(font);
      dolly_raylib_close(&graphics);
      printf("bhop: ticks=%d jumps=%d falls=%d pad=%d peak=%.3f speed=%.3f\n",
        state.ticks, state.player.jumps, state.deaths, state.furthest, state.peak_speed, bh_speed(&state.player));
      return result;
    }

FILE /usr/src/dolly/bhop/bhop.mk
    .PHONY: all check
    all: /usr/bin/bhop
    /usr/bin/bhop: /usr/src/dolly/bhop/bhop.c /usr/src/dolly/bhop/bhop-movement.h /usr/lib/libdolly-raylib.a /usr/lib/libraylib.a /usr/lib/libm.a
    	cc -std=c17 -O2 -fno-builtin $< -o $@ -ldolly-raylib -lraylib -lm
    check:
    	@output=/tmp/bhop-check.$$$$; status=0; cc -std=c17 -O2 -fno-builtin /usr/src/dolly/bhop/bhop-check.c -o "$$output" -lm && "$$output" || status=$$?; rm -f "$$output"; exit "$$status"

SLOP make -f /usr/src/dolly/bhop/bhop.mk all check

EXPORTS TOOL bhop
