DOLLY 3
MODULE gamedev

REQUIRES TOOL cc
REQUIRES TOOL make

FILE /usr/src/dolly/gamedev/gamedev.mk
    .PHONY: all
    all: /usr/bin/graphics-demo
    /usr/bin/graphics-demo: /usr/src/dolly/gamedev/graphics-demo.c /usr/lib/libdolly-raylib.a /usr/lib/libraylib.a /usr/lib/libbox3d.a /usr/lib/libm.a
    	cc -std=c17 -O2 -fno-builtin $< -o $@ -ldolly-raylib -lraylib -lbox3d -lm

FILE /usr/src/dolly/gamedev/graphics-demo.c
    #define _POSIX_C_SOURCE 200809L
    #include <box3d/box3d.h>
    #include <dolly/raylib.h>
    #include <raymath.h>
    #include <errno.h>
    #include <math.h>
    #include <stdio.h>
    #include <stdlib.h>
    #include <string.h>
    #include <time.h>
    
    enum { MAX_BODIES = 144, PROJECTILES = 12, STAR_COUNT = 160 };
    static const float STEP = 1.0f / 60.0f;
    static const Color NIGHT = {7, 11, 22, 255}, INK = {227, 235, 249, 255};
    static const Color AMBER = {255, 205, 100, 255}, CYAN = {86, 215, 239, 255};
    static const Color MUTED = {114, 134, 165, 255};
    
    typedef struct {
      b3BodyId id;
      Vector3 half;
      b3Pos origin;
      Color color;
      float mass;
      int sphere;
    } body;
    
    typedef struct {
      b3WorldId world;
      body bodies[MAX_BODIES];
      int count, bricks, shots, next_shot, displaced;
      int gravity, blast, fire, reset, quit, left, right, near, far;
      int pointer_down, pointer_moved;
      float pointer_x, pointer_y, yaw, distance, elevation, time, pulse, cooldown;
      Vector3 pulse_origin;
      Camera3D camera;
    } game;
    
    static float clampf(float value, float low, float high) {
      return fminf(high, fmaxf(low, value));
    }
    
    static double seconds(void) {
      struct timespec now;
      return clock_gettime(CLOCK_MONOTONIC, &now) == 0
        ? (double)now.tv_sec + (double)now.tv_nsec / 1e9 : 0;
    }
    
    static Vector3 vector(b3Pos p) { return (Vector3){p.x, p.y, p.z}; }
    static b3Pos position(Vector3 p) { return (b3Pos){p.x, p.y, p.z}; }
    
    static Color shade(Color color, float light) {
      return (Color){clampf(color.r * light, 0, 255), clampf(color.g * light, 0, 255),
                     clampf(color.b * light, 0, 255), 255};
    }
    
    static Color mix(Color from, Color to, float amount) {
      amount = clampf(amount, 0, 1);
      return (Color){from.r + (to.r - from.r) * amount, from.g + (to.g - from.g) * amount,
                     from.b + (to.b - from.b) * amount, 255};
    }
    
    static int add_body(game *state, Vector3 p, Vector3 half, float angle,
                        Color color, int sphere, int dynamic) {
      if (state->count == MAX_BODIES) return -1;
      b3BodyDef def = b3DefaultBodyDef();
      def.type = dynamic ? b3_dynamicBody : b3_staticBody;
      def.position = position(p);
      def.rotation = b3MakeQuatFromAxisAngle(b3Vec3_axisY, angle);
      def.linearDamping = 0.12f;
      def.angularDamping = 0.15f;
      b3BodyId id = b3CreateBody(state->world, &def);
      b3ShapeDef shape = b3DefaultShapeDef();
      shape.density = sphere ? 5.0f : 1.0f;
      shape.baseMaterial.friction = 0.68f;
      shape.baseMaterial.restitution = sphere ? 0.4f : 0.12f;
      if (sphere) {
        b3Sphere geometry = {{0, 0, 0}, half.x};
        b3CreateSphereShape(id, &shape, &geometry);
        b3Body_SetBullet(id, true);
      } else {
        b3BoxHull hull = b3MakeBoxHull(half.x, half.y, half.z);
        b3CreateHullShape(id, &shape, &hull.base);
      }
      state->bodies[state->count++] = (body){id, half, position(p), color,
        dynamic ? b3Body_GetMass(id) : 0, sphere};
      return 0;
    }
    
    static int reset_world(game *state) {
      if (state->world.index1) b3DestroyWorld(state->world);
      memset(state, 0, sizeof(*state));
      state->yaw = 0.65f;
      state->distance = 36;
      state->elevation = 0.48f;
      b3WorldDef def = b3DefaultWorldDef();
      def.gravity = (b3Vec3){0, -9.8f, 0};
      def.workerCount = 1;
      state->world = b3CreateWorld(&def);
      if (!state->world.index1) return -1;
      add_body(state, (Vector3){0, -0.6f, 0}, (Vector3){10, 0.6f, 10}, 0,
        (Color){40, 56, 77, 255}, 0, 0);
      // Three real stacked structures: no welded tower or animated brick transforms.
      for (int tower = 0; tower < 3; ++tower) {
        float angle = tower * 2 * PI / 3 + 0.4f;
        float x = cosf(angle) * 5.2f, z = sinf(angle) * 5.2f;
        int levels = 9 + tower * 2;
        for (int level = 0; level < levels; ++level) {
          for (int column = -1; column <= 1; ++column) {
            float turn = level & 1 ? PI / 2 : 0;
            Vector3 p = {x + (level & 1 ? column * 0.71f : 0), 0.27f + level * 0.56f,
                         z + (level & 1 ? 0 : column * 0.71f)};
            Color color = mix((Color){97, 139, 157, 255}, (Color){177, 191, 197, 255}, level / 18.0f);
            if (level % 4 == 3) color = AMBER;
            add_body(state, p, (Vector3){1.05f, 0.27f, 0.33f}, turn, color, 0, 1);
          }
        }
      }
      // A low ring of blocks catches projectiles and lifts into the vortex.
      for (int i = 0; i < 32; ++i) {
        float angle = i * 2 * PI / 32;
        add_body(state, (Vector3){8.2f * cosf(angle), 0.5f, 8.2f * sinf(angle)},
          (Vector3){0.36f, 0.48f, 0.64f}, -angle, mix(CYAN, MUTED, (i & 1) * 0.6f), 0, 1);
      }
      state->bricks = state->count;
      return 0;
    }
    
    static void camera_update(game *state) {
      float distance = state->distance * fmaxf(1, 0.95f * GetScreenHeight() / GetScreenWidth());
      state->camera = (Camera3D){
        {sinf(state->yaw) * distance * cosf(state->elevation),
         3 + distance * sinf(state->elevation),
         cosf(state->yaw) * distance * cosf(state->elevation)},
        {0, 3, 0}, {0, 1, 0}, 43, CAMERA_PERSPECTIVE};
    }
    
    static void fire(game *state) {
      Vector3 p = Vector3Lerp(state->camera.position, state->camera.target, 0.2f);
      Vector3 direction = Vector3Normalize(Vector3Subtract(state->camera.target, p));
      int index;
      if (state->shots < PROJECTILES) {
        index = state->count;
        if (add_body(state, p, (Vector3){0.52f, 0.52f, 0.52f}, 0, AMBER, 1, 1) != 0) return;
        ++state->shots;
      } else {
        index = state->bricks + state->next_shot;
        state->next_shot = (state->next_shot + 1) % PROJECTILES;
        b3Body_SetTransform(state->bodies[index].id, position(p), b3Quat_identity);
      }
      b3Body_SetLinearVelocity(state->bodies[index].id,
        (b3Vec3){direction.x * 33, direction.y * 33 + 3, direction.z * 33});
      b3Body_SetAngularVelocity(state->bodies[index].id, b3Vec3_zero);
      state->cooldown = 0.3f;
    }
    
    static void step(game *state) {
      state->time += STEP;
      state->cooldown = fmaxf(0, state->cooldown - STEP);
      state->pulse = fmaxf(0, state->pulse - STEP);
      state->yaw += (state->right - state->left) * STEP;
      state->distance = clampf(state->distance + (state->far - state->near) * STEP * 14, 18, 48);
      camera_update(state);
      if (state->fire && state->cooldown == 0) fire(state);
      state->fire = 0;
      if (state->blast) {
        state->gravity = 0;
        state->pulse = 1.2f;
        state->pulse_origin = (Vector3){0, 3, 0};
        for (int i = 1; i < state->count; ++i) {
          body *item = &state->bodies[i];
          Vector3 d = Vector3Subtract(vector(b3Body_GetPosition(item->id)), state->pulse_origin);
          float length = Vector3Length(d);
          if (length > 22) continue;
          d = Vector3Scale(d, 15 * item->mass / fmaxf(length, 0.2f));
          b3Body_ApplyLinearImpulseToCenter(item->id, (b3Vec3){d.x, d.y + item->mass * 7, d.z}, true);
        }
        state->blast = 0;
      }
      if (state->gravity) {
        for (int i = 1; i < state->count; ++i) {
          body *item = &state->bodies[i];
          b3Pos p = b3Body_GetPosition(item->id);
          if (p.y < -25) continue;
          b3Vec3 v = b3Body_GetLinearVelocity(item->id);
          float angle = i * 2.39996f + state->time * 1.3f;
          float radius = 3.2f + (i % 7) * 0.43f;
          Vector3 target = {cosf(angle) * radius, 3.0f + (i % 19) * 0.46f, sinf(angle) * radius};
          float mass = item->mass;
          b3Body_ApplyForceToCenter(item->id, (b3Vec3){
            mass * clampf((target.x - p.x) * 4 - v.x * 2, -65, 65),
            mass * clampf(9.8f + (target.y - p.y) * 5 - v.y * 2.5f, -65, 65),
            mass * clampf((target.z - p.z) * 4 - v.z * 2, -65, 65)}, true);
          b3Body_ApplyTorque(item->id, (b3Vec3){mass * 0.1f, mass * 0.3f, mass * 0.1f}, true);
        }
      }
      b3World_Step(state->world, STEP, 4);
      state->displaced = 0;
      for (int i = 1; i < state->bricks; ++i) {
        body *item = &state->bodies[i];
        if (Vector3Distance(vector(b3Body_GetPosition(item->id)), vector(item->origin)) > 1.5f)
          ++state->displaced;
      }
    }
    
    static void cube(Vector3 p, Vector3 half, b3Quat rotation, Color color) {
      static const unsigned char faces[6][4] = {
        {0, 2, 3, 1}, {4, 5, 7, 6}, {0, 4, 6, 2},
        {1, 3, 7, 5}, {0, 1, 5, 4}, {2, 6, 7, 3}};
      static const b3Vec3 normals[6] = {{0,0,-1},{0,0,1},{-1,0,0},{1,0,0},{0,-1,0},{0,1,0}};
      Vector3 corners[8];
      for (int i = 0; i < 8; ++i) {
        b3Vec3 v = b3RotateVector(rotation, (b3Vec3){i & 1 ? half.x : -half.x,
          i & 2 ? half.y : -half.y, i & 4 ? half.z : -half.z});
        corners[i] = Vector3Add(p, (Vector3){v.x, v.y, v.z});
      }
      for (int i = 0; i < 6; ++i) {
        b3Vec3 n = b3RotateVector(rotation, normals[i]);
        float light = 0.35f + 0.65f * fmaxf(0, n.x * -0.38f + n.y * 0.83f + n.z * 0.4f);
        Color lit = shade(color, light);
        const unsigned char *f = faces[i];
        DrawTriangle3D(corners[f[0]], corners[f[1]], corners[f[2]], lit);
        DrawTriangle3D(corners[f[0]], corners[f[2]], corners[f[3]], lit);
      }
    }
    
    static void ring(Vector3 center, float radius, float tilt, float phase, Color color) {
      Vector3 previous = {0};
      for (int i = 0; i <= 64; ++i) {
        float angle = i * 2 * PI / 64;
        Vector3 point = {cosf(angle) * radius, sinf(angle) * radius * sinf(tilt),
          sinf(angle) * radius * cosf(tilt)};
        point = Vector3RotateByAxisAngle(point, (Vector3){0, 1, 0}, phase);
        point = Vector3Add(point, center);
        if (i) DrawLine3D(previous, point, color);
        previous = point;
      }
    }
    
    static void text(Font font, const char *value, float x, float y, float size, Color color) {
      DrawTextEx(font, value, (Vector2){x, y}, size, 0.6f, color);
    }
    
    static int controls_top(int height) {
      return height - 58;
    }
    
    static void draw(game *state, Font font, int width, int height) {
      BeginDrawing();
      ClearBackground(NIGHT);
      DrawRectangleGradientV(0, 0, width, height, (Color){9, 15, 30, 255}, NIGHT);
      unsigned random = 0x12345678;
      for (int i = 0; i < STAR_COUNT; ++i) {
        random = random * 1664525u + 1013904223u;
        int x = (random >> 8) % width;
        random = random * 1664525u + 1013904223u;
        int y = (random >> 8) % height;
        Color color = mix((Color){25, 40, 65, 255}, MUTED, (random & 255) / 255.0f);
        DrawPixel(x, y, color);
        if (i % 31 == 0) DrawLine(x - 2, y, x + 2, y, color);
      }
      DrawCircleGradient((Vector2){width * 0.82f, height * 0.26f}, height * 0.17f,
        (Color){39, 61, 88, 255}, (Color){9, 15, 30, 255});
      BeginMode3D(state->camera);
      cube((Vector3){0, -1.45f, 0}, (Vector3){9.5f, 0.35f, 9.5f}, b3Quat_identity, (Color){17, 29, 47, 255});
      for (int i = 0; i < state->count; ++i) {
        body *item = &state->bodies[i];
        Vector3 p = vector(b3Body_GetPosition(item->id));
        if (p.y < -30) continue;
        Color color = mix(item->color, NIGHT, clampf((-p.y - 2) / 28, 0, 1));
        if (item->sphere) {
          DrawSphereEx(p, item->half.x, 6, 10, color);
          b3Vec3 v = b3Body_GetLinearVelocity(item->id);
          DrawLine3D(p, Vector3Subtract(p, (Vector3){v.x * 0.08f, v.y * 0.08f, v.z * 0.08f}), AMBER);
        } else cube(p, item->half, b3Body_GetRotation(item->id), color);
      }
      for (int i = -10; i <= 10; i += 2) {
        DrawLine3D((Vector3){i, 0.015f, -10}, (Vector3){i, 0.015f, 10}, (Color){43, 68, 88, 255});
        DrawLine3D((Vector3){-10, 0.015f, i}, (Vector3){10, 0.015f, i}, (Color){43, 68, 88, 255});
      }
      Color energy = state->gravity ? CYAN : AMBER;
      for (int i = 0; i < 4; ++i) {
        float edge = i & 1 ? 10.03f : -10.03f;
        Vector3 a = i < 2 ? (Vector3){edge, -0.1f, -10} : (Vector3){-10, -0.1f, edge};
        Vector3 b = i < 2 ? (Vector3){edge, -0.1f, 10} : (Vector3){10, -0.1f, edge};
        DrawLine3D(a, b, energy);
      }
      Vector3 core = {0, 4.5f + sinf(state->time) * 0.2f, 0};
      DrawSphereEx(core, 0.42f, 5, 8, INK);
      ring(core, 1.0f, 0.9f, state->time * 0.7f, energy);
      ring(core, 1.3f, -0.7f, -state->time * 0.5f, energy);
      ring((Vector3){0, 0.03f, 0}, 2.0f, 0, 0, AMBER);
      ring((Vector3){0, 0.03f, 0}, 2.2f, 0, 0, (Color){82, 73, 43, 255});
      if (state->gravity) {
        for (int strand = 0; strand < 3; ++strand) {
          Vector3 previous = {0};
          for (int i = 0; i < 72; ++i) {
            float angle = i * 0.13f + state->time * 2 + strand * 2 * PI / 3;
            float radius = 5.7f - i * 0.035f;
            Vector3 point = {cosf(angle) * radius, 0.1f + i * 0.16f, sinf(angle) * radius};
            if (i) DrawLine3D(previous, point, mix((Color){27, 67, 94, 255}, CYAN, i / 90.0f));
            previous = point;
          }
        }
      }
      if (state->pulse > 0) {
        float radius = (1.2f - state->pulse) * 18;
        for (int i = 0; i < 3; ++i)
          ring(state->pulse_origin, radius + i * 0.2f, i * PI / 3, state->time,
            mix(NIGHT, AMBER, state->pulse / 1.2f));
      }
      EndMode3D();
      float title = width > 600 ? 26 : 20;
      text(font, "S I N G U L A R I T Y", 20, 18, title, INK);
      text(font, "DOLLY / ORBITAL PHYSICS LAB", 21, 24 + title, 14, AMBER);
      char info[96];
      snprintf(info, sizeof(info), "%03d BODIES   %03d DISPLACED", state->count - 1, state->displaced);
      text(font, info, 21, 46 + title, 14, MUTED);
      const char *buttons[] = {"FIRE", "PULSE", "GRAVITY", "RESET", "EXIT"};
      int button_width = (width - 32) / 5;
      int top = controls_top(height);
      for (int i = 0; i < 5; ++i) {
        int x = 16 + i * button_width;
        Color color = i == 2 && state->gravity ? CYAN : AMBER;
        DrawRectangle(x, top, button_width - 4, 42, (Color){16, 27, 43, 255});
        DrawRectangle(x, top, button_width - 4, 1, color);
        text(font, buttons[i], x + 9, top + 13, fminf(14, (button_width - 16) / 4.0f), color);
      }
      text(font, "DRAG / A D ORBIT   W S ZOOM", 20, top - 26, 14, MUTED);
      if (width > 750) text(font, "SPACE FIRE   E PULSE   G GRAVITY   R RESET   Q EXIT", 385, top - 26, 14, MUTED);
      if (state->gravity) text(font, "FIELD ACTIVE / E TO RELEASE",
        width > 750 ? width - 267 : 21, width > 750 ? 22 : 70 + title, 14, CYAN);
    }
    
    static void action(game *state, int button) {
      if (button == 0) state->fire = 1;
      if (button == 1) state->blast = 1;
      if (button == 2) state->gravity = !state->gravity;
      if (button == 3) state->reset = 1;
      if (button == 4) state->quit = 1;
    }
    
    static void event(game *state, const dolly_input_event *input, int width, int height) {
      if (input->type == DOLLY_INPUT_EVENT_KEY) {
        int down = input->action != DOLLY_KEY_ACTION_RELEASE;
        if (dolly_raylib_code_is(input, "KeyA") || dolly_raylib_code_is(input, "ArrowLeft")) state->left = down;
        if (dolly_raylib_code_is(input, "KeyD") || dolly_raylib_code_is(input, "ArrowRight")) state->right = down;
        if (dolly_raylib_code_is(input, "KeyW") || dolly_raylib_code_is(input, "ArrowUp")) state->near = down;
        if (dolly_raylib_code_is(input, "KeyS") || dolly_raylib_code_is(input, "ArrowDown")) state->far = down;
        if (input->action == DOLLY_KEY_ACTION_PRESS) {
          const char *codes[] = {"Space", "KeyE", "KeyG", "KeyR", "KeyQ"};
          for (int i = 0; i < 5; ++i) if (dolly_raylib_code_is(input, codes[i])) action(state, i);
          if (dolly_raylib_code_is(input, "Escape")) state->quit = 1;
        }
      } else if (input->type == DOLLY_INPUT_EVENT_POINTER) {
        float x = input->width_css_px, y = input->height_css_px;
        if (input->action == DOLLY_POINTER_ACTION_PRESS) {
          if (y >= controls_top(height) && y < controls_top(height) + 42 &&
              x >= 16 && x < width - 16) {
            action(state, (x - 16) / fmaxf(1, (width - 32) / 5));
            return;
          }
          state->pointer_down = 1;
          state->pointer_moved = 0;
        } else if (input->action == DOLLY_POINTER_ACTION_DRAG && state->pointer_down) {
          float dx = x - state->pointer_x, dy = y - state->pointer_y;
          if (fabsf(dx) + fabsf(dy) > 1) state->pointer_moved = 1;
          state->yaw -= dx * 0.006f;
          state->elevation = clampf(state->elevation + dy * 0.004f, 0.12f, 1.05f);
        } else if (input->action == DOLLY_POINTER_ACTION_RELEASE) {
          if (state->pointer_down && !state->pointer_moved) state->fire = 1;
          state->pointer_down = 0;
        }
        state->pointer_x = x;
        state->pointer_y = y;
      }
    }
    
    static int usage(const char *program, int status) {
      fprintf(status ? stderr : stdout, "usage: %s [--frames COUNT]\n"
        "Space/click fires, G toggles gravity, E releases a pulse, A/D orbit, W/S zoom,\n"
        "drag or touch to orbit, R resets, Q/Escape returns to the terminal.\n", program);
      return status;
    }
    
    int main(int argc, char **argv) {
      unsigned long frame_limit = 0;
      if (argc == 2 && strcmp(argv[1], "--help") == 0) return usage(argv[0], 0);
      if (argc == 3 && strcmp(argv[1], "--frames") == 0) {
        char *end;
        errno = 0;
        frame_limit = strtoul(argv[2], &end, 10);
        if (errno || argv[2][0] < '0' || argv[2][0] > '9' || *end || !frame_limit)
          return usage(argv[0], 2);
      } else if (argc != 1) return usage(argv[0], 2);
      dolly_raylib graphics;
      int status = dolly_raylib_open_sized(&graphics, "Dolly Singularity", 800, 800);
      if (status != 0) {
        fprintf(stderr, "graphics-demo: display initialization failed: %s\n", strerror(-status));
        return 1;
      }
      Font font = LoadFontEx("/usr/share/fonts/IosevkaTerm-SemiBold.ttf", 32, NULL, 0);
      if (IsFontValid(font)) SetTextureFilter(font.texture, TEXTURE_FILTER_BILINEAR);
      game state = {0};
      if (!IsFontValid(font) || reset_world(&state) != 0) {
        if (IsFontValid(font)) UnloadFont(font);
        dolly_raylib_close(&graphics);
        fputs("graphics-demo: could not initialize font or physics\n", stderr);
        return 1;
      }
      camera_update(&state);
      unsigned long frames = 0;
      double started = seconds(), previous = started, accumulator = 0;
      int result = 0;
      while (!state.quit && (!frame_limit || frames < frame_limit)) {
        if (frames && dolly_raylib_wait_frame(&graphics, 1000) < 0) { result = 1; break; }
        dolly_input_event input;
        for (int i = 0; i < 256; ++i) {
          status = dolly_raylib_next_event(&graphics, &input, 0);
          if (status < 0) { result = 1; state.quit = 1; break; }
          if (!status) break;
          event(&state, &input, graphics.surface.width, graphics.surface.height);
        }
        if (state.quit) break;
        if (state.reset && reset_world(&state) != 0) { result = 1; break; }
        double now = seconds();
        accumulator += now >= previous ? fmin(now - previous, 0.1) : STEP;
        previous = now;
        for (int i = 0; accumulator >= STEP && i < 6; ++i, accumulator -= STEP) step(&state);
        camera_update(&state);
        draw(&state, font, graphics.surface.width, graphics.surface.height);
        if (dolly_raylib_end_frame(&graphics) != 0) { result = 1; break; }
        ++frames;
      }
      b3DestroyWorld(state.world);
      UnloadFont(font);
      if (dolly_raylib_close(&graphics) != 0) result = 1;
      if (!result) printf("graphics-demo: %lu frames in %.2fs; terminal restored\n", frames, seconds() - started);
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
    sequentially, in the reusable `Dollyfile-gamedev-sdk` image. The gamedev
    image copies that SDK and compiles only the editable demo and its guidance.
    
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
    select a bounded software render budget with `dolly_raylib_open_sized()`.
    Singularity caps each axis at 800 pixels to accommodate portrait displays;
    choose a smaller size for heavier scenes. The viewport aspect ratio is
    preserved and the browser scales the completed frame to its canvas.
    
    There is no DOM, canvas, WebGL, browser callback, host filesystem, or socket
    API inside a game. Keep automated checks finite with a `--frames N` option.
    
    ## Box3D
    
    Box3D uses opaque IDs, `b3Vec3`/`b3Pos`, quaternions, and C17. Initialize every
    definition with its default helper, such as `b3DefaultWorldDef()` or
    `b3DefaultBodyDef()`. Make boxes with `b3MakeBoxHull()` and
    `b3CreateHullShape()`. Use `b3CreateSphereShape()` for spheres and step with a
    fixed timestep, normally `b3World_Step(world, 1.0f / 60.0f, 4)`.
    The demo applies actual forces to lift its stacked bodies into a vortex.
    Space/click fires; G toggles gravity; E releases a pulse; A/D or drag orbits;
    W/S zooms; R resets; Q/Escape exits. The bottom buttons work with touch.
    
    Dolly intentionally runs Box3D with one worker. Its small target adapter
    replaces upstream's pthread-based timer/scheduler translation unit with clocks
    and serial task semantics inside the same Wasm userspace. This changes no
    physics API, gives the library no new browser import, and matches Dolly's
    compatibility-over-parallelism runtime model.
SLOP make -f /usr/src/dolly/gamedev/gamedev.mk
EXPORTS TOOL graphics-demo
SLOP graphics-demo --help
