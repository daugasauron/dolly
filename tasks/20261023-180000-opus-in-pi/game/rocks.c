// rocks.c - a tiny Asteroids for Dolly's display.
// Arrows/WASD: turn and thrust, Space: fire, R: restart, Q/Esc: quit.
#include <dolly/display.h>
#include <dolly/input.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#define W 320
#define H 240
#define MAXR 64
#define MAXB 16
#define MAXP 200

static uint32_t fb[W * H];
typedef struct { float x, y, vx, vy, r, a, spin; int alive, size; } Rock;
typedef struct { float x, y, vx, vy, life; } Bullet;
typedef struct { float x, y, vx, vy, life; uint32_t c; } Part;
static Rock rocks[MAXR];
static Bullet bul[MAXB];
static Part parts[MAXP];
static float sx, sy, svx, svy, sa, cool, inv, dead_t;
static int score, best, lives, level, gameover;
static int kl, kr, ku, kf;

static float frand(float a, float b) { return a + (b - a) * (rand() / (float)RAND_MAX); }
static uint32_t rgb(int r, int g, int b) { return 0xff000000u | (b << 16) | (g << 8) | r; }

static void pset(int x, int y, uint32_t c) {
  x = (x % W + W) % W; y = (y % H + H) % H; fb[y * W + x] = c;
}
static void line(float x0, float y0, float x1, float y1, uint32_t c) {
  float dx = x1 - x0, dy = y1 - y0;
  int n = (int)(fmaxf(fabsf(dx), fabsf(dy))) + 1;
  for (int i = 0; i <= n; i++) pset((int)(x0 + dx * i / n), (int)(y0 + dy * i / n), c);
}

// 3x5 digit font
static const char *dig[10] = {"111101101101111","010110010010111","111001111100111",
  "111001111001111","101101111001001","111100111001111","111100111101111",
  "111001001001001","111101111101111","111101111001111"};
static void num(int x, int y, int v, uint32_t c) {
  char s[16]; snprintf(s, sizeof s, "%d", v);
  for (char *p = s; *p; p++, x += 8)
    for (int i = 0; i < 15; i++)
      if (dig[*p - '0'][i] == '1')
        for (int k = 0; k < 4; k++) pset(x + (i % 3) * 2 + k % 2, y + (i / 3) * 2 + k / 2, c);
}

static void spawn_rock(float x, float y, int size) {
  for (int i = 0; i < MAXR; i++) if (!rocks[i].alive) {
    Rock *r = &rocks[i];
    float sp = frand(15, 35) * (4 - size) * 0.6f, d = frand(0, 6.283f);
    *r = (Rock){x, y, cosf(d) * sp, sinf(d) * sp, size * 7.0f, 0, frand(-2, 2), 1, size};
    return;
  }
}
static void boom(float x, float y, int n, uint32_t c) {
  for (int i = 0; i < MAXP && n; i++) if (parts[i].life <= 0) {
    float d = frand(0, 6.283f), sp = frand(20, 90);
    parts[i] = (Part){x, y, cosf(d) * sp, sinf(d) * sp, frand(0.3f, 0.9f), c}; n--;
  }
}
static void new_level(void) {
  level++;
  for (int i = 0; i < 2 + level; i++) {
    float x = frand(0, W), y = frand(0, H);
    if (hypotf(x - sx, y - sy) < 70) x = fmodf(x + W / 2, W);
    spawn_rock(x, y, 3);
  }
}
static void reset_ship(void) { sx = W / 2; sy = H / 2; svx = svy = 0; sa = -1.5708f; inv = 2.5f; }
static void new_game(void) {
  memset(rocks, 0, sizeof rocks); memset(bul, 0, sizeof bul);
  score = 0; lives = 3; level = 0; gameover = 0; dead_t = 0;
  reset_ship(); new_level();
}

static float wrapd(float d, float m) { if (d > m / 2) d -= m; if (d < -m / 2) d += m; return d; }

