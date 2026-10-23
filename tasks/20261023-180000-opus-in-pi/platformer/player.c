/* player.c - player movement: acceleration, coyote time, jump buffering,
   variable jump height, tile collision, pickups, enemy contact */
#include "game.h"
#include <math.h>

void player_spawn(Player *p, const Level *L)
{
    Player z = {0};
    *p = z;
    p->x = L->sx;
    p->y = L->sy;
    p->facing = 1;
}

static float approach(float v, float target, float step)
{
    if (v < target) return v + step > target ? target : v + step;
    return v - step < target ? target : v - step;
}

int player_update(Player *p, Level *L, const Input *in)
{
    int ev = 0;
    if (p->dead) {                       /* death hop, then fall away */
        p->dead_t += DT;
        p->vy += GRAVITY * DT;
        p->y += p->vy * DT;
        return 0;
    }

    /* horizontal */
    float dir = (in->right ? 1.0f : 0.0f) - (in->left ? 1.0f : 0.0f);
    if (dir != 0) {
        float a = p->on_ground ? RUN_ACCEL : AIR_ACCEL;
        if (dir * p->vx < 0) a *= 1.8f;  /* snappy turnaround */
        p->vx = approach(p->vx, dir * MAX_RUN, a * DT);
        p->facing = dir > 0 ? 1 : -1;
    } else {
        p->vx = approach(p->vx, 0, (p->on_ground ? FRICTION : FRICTION * 0.3f) * DT);
    }

    /* jump timers */
    bool pressed = in->jump && !p->jump_held_prev;
    p->jump_held_prev = in->jump;
    if (pressed) p->jump_buf = JUMPBUF_T; else if (p->jump_buf > 0) p->jump_buf -= DT;
    if (p->on_ground) p->coyote = COYOTE_T; else if (p->coyote > 0) p->coyote -= DT;

    if (p->jump_buf > 0 && p->coyote > 0) {
        p->vy = -JUMP_VEL;
        p->jump_buf = 0;
        p->coyote = 0;
        p->on_ground = false;
    }

    /* gravity, heavier when jump released while rising (variable height) */
    float g = GRAVITY;
    if (p->vy < 0 && !in->jump) g *= JUMP_CUT_G;
    else if (fabsf(p->vy) < 40.0f && in->jump) g *= 0.6f;   /* floaty apex */
    p->vy += g * DT;
    if (p->vy > MAX_FALL) p->vy = MAX_FALL;

    /* move X, resolve */
    p->x += p->vx * DT;
    if (box_hits_solid(L, p->x, p->y, P_W, P_H)) {
        if (p->vx > 0) p->x = floorf((p->x + P_W) / TILE) * TILE - P_W;
        else if (p->vx < 0) p->x = floorf(p->x / TILE) * TILE + TILE;
        p->vx = 0;
    }
    /* move Y, resolve */
    p->y += p->vy * DT;
    p->on_ground = false;
    if (box_hits_solid(L, p->x, p->y, P_W, P_H)) {
        if (p->vy > 0) {
            p->y = floorf((p->y + P_H) / TILE) * TILE - P_H;
            p->on_ground = true;
        } else if (p->vy < 0) {
            p->y = floorf(p->y / TILE) * TILE + TILE;
            /* bump a brick from below: it breaks */
            int tx0 = (int)floorf(p->x / TILE), tx1 = (int)floorf((p->x + P_W - 0.01f) / TILE);
            int ty = (int)floorf(p->y / TILE) - 1;
            for (int tx = tx0; tx <= tx1; tx++)
                if (level_get(L, tx, ty) == 'B') level_set(L, tx, ty, ' ');
        }
        p->vy = 0;
    } else if (p->vy >= 0 && box_hits_solid(L, p->x, p->y + 1, P_W, P_H)) {
        p->on_ground = true;
    }
    if (p->vx != 0 && p->on_ground) p->anim += DT * fabsf(p->vx) / 20.0f;

    /* coins */
    int x0 = (int)floorf(p->x / TILE), x1 = (int)floorf((p->x + P_W - 0.01f) / TILE);
    int y0 = (int)floorf(p->y / TILE), y1 = (int)floorf((p->y + P_H - 0.01f) / TILE);
    for (int ty = y0; ty <= y1; ty++)
        for (int tx = x0; tx <= x1; tx++)
            if (level_get(L, tx, ty) == 'o') {
                level_set(L, tx, ty, ' ');
                L->coins_left--;
                ev |= EV_COIN;
            }

    if (box_hits_char(L, p->x, p->y, P_W, P_H, 'F')) ev |= EV_GOAL;
    /* spikes: only the lower part of the tile hurts */
    if (box_hits_char(L, p->x + 2, p->y + 6, P_W - 4, P_H - 6, '^')) ev |= EV_HURT;
    if (p->y > L->h * TILE + 32) ev |= EV_HURT;

    /* enemies */
    for (int i = 0; i < L->ne; i++) {
        Enemy *e = &L->e[i];
        if (!e->alive || e->squash > 0) continue;
        if (p->x < e->x + E_W && p->x + P_W > e->x &&
            p->y < e->y + E_H && p->y + P_H > e->y) {
            if (p->vy > 0 && p->y + P_H - e->y < 10) {
                e->squash = 0.4f;
                p->vy = in->jump ? -JUMP_VEL * 0.9f : -STOMP_VEL;
                ev |= EV_STOMP;
            } else {
                ev |= EV_HURT;
            }
        }
    }

    if (ev & EV_HURT) {
        p->dead = true;
        p->dead_t = 0;
        p->vy = -JUMP_VEL * 0.8f;
        p->vx = 0;
    }
    return ev;
}
