#include <box2d/box2d.h>
#include <dolly/raylib.h>

#include <errno.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

enum { MAX_BOXES = 48 };

typedef struct {
  b2BodyId body;
  float half_width;
  float half_height;
  Color color;
} game_box;

typedef struct {
  b2WorldId world;
  b2BodyId player;
  game_box boxes[MAX_BOXES];
  int box_count;
  float scale;
  float origin_x;
  float floor_y;
  int left;
  int right;
  int score;
  int collected[5];
} game;

static const Color COLOR_INK = { 236, 232, 220, 255 };
static const Color COLOR_MUTED = { 126, 126, 118, 255 };
static const Color COLOR_YELLOW = { 242, 212, 92, 255 };
static const Color COLOR_ORANGE = { 226, 132, 68, 255 };
static const Color COLOR_BLUE = { 94, 160, 180, 255 };
static const Color COLOR_BACKGROUND = { 31, 32, 30, 255 };
static const Color COLOR_PANEL = { 45, 46, 43, 255 };

static int usage(const char *program, int status) {
  fprintf(status == 0 ? stdout : stderr,
          "usage: %s [--frames COUNT]\n"
          "A/D or arrows move, Space jumps, click drops a crate, "
          "Q/Escape exits\n",
          program);
  return status;
}

static b2BodyId add_box(game *state, float x, float y, float half_width,
                        float half_height, b2BodyType type, Color color) {
  b2BodyDef body_definition = b2DefaultBodyDef();
  body_definition.type = type;
  body_definition.position = (b2Vec2){x, y};
  b2BodyId body = b2CreateBody(state->world, &body_definition);
  b2Polygon polygon = b2MakeBox(half_width, half_height);
  b2ShapeDef shape = b2DefaultShapeDef();
  shape.density = 1.0f;
  shape.material.friction = 0.55f;
  shape.material.restitution = 0.08f;
  b2CreatePolygonShape(body, &shape, &polygon);
  if (state->box_count < MAX_BOXES) {
    state->boxes[state->box_count++] =
        (game_box){body, half_width, half_height, color};
  }
  return body;
}

static Vector2 screen_position(const game *state, b2Vec2 value) {
  return (Vector2){state->origin_x + value.x * state->scale,
                   state->floor_y - value.y * state->scale};
}

static b2Vec2 world_position(const game *state, float x, float y) {
  return (b2Vec2){(x - state->origin_x) / state->scale,
                  (state->floor_y - y) / state->scale};
}

static void draw_box(const game *state, const game_box *box) {
  b2Vec2 position = b2Body_GetPosition(box->body);
  b2Rot rotation = b2Body_GetRotation(box->body);
  Vector2 center = screen_position(state, position);
  float width = box->half_width * 2.0f * state->scale;
  float height = box->half_height * 2.0f * state->scale;
  Rectangle rectangle = {center.x, center.y, width, height};
  DrawRectanglePro(rectangle, (Vector2){width / 2.0f, height / 2.0f},
                   -b2Rot_GetAngle(rotation) * RAD2DEG, box->color);
  DrawRectangleLinesEx(
      (Rectangle){center.x - width / 2.0f, center.y - height / 2.0f,
                  width, height},
      2.0f, Fade(COLOR_INK, 0.42f));
}

