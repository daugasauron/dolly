/* main.c - window, game states, camera, HUD, menus; `--check` runs headless tests */
#include "game.h"
#include <SDL2/SDL.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

enum State { ST_TITLE, ST_PLAY, ST_PAUSE, ST_CLEAR, ST_GAMEOVER, ST_WIN };

typedef struct {
    enum State st;
    Level L;
    Player p;
    int level, lives, score, coins;
    float camx, camy;
    float timer;
    int menu;
    int frame;
    char dir[512];
} Game;

static char level_path[600];
static const char *lpath(const Game *g, int n)
{
    snprintf(level_path, sizeof level_path, "%s/level%d.txt", g->dir, n + 1);
    return level_path;
}

static void center_camera(Game *g, bool snap)
{
    float tx = g->p.x + P_W / 2 - VIEW_W / 2 + g->p.facing * 32;
    float ty = g->p.y + P_H / 2 - VIEW_H / 2 - 16;
    float maxx = g->L.w * TILE - VIEW_W, maxy = g->L.h * TILE - VIEW_H;
    if (tx > maxx) tx = maxx;
    if (tx < 0) tx = 0;
    if (ty > maxy) ty = maxy;
    if (ty < 0) ty = 0;
    if (snap) { g->camx = tx; g->camy = ty; return; }
    g->camx += (tx - g->camx) * 0.12f;
    g->camy += (ty - g->camy) * 0.08f;
}

static int start_level(Game *g, int n)
{
    int rc = level_load(&g->L, lpath(g, n));
    if (rc) { fprintf(stderr, "platformer: cannot load %s (%d)\n", level_path, rc); return -1; }
    g->level = n;
    player_spawn(&g->p, &g->L);
    center_camera(g, true);
    g->st = ST_PLAY;
    return 0;
}

static int new_game(Game *g)
{
    g->lives = 3; g->score = 0; g->coins = 0;
    return start_level(g, 0);
}

static void step_play(Game *g, const Input *in)
{
    enemies_update(&g->L);
    int ev = player_update(&g->p, &g->L, in);
    if (ev & EV_COIN) {
        g->score += 10;
        if (++g->coins >= 50) { g->coins -= 50; g->lives++; }
    }
    if (ev & EV_STOMP) g->score += 100;
    if (ev & EV_GOAL && !g->p.dead) {
        g->score += 500;
        g->st = ST_CLEAR;
        g->timer = 2.0f;
    }
    if (g->p.dead && g->p.dead_t > 1.5f) {
        if (--g->lives <= 0) { g->st = ST_GAMEOVER; g->menu = 0; }
        else start_level(g, g->level);
    }
    if (!g->p.dead) center_camera(g, false);
}

/* ---------- drawing ---------- */

static void shade(SDL_Renderer *r, int alpha)
{
    SDL_SetRenderDrawBlendMode(r, SDL_BLENDMODE_BLEND);
    SDL_SetRenderDrawColor(r, 0, 0, 0, alpha);
    SDL_Rect q = {0, 0, VIEW_W, VIEW_H};
    SDL_RenderFillRect(r, &q);
    SDL_SetRenderDrawBlendMode(r, SDL_BLENDMODE_NONE);
}

static void centered(SDL_Renderer *r, int y, int scale, const char *s, unsigned c)
{
    draw_text(r, (VIEW_W - text_width(s, scale)) / 2, y, scale, s, c);
}

static void draw_menu(SDL_Renderer *r, int y, const char **items, int n, int sel)
{
    char buf[64];
    for (int i = 0; i < n; i++) {
        snprintf(buf, sizeof buf, "%s%s", i == sel ? "> " : "  ", items[i]);
        centered(r, y + i * 20, 2, buf, i == sel ? 0xffd700 : 0xffffff);
    }
}

