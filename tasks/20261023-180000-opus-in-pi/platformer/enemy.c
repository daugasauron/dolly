/* enemy.c - patrolling walkers that turn at walls and ledges */
#include "game.h"
#include <math.h>

void enemies_update(Level *L)
{
    for (int i = 0; i < L->ne; i++) {
        Enemy *e = &L->e[i];
        if (!e->alive) continue;
        if (e->squash > 0) {
            e->squash -= DT;
            if (e->squash <= 0) e->alive = false;
            continue;
        }
        /* gravity so spawns settle onto the floor */
        e->vy += GRAVITY * DT;
        if (e->vy > MAX_FALL) e->vy = MAX_FALL;
        e->y += e->vy * DT;
        bool grounded = false;
        if (box_hits_solid(L, e->x, e->y, E_W, E_H)) {
            if (e->vy > 0) {
                e->y = floorf((e->y + E_H) / TILE) * TILE - E_H;
                grounded = true;
            }
            e->vy = 0;
        }
        if (e->y > L->h * TILE + 64) { e->alive = false; continue; }

        float nx = e->x + e->vx * DT;
        bool turn = box_hits_solid(L, nx, e->y, E_W, E_H);
        if (grounded && !turn) {
            /* ledge ahead? probe the tile below the leading foot */
            float fx = e->vx > 0 ? nx + E_W : nx;
            int tx = (int)floorf(fx / TILE);
            int ty = (int)floorf((e->y + E_H + 1) / TILE);
            if (!level_solid(L, tx, ty) || level_get(L, tx, ty - 1) == '^') turn = true;
        }
        if (turn) e->vx = -e->vx;
        else e->x = nx;
    }
}