static void draw_scene(game *state, int width, int height, unsigned long tick) {
  BeginDrawing();
  ClearBackground(COLOR_BACKGROUND);

  for (int band = 0; band < 8; ++band) {
    Color shade = (Color){(unsigned char)(31 + band * 2),
                          (unsigned char)(32 + band * 2),
                          (unsigned char)(30 + band * 2), 255};
    DrawRectangle(0, band * height / 8, width, height / 8 + 1, shade);
  }
  for (int x = -width; x < width * 2; x += 90) {
    int drift = (int)(tick % 90);
    DrawCircle(x + drift, 80 + ((x / 90) & 3) * 48, 2.0f, Fade(COLOR_INK, 0.18f));
  }

  DrawRectangle(0, (int)state->floor_y, width,
                height - (int)state->floor_y, COLOR_PANEL);
  DrawLine(0, (int)state->floor_y, width, (int)state->floor_y, COLOR_YELLOW);

  for (int index = 0; index < state->box_count; ++index)
    draw_box(state, &state->boxes[index]);

  static const b2Vec2 gems[5] = {
      {-6.0f, 2.2f}, {-2.8f, 5.2f}, {0.0f, 7.0f}, {3.2f, 4.3f}, {6.1f, 2.1f}};
  b2Vec2 player_position = b2Body_GetPosition(state->player);
  for (int index = 0; index < 5; ++index) {
    if (!state->collected[index] &&
        b2Distance(player_position, gems[index]) < 1.05f) {
      state->collected[index] = 1;
      ++state->score;
    }
    if (!state->collected[index]) {
      Vector2 point = screen_position(state, gems[index]);
      float pulse = 5.0f + 2.0f * sinf((float)tick * 0.08f + index);
      DrawPoly(point, 6, pulse + 5.0f, (float)tick * 1.5f, Fade(COLOR_YELLOW, 0.18f));
      DrawPoly(point, 6, pulse, (float)tick * -2.0f, COLOR_YELLOW);
    }
  }

  DrawRectangleRounded((Rectangle){18, 18, 310, 72}, 0.18f, 6,
                       Fade(COLOR_PANEL, 0.94f));
  DrawText("DOLLY DROP", 34, 29, 24, COLOR_YELLOW);
  DrawText("A/D move  SPACE jump  click: crate", 34, 61, 16, COLOR_INK);
  char score[32];
  snprintf(score, sizeof(score), "%d / 5", state->score);
  int score_width = MeasureText(score, 24);
  DrawText(score, width - score_width - 28, 29, 24,
           state->score == 5 ? COLOR_YELLOW : COLOR_INK);
  if (state->score == 5) {
    const char *message = "SANDBOX CLEARED";
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
    if (down && (dolly_raylib_code_is(event, "Space") ||
                 dolly_raylib_code_is(event, "KeyW") ||
                 dolly_raylib_code_is(event, "ArrowUp"))) {
      b2Vec2 velocity = b2Body_GetLinearVelocity(state->player);
      if (velocity.y < 4.0f)
        b2Body_ApplyLinearImpulseToCenter(state->player,
                                          (b2Vec2){0.0f, 5.8f}, true);
    }
  } else if (event->type == DOLLY_INPUT_EVENT_POINTER &&
             event->action == DOLLY_POINTER_ACTION_PRESS &&
             state->box_count < MAX_BOXES) {
    b2Vec2 point = world_position(state, (float)event->width_css_px,
                                  (float)event->height_css_px);
    if (point.y < 1.0f) point.y = 1.0f;
    add_box(state, point.x, point.y, 0.38f, 0.38f, b2_dynamicBody,
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
  int status = dolly_raylib_open(&graphics, "Dolly Drop");
  if (status != 0) {
    fprintf(stderr, "graphics-demo: display initialization failed: %s\n",
            strerror(-status));
    return 1;
  }

  game state = {0};
  state.scale = fminf((float)graphics.surface.width / 20.0f,
                      (float)graphics.surface.height / 12.0f);
  state.origin_x = (float)graphics.surface.width / 2.0f;
  state.floor_y = (float)graphics.surface.height - state.scale * 1.1f;
  b2WorldDef world_definition = b2DefaultWorldDef();
  world_definition.gravity = (b2Vec2){0.0f, -13.0f};
  state.world = b2CreateWorld(&world_definition);

  add_box(&state, 0.0f, -0.55f, 10.0f, 0.55f, b2_staticBody, COLOR_PANEL);
  add_box(&state, -4.5f, 2.0f, 2.2f, 0.22f, b2_staticBody, COLOR_MUTED);
  add_box(&state, 4.2f, 3.3f, 2.0f, 0.22f, b2_staticBody, COLOR_MUTED);
  add_box(&state, 0.0f, 5.6f, 1.7f, 0.18f, b2_staticBody, COLOR_MUTED);
  for (int index = 0; index < 7; ++index)
    add_box(&state, 2.7f + 0.12f * (index & 1), 1.0f + index * 0.82f,
            0.38f, 0.38f, b2_dynamicBody,
            index & 1 ? COLOR_ORANGE : COLOR_BLUE);
  state.player = add_box(&state, -6.2f, 4.0f, 0.48f, 0.68f,
                         b2_dynamicBody, COLOR_YELLOW);
  b2Body_SetFixedRotation(state.player, true);

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

    b2Vec2 velocity = b2Body_GetLinearVelocity(state.player);
    velocity.x = (float)(state.right - state.left) * 5.2f;
    b2Body_SetLinearVelocity(state.player, velocity);
    b2World_Step(state.world, 1.0f / 60.0f, 4);

    b2Vec2 player_position = b2Body_GetPosition(state.player);
    if (player_position.y < -4.0f) {
      b2Body_SetTransform(state.player, (b2Vec2){-6.2f, 4.0f}, b2MakeRot(0));
      b2Body_SetLinearVelocity(state.player, (b2Vec2){0, 0});
    }
    draw_scene(&state, (int)graphics.surface.width,
               (int)graphics.surface.height, frame);
    if (dolly_raylib_end_frame(&graphics) != 0) {
      result = 1;
      break;
    }
    ++frame;
  }

  b2DestroyWorld(state.world);
  if (dolly_raylib_close(&graphics) != 0) result = 1;
  if (result == 0) puts("graphics-demo: terminal restored");
  return result;
}