static void draw(SDL_Renderer *r, Game *g)
{
    char buf[96];
    if (g->st == ST_TITLE) {
        SDL_SetRenderDrawColor(r, 20, 24, 48, 255);
        SDL_RenderClear(r);
        centered(r, 50, 4, "PIXEL DASH", 0xffd700);
        centered(r, 110, 1, "ARROWS OR A/D: MOVE    SPACE, Z, W OR UP: JUMP", 0xffffff);
        centered(r, 124, 1, "HOLD JUMP TO JUMP HIGHER.  STOMP ENEMIES, AVOID SPIKES.", 0xffffff);
        centered(r, 138, 1, "ESC OR P: PAUSE.  REACH THE FLAG!", 0xffffff);
        if ((g->frame / 30) % 2) centered(r, 180, 2, "PRESS ENTER", 0x80ff80);
        return;
    }
    draw_world(r, &g->L, &g->p, g->camx, g->camy, g->frame);
    /* HUD */
    SDL_SetRenderDrawBlendMode(r, SDL_BLENDMODE_BLEND);
    SDL_SetRenderDrawColor(r, 0, 0, 0, 110);
    SDL_Rect bar = {0, 0, VIEW_W, 18};
    SDL_RenderFillRect(r, &bar);
    SDL_SetRenderDrawBlendMode(r, SDL_BLENDMODE_NONE);
    snprintf(buf, sizeof buf, "SCORE %06d", g->score);
    draw_text(r, 6, 5, 1, buf, 0xffffff);
    snprintf(buf, sizeof buf, "COINS %02d", g->coins);
    draw_text(r, 120, 5, 1, buf, 0xffd700);
    snprintf(buf, sizeof buf, "LIVES %d", g->lives);
    draw_text(r, 210, 5, 1, buf, 0xff8080);
    snprintf(buf, sizeof buf, "LEVEL %d-%d", g->level + 1, NLEVELS);
    draw_text(r, VIEW_W - text_width(buf, 1) - 6, 5, 1, buf, 0x80ff80);
    if (g->st == ST_PLAY && g->L.name[0] && g->p.x - g->L.sx < 48 && g->p.dead_t == 0)
        centered(r, 40, 2, g->L.name, 0xffffff);

    if (g->st == ST_PAUSE) {
        static const char *items[] = {"RESUME", "RESTART LEVEL", "QUIT"};
        shade(r, 150);
        centered(r, 60, 3, "PAUSED", 0xffffff);
        draw_menu(r, 120, items, 3, g->menu);
    } else if (g->st == ST_CLEAR) {
        shade(r, 90);
        snprintf(buf, sizeof buf, "LEVEL %d CLEAR!", g->level + 1);
        centered(r, 100, 3, buf, 0xffd700);
    } else if (g->st == ST_GAMEOVER || g->st == ST_WIN) {
        static const char *items[] = {"PLAY AGAIN", "QUIT"};
        shade(r, 180);
        centered(r, 60, 4, g->st == ST_WIN ? "YOU WIN!" : "GAME OVER",
                 g->st == ST_WIN ? 0xffd700 : 0xff4040);
        snprintf(buf, sizeof buf, "FINAL SCORE %d", g->score);
        centered(r, 110, 2, buf, 0xffffff);
        draw_menu(r, 150, items, 2, g->menu);
    }
}

/* ---------- headless checks ---------- */

static int fails;
#define CHECK(c, ...) do { if (c) printf("ok   "); else { printf("FAIL "); fails++; } \
                           printf(__VA_ARGS__); printf("\n"); } while (0)

static int load_str(Level *L, const char *s)
{
    FILE *f = fopen("/tmp/platformer-test.txt", "w");
    fputs(s, f);
    fclose(f);
    return level_load(L, "/tmp/platformer-test.txt");
}

static float jump_height(Level *L, int hold_frames)
{
    Player p; Input in = {0};
    player_spawn(&p, L);
    for (int i = 0; i < 30; i++) player_update(&p, L, &in);   /* settle */
    float y0 = p.y, top = p.y;
    for (int i = 0; i < 120; i++) {
        in.jump = i < hold_frames;
        player_update(&p, L, &in);
        if (p.y < top) top = p.y;
    }
    return y0 - top;
}