static void update(float dt) {
  if (!gameover && dead_t <= 0) {
    if (kl) sa -= 4.5f * dt;
    if (kr) sa += 4.5f * dt;
    if (ku) {
      svx += cosf(sa) * 160 * dt; svy += sinf(sa) * 160 * dt;
      if (rand() % 2) boom(sx - cosf(sa) * 6, sy - sinf(sa) * 6, 1, rgb(255, 160, 40));
    }
    cool -= dt;
    if (kf && cool <= 0) {
      for (int i = 0; i < MAXB; i++) if (bul[i].life <= 0) {
        bul[i] = (Bullet){sx + cosf(sa) * 8, sy + sinf(sa) * 8,
                          svx + cosf(sa) * 260, svy + sinf(sa) * 260, 0.9f};
        break;
      }
      cool = 0.16f;
    }
    svx *= powf(0.6f, dt); svy *= powf(0.6f, dt);
    sx = fmodf(sx + svx * dt + W, W); sy = fmodf(sy + svy * dt + H, H);
    if (inv > 0) inv -= dt;
  } else if (dead_t > 0 && (dead_t -= dt) <= 0) {
    if (lives > 0) reset_ship(); else gameover = 1;
  }
  int any = 0;
  for (int i = 0; i < MAXR; i++) {
    Rock *r = &rocks[i]; if (!r->alive) continue; any = 1;
    r->x = fmodf(r->x + r->vx * dt + W, W); r->y = fmodf(r->y + r->vy * dt + H, H);
    r->a += r->spin * dt;
    if (!gameover && dead_t <= 0 && inv <= 0 &&
        hypotf(wrapd(r->x - sx, W), wrapd(r->y - sy, H)) < r->r + 4) {
      boom(sx, sy, 60, rgb(255, 255, 255)); boom(sx, sy, 40, rgb(255, 120, 40));
      lives--; dead_t = 2; if (score > best) best = score;
    }
  }
  for (int b = 0; b < MAXB; b++) {
    Bullet *u = &bul[b]; if (u->life <= 0) continue;
    u->life -= dt;
    u->x = fmodf(u->x + u->vx * dt + W, W); u->y = fmodf(u->y + u->vy * dt + H, H);
    for (int i = 0; i < MAXR; i++) {
      Rock *r = &rocks[i];
      if (r->alive && hypotf(wrapd(r->x - u->x, W), wrapd(r->y - u->y, H)) < r->r) {
        r->alive = 0; u->life = 0;
        score += (4 - r->size) * 20 + 10;
        boom(r->x, r->y, 10 + r->size * 6, rgb(180, 200, 255));
        if (r->size > 1) { spawn_rock(r->x, r->y, r->size - 1); spawn_rock(r->x, r->y, r->size - 1); }
        break;
      }
    }
  }
  for (int i = 0; i < MAXP; i++) if (parts[i].life > 0) {
    Part *p = &parts[i]; p->life -= dt; p->x += p->vx * dt; p->y += p->vy * dt;
  }
  if (!any && !gameover) { new_level(); inv = 1.5f; }
  if (score > best && gameover) best = score;
}

static void draw(double t) {
  for (int i = 0; i < W * H; i++) fb[i] = rgb(4, 4, 16);
  srand(7); for (int i = 0; i < 60; i++) { int b = 60 + rand() % 120; pset(rand() % W, rand() % H, rgb(b, b, b)); }
  srand((unsigned)(t * 1000));
  for (int i = 0; i < MAXP; i++) if (parts[i].life > 0) pset(parts[i].x, parts[i].y, parts[i].c);
  for (int i = 0; i < MAXR; i++) {
    Rock *r = &rocks[i]; if (!r->alive) continue;
    float px = 0, py = 0, fx = 0, fy = 0;
    for (int k = 0; k <= 9; k++) {
      float a = r->a + k * 6.283f / 9, rr = r->r * (0.75f + 0.25f * ((k * 7 + i) % 3) / 2.0f);
      float x = r->x + cosf(a) * rr, y = r->y + sinf(a) * rr;
      if (k) line(px, py, x, y, rgb(150, 170, 220)); else { fx = x; fy = y; }
      px = x; py = y;
    }
    (void)fx; (void)fy;
  }
  for (int b = 0; b < MAXB; b++) if (bul[b].life > 0) {
    pset(bul[b].x, bul[b].y, rgb(255, 255, 120)); pset(bul[b].x + 1, bul[b].y, rgb(255, 255, 120));
    pset(bul[b].x, bul[b].y + 1, rgb(255, 255, 120)); pset(bul[b].x + 1, bul[b].y + 1, rgb(255, 255, 120));
  }
  if (!gameover && dead_t <= 0 && (inv <= 0 || (int)(t * 10) % 2)) {
    float c = cosf(sa), s = sinf(sa);
    float ax = sx + c * 8, ay = sy + s * 8;
    float bx = sx - c * 6 + s * 5, by = sy - s * 6 - c * 5;
    float cx = sx - c * 6 - s * 5, cy = sy - s * 6 + c * 5;
    uint32_t col = rgb(120, 255, 160);
    line(ax, ay, bx, by, col); line(ax, ay, cx, cy, col);
    line(bx, by, sx - c * 3, sy - s * 3, col); line(cx, cy, sx - c * 3, sy - s * 3, col);
  }
  num(4, 4, score, rgb(255, 255, 255));
  num(W - 60, 4, best, rgb(255, 200, 80));
  for (int i = 0; i < lives; i++) line(W / 2 - 20 + i * 12, 12, W / 2 - 16 + i * 12, 4, rgb(120, 255, 160)),
                                  line(W / 2 - 12 + i * 12, 12, W / 2 - 16 + i * 12, 4, rgb(120, 255, 160));
  if (gameover && (int)(t * 2) % 2)   // flashing bar: press R
    for (int y = H / 2 - 3; y < H / 2 + 3; y++) for (int x = 100; x < 220; x++) pset(x, y, rgb(255, 60, 60));
}

