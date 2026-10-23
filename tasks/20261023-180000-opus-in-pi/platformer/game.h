/* game.h - shared types and constants for the platformer */
#ifndef GAME_H
#define GAME_H

#include <stdbool.h>

#define TILE      16
#define VIEW_W    480
#define VIEW_H    272
#define MAXW      512
#define MAXH      64
#define MAXE      96
#define NLEVELS   3
#define DT        (1.0f / 60.0f)

/* Player tuning (pixels, seconds) */
#define P_W         12
#define P_H         14
#define RUN_ACCEL   1500.0f
#define AIR_ACCEL   1000.0f
#define FRICTION    1800.0f
#define MAX_RUN     140.0f
#define GRAVITY     1300.0f
#define JUMP_CUT_G  3.0f      /* gravity multiplier while rising with jump released */
#define JUMP_VEL    420.0f
#define MAX_FALL    520.0f
#define COYOTE_T    0.10f
#define JUMPBUF_T   0.12f
#define STOMP_VEL   300.0f

#define E_W     14
#define E_H     12
#define E_SPEED 40.0f

typedef struct {
    float x, y, vx, vy;
    bool alive;
    float squash;           /* >0: dying animation */
} Enemy;

typedef struct {
    int w, h;
    char t[MAXH][MAXW + 1];
    float sx, sy;           /* spawn */
    Enemy e[MAXE];
    int ne;
    int coins_left;
    char name[64];
} Level;

typedef struct {
    float x, y, vx, vy;
    bool on_ground;
    float coyote, jump_buf;
    bool jump_held_prev;
    int facing;
    bool dead;
    float dead_t;
    float anim;
} Player;

typedef struct {
    bool left, right, jump;
} Input;

/* level.c */
int  level_load(Level *L, const char *path);
bool level_solid(const Level *L, int tx, int ty);
char level_get(const Level *L, int tx, int ty);
void level_set(Level *L, int tx, int ty, char c);
bool box_hits_solid(const Level *L, float x, float y, float w, float h);
bool box_hits_char(const Level *L, float x, float y, float w, float h, char c);
int  level_reachable(const Level *L);

/* player.c */
enum { EV_NONE = 0, EV_COIN = 1, EV_STOMP = 2, EV_HURT = 4, EV_GOAL = 8 };
void player_spawn(Player *p, const Level *L);
int  player_update(Player *p, Level *L, const Input *in);

/* enemy.c */
void enemies_update(Level *L);

/* render.c */
struct SDL_Renderer;
void draw_text(struct SDL_Renderer *r, int x, int y, int scale, const char *s,
               unsigned rgb);
int  text_width(const char *s, int scale);
void draw_world(struct SDL_Renderer *r, const Level *L, const Player *p,
                float camx, float camy, int frame);

#endif