static int run_checks(Game *g)
{
    for (int n = 0; n < NLEVELS; n++) {
        Level L;
        int rc = level_load(&L, lpath(g, n));
        CHECK(rc == 0, "%s loads (%dx%d tiles, %d coins, %d enemies)",
              level_path, L.w, L.h, L.coins_left, L.ne);
        if (rc) continue;
        CHECK(L.h * TILE >= VIEW_H, "level %d is at least a screen tall", n + 1);
        CHECK(level_reachable(&L), "level %d: flag reachable by coarse jump search", n + 1);
        CHECK(!box_hits_solid(&L, L.sx, L.sy, P_W, P_H), "level %d: spawn is free", n + 1);
        int stuck = 0;
        for (int i = 0; i < L.ne; i++)
            if (box_hits_solid(&L, L.e[i].x, L.e[i].y, E_W, E_H)) stuck++;
        CHECK(!stuck, "level %d: no enemy spawns inside a wall", n + 1);
        /* simulate enemies 20 s: none should fall out of the level */
        int alive0 = L.ne;
        for (int i = 0; i < 1200; i++) enemies_update(&L);
        int alive = 0;
        for (int i = 0; i < L.ne; i++) alive += L.e[i].alive;
        CHECK(alive == alive0, "level %d: all %d enemies still patrolling after 20 s", n + 1, alive);
    }

    Level L;
    const char *flat =
        "\n\n\n\n\n\n\n\n"
        "P             F\n"
        "###############\n";
    load_str(&L, flat);
    float full = jump_height(&L, 60), tap = jump_height(&L, 3);
    CHECK(full > 3.5f * TILE && full < 5.0f * TILE, "full jump height %.1f px (%.1f tiles)", full, full / TILE);
    CHECK(tap < full * 0.5f, "tapped jump height %.1f px is much lower (variable jump)", tap);

    /* coyote time: run off a ledge, press jump 4 frames late */
    const char *ledge =
        "\n\n\n\n\n\n\n\n"
        "P             F\n"
        "####          #\n";
    for (int late = 4; late <= 12; late += 8) {
        load_str(&L, ledge);
        Player p; Input in = {0};
        player_spawn(&p, &L);
        for (int i = 0; i < 30; i++) player_update(&p, &L, &in);
        in.right = true;
        int off = -1, jumped = 0;
        for (int i = 0; i < 120 && !jumped; i++) {
            in.jump = off >= 0 && i - off >= late;
            bool was = p.on_ground;
            player_update(&p, &L, &in);
            if (was && !p.on_ground && p.vy >= 0 && off < 0) off = i;
            if (p.vy < -JUMP_VEL * 0.9f) jumped = 1;
        }
        if (late == 4) CHECK(jumped, "coyote: jump %d frames after leaving ledge works", late);
        else CHECK(!jumped, "coyote: jump %d frames after leaving ledge is refused", late);
    }

    /* jump buffer: press jump shortly before landing */
    load_str(&L, flat);
    {
        Player p; Input in = {0};
        player_spawn(&p, &L);
        p.y -= 3 * TILE;
        int jumped = 0;
        for (int i = 0; i < 90 && !jumped; i++) {
            float below = 9 * TILE - (p.y + P_H);
            in.jump = below < 12 && below > 0 ? true : in.jump;
            player_update(&p, &L, &in);
            if (i > 2 && p.vy < -JUMP_VEL * 0.9f) jumped = 1;
        }
        CHECK(jumped, "jump buffer: pressing just before landing jumps");
    }

    /* walls stop the player */
    load_str(&L, "\n\n\n\n\n\n\n\nP   #        F\n###############\n");
    {
        Player p; Input in = {.right = true};
        player_spawn(&p, &L);
        for (int i = 0; i < 120; i++) player_update(&p, &L, &in);
        CHECK(p.x + P_W <= 4 * TILE + 0.01f && p.on_ground, "solid wall blocks the player (x=%.1f)", p.x);
    }

    /* enemy patrol turns at ledges, stomp kills, side contact hurts */
    load_str(&L, "\n\n\n\n\n\n\n\n P  E      F\n   ####  ####\n");
    {
        float minx = 1e9, maxx = -1e9;
        for (int i = 0; i < 600; i++) {
            enemies_update(&L);
            if (L.e[0].x < minx) minx = L.e[0].x;
            if (L.e[0].x > maxx) maxx = L.e[0].x;
        }
        CHECK(L.e[0].alive && minx >= 3 * TILE - 1 && maxx + E_W <= 7 * TILE + 1,
              "enemy patrols its platform (x %.0f..%.0f)", minx, maxx + E_W);
        Player p; Input in = {0};
        player_spawn(&p, &L);
        p.x = L.e[0].x; p.y = L.e[0].y - 40; p.vy = 0;
        int ev = 0;
        for (int i = 0; i < 30 && !(ev & (EV_STOMP | EV_HURT)); i++) ev |= player_update(&p, &L, &in);
        CHECK(ev & EV_STOMP && !p.dead, "landing on an enemy stomps it");
        load_str(&L, "\n\n\n\n\n\n\n\nP   E       F\n##############\n");
        player_spawn(&p, &L);
        in.right = true; ev = 0;
        for (int i = 0; i < 120 && !(ev & EV_HURT); i++) { enemies_update(&L); ev |= player_update(&p, &L, &in); }
        CHECK(ev & EV_HURT, "walking into an enemy hurts");
    }

    /* coins, goal, game flow */
    load_str(&L, "\n\n\n\n\n\n\n\nP ooo F\n#######\n");
    {
        Player p; Input in = {.right = true};
        player_spawn(&p, &L);
        int ev = 0, coins = 0;
        for (int i = 0; i < 120 && !(ev & EV_GOAL); i++) {
            int e = player_update(&p, &L, &in);
            coins += (e & EV_COIN) != 0;
            ev |= e;
        }
        CHECK(L.coins_left == 0 && (ev & EV_GOAL), "coins collected (%d events) and flag reached", coins);
    }
    {
        Input in = {0};
        new_game(g);
        g->p.y = g->L.h * TILE + 100;
        for (int k = 0; k < 3; k++)
            for (int i = 0; i < 200 && g->st == ST_PLAY; i++) {
                if (g->p.y < g->L.h * TILE && !g->p.dead) g->p.y = g->L.h * TILE + 100;
                step_play(g, &in);
            }
        CHECK(g->st == ST_GAMEOVER && g->lives == 0, "falling three times ends the game");
        new_game(g);
        CHECK(g->st == ST_PLAY && g->lives == 3 && g->level == 0, "restart resets lives and level");
    }

    printf("%s: %d failure(s)\n", fails ? "FAILED" : "PASSED", fails);
    return fails ? 1 : 0;
}