static double now(void) {
  struct timespec ts; clock_gettime(CLOCK_MONOTONIC, &ts); return ts.tv_sec + ts.tv_nsec * 1e-9;
}

static int key(const dolly_input_event *e, int *quit) {
  const char *code = (const char *)e->data + e->key_length;
  int n = e->code_length, down = e->action != DOLLY_KEY_ACTION_RELEASE;
#define IS(s) (n == (int)strlen(s) && !memcmp(code, s, n))
  if (IS("ArrowLeft") || IS("KeyA")) kl = down;
  else if (IS("ArrowRight") || IS("KeyD")) kr = down;
  else if (IS("ArrowUp") || IS("KeyW")) ku = down;
  else if (IS("Space")) kf = down;
  else if ((IS("KeyR")) && down && gameover) new_game();
  else if ((IS("KeyQ") || IS("Escape")) && down) *quit = 1;
  return 0;
}

int main(int argc, char **argv) {
  srand((unsigned)time(NULL));
  if (argc > 1 && !strcmp(argv[1], "--test")) {   // headless simulation check
    new_game(); kf = 1;
    for (int i = 0; i < 60 * 120; i++) { kl = (i / 50) % 3 == 0; ku = (i / 70) % 4 == 0; update(1 / 60.0f); draw(i / 60.0); if (gameover) new_game(); }
    printf("ok: score %d best %d level %d lives %d\n", score, best, level, lives);
    return 0;
  }
  dolly_display_surface surf; uint64_t ig;
  int rc = dolly_display_acquire(&surf);
  if (rc < 0) { fprintf(stderr, "rocks: display unavailable (%d)\n", rc); return 1; }
  if ((rc = dolly_input_acquire(&ig)) < 0) {
    fprintf(stderr, "rocks: input unavailable (%d)\n", rc); dolly_display_release(surf.generation); return 1;
  }
  dolly_display_set_size(surf.generation, W, H, &surf);
  dolly_display_set_cursor(surf.generation, DOLLY_DISPLAY_CURSOR_HIDDEN);
  new_game();
  uint32_t seq = 0; double last = now(); int quit = 0;
  while (!quit) {
    dolly_input_event e;
    while (dolly_input_next_event(ig, &e, 0) == 1) {
      if (e.type == DOLLY_INPUT_EVENT_KEY) key(&e, &quit);
      else if (e.type == DOLLY_INPUT_EVENT_DROPPED || (e.type == DOLLY_INPUT_EVENT_FOCUS && !e.action))
        kl = kr = ku = kf = 0;
    }
    double t = now(); float dt = (float)(t - last); last = t;
    if (dt > 0.05f) dt = 0.05f;
    update(dt); draw(t);
    dolly_display_frame f;
    if (dolly_display_begin_frame(surf.generation, &f) == 0) {
      for (uint32_t y = 0; y < f.height && y < H; y++)
        memcpy(f.pixels + (size_t)y * f.stride, fb + y * W, (f.width < W ? f.width : W) * 4);
      dolly_display_present(surf.generation, f.buffer_index);
    }
    dolly_display_wait_frame(surf.generation, &seq, 50);
  }
  dolly_input_release(ig);
  dolly_display_release(surf.generation);
  printf("Final score %d, best %d\n", score, best);
  return 0;
}
