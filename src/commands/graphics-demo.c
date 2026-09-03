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
  if (state->explosion_flash > 0.0f)
    state->explosion_flash = fmaxf(0.0f, state->explosion_flash - 0.055f);

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