/* ---------- main ---------- */

int main(int argc, char **argv)
{
    static Game g;
    bool check = false;
    const char *dir = getenv("PLATFORMER_LEVELS");
    for (int i = 1; i < argc; i++) {
        if (!strcmp(argv[i], "--check")) check = true;
        else if (!strcmp(argv[i], "-d") && i + 1 < argc) dir = argv[++i];
        else { fprintf(stderr, "usage: platformer [--check] [-d LEVELDIR]\n"); return 2; }
    }
    snprintf(g.dir, sizeof g.dir, "%s", dir ? dir : "levels");
    if (check) return run_checks(&g);

    if (SDL_Init(SDL_INIT_VIDEO) != 0) { fprintf(stderr, "SDL_Init: %s\n", SDL_GetError()); return 1; }
    SDL_Window *win = SDL_CreateWindow("Pixel Dash", SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED,
                                       VIEW_W * 2, VIEW_H * 2, SDL_WINDOW_RESIZABLE);
    if (!win) { fprintf(stderr, "SDL_CreateWindow: %s\n", SDL_GetError()); return 1; }
    SDL_Renderer *r = SDL_CreateRenderer(win, -1, 0);
    if (!r) { fprintf(stderr, "SDL_CreateRenderer: %s\n", SDL_GetError()); return 1; }
    SDL_RenderSetLogicalSize(r, VIEW_W, VIEW_H);

    if (level_load(&g.L, lpath(&g, 0))) {
        fprintf(stderr, "platformer: cannot load %s; run from the game directory or pass -d LEVELDIR\n", level_path);
        return 1;
    }
    g.st = ST_TITLE;
    Input in = {0};
    bool kl = 0, kr = 0, ka = 0, kd = 0, kj = 0, quit = false;
    Uint32 last = SDL_GetTicks();
    float acc = 0;

    while (!quit) {
        SDL_Event ev;
        while (SDL_PollEvent(&ev)) {
            if (ev.type == SDL_QUIT) quit = true;
            if (ev.type != SDL_KEYDOWN && ev.type != SDL_KEYUP) continue;
            bool down = ev.type == SDL_KEYDOWN;
            SDL_Keycode k = ev.key.keysym.sym;
            if (k == SDLK_LEFT) kl = down;
            if (k == SDLK_RIGHT) kr = down;
            if (k == SDLK_a) ka = down;
            if (k == SDLK_d) kd = down;
            if (k == SDLK_SPACE || k == SDLK_z || k == SDLK_w || k == SDLK_UP) kj = down;
            if (!down || ev.key.repeat) continue;
            bool enter = k == SDLK_RETURN || k == SDLK_KP_ENTER;
            switch (g.st) {
            case ST_TITLE:
                if (enter || k == SDLK_SPACE) { if (new_game(&g)) quit = true; }
                else if (k == SDLK_ESCAPE || k == SDLK_q) quit = true;
                break;
            case ST_PLAY:
                if (k == SDLK_ESCAPE || k == SDLK_p) { g.st = ST_PAUSE; g.menu = 0; }
                break;
            case ST_PAUSE:
                if (k == SDLK_ESCAPE || k == SDLK_p) g.st = ST_PLAY;
                else if (k == SDLK_UP || k == SDLK_w) g.menu = (g.menu + 2) % 3;
                else if (k == SDLK_DOWN || k == SDLK_s) g.menu = (g.menu + 1) % 3;
                else if (enter) {
                    if (g.menu == 0) g.st = ST_PLAY;
                    else if (g.menu == 1) start_level(&g, g.level);
                    else quit = true;
                }
                break;
            case ST_GAMEOVER:
            case ST_WIN:
                if (k == SDLK_UP || k == SDLK_DOWN || k == SDLK_w || k == SDLK_s) g.menu ^= 1;
                else if (k == SDLK_r) { if (new_game(&g)) quit = true; }
                else if (k == SDLK_q || k == SDLK_ESCAPE) quit = true;
                else if (enter) { if (g.menu == 0) { if (new_game(&g)) quit = true; } else quit = true; }
                break;
            default:
                break;
            }
        }
        in.left = kl || ka; in.right = kr || kd; in.jump = kj;

        Uint32 now = SDL_GetTicks();
        acc += (now - last) / 1000.0f;
        last = now;
        if (acc > 0.25f) acc = 0.25f;
        while (acc >= DT) {
            acc -= DT;
            g.frame++;
            if (g.st == ST_PLAY) step_play(&g, &in);
            else if (g.st == ST_CLEAR && (g.timer -= DT) <= 0) {
                if (g.level + 1 >= NLEVELS) { g.st = ST_WIN; g.menu = 0; }
                else if (start_level(&g, g.level + 1)) quit = true;
            }
        }
        draw(r, &g);
        SDL_RenderPresent(r);
        Uint32 spent = SDL_GetTicks() - now;
        if (spent < 15) SDL_Delay(15 - spent);
    }
    SDL_DestroyRenderer(r);
    SDL_DestroyWindow(win);
    SDL_Quit();
    return 0;
}
