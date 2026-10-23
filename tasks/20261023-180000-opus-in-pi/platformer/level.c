/* level.c - loading text levels, tile queries, collision helpers */
#include "game.h"
#include <stdio.h>
#include <string.h>

/* Tiles: '#' ground, 'B' brick, 'o' coin, '^' spikes, 'E' enemy spawn,
   'P' player spawn, 'F' goal flag, ' ' or '.' empty. Lines starting with
   ';' are comments; a line "name: TEXT" sets the level name. */
int level_load(Level *L, const char *path)
{
    FILE *f = fopen(path, "r");
    if (!f) return -1;
    memset(L, 0, sizeof *L);
    for (int y = 0; y < MAXH; y++) memset(L->t[y], ' ', MAXW);
    char line[1024];
    bool have_spawn = false, have_goal = false;
    while (fgets(line, sizeof line, f)) {
        size_t n = strcspn(line, "\r\n");
        line[n] = 0;
        if (line[0] == ';') continue;
        if (!strncmp(line, "name:", 5)) {
            const char *s = line + 5;
            while (*s == ' ') s++;
            snprintf(L->name, sizeof L->name, "%s", s);
            continue;
        }
        if (L->h >= MAXH) break;
        int y = L->h++;
        if ((int)n > MAXW) n = MAXW;
        if ((int)n > L->w) L->w = (int)n;
        for (int x = 0; x < (int)n; x++) {
            char c = line[x];
            if (c == '.') c = ' ';
            if (c == 'P') {
                L->sx = x * TILE + (TILE - P_W) / 2.0f;
                L->sy = y * TILE + (TILE - P_H);
                have_spawn = true;
                c = ' ';
            } else if (c == 'E') {
                if (L->ne < MAXE) {
                    Enemy *e = &L->e[L->ne++];
                    e->x = x * TILE + 1;
                    e->y = y * TILE + (TILE - E_H);
                    e->vx = -E_SPEED;
                    e->alive = true;
                }
                c = ' ';
            } else if (c == 'o') {
                L->coins_left++;
            } else if (c == 'F') {
                have_goal = true;
            }
            L->t[y][x] = c;
        }
    }
    fclose(f);
    for (int y = 0; y < L->h; y++) L->t[y][L->w] = 0;
    if (!have_spawn || !have_goal || L->w == 0) return -2;
    return 0;
}

char level_get(const Level *L, int tx, int ty)
{
    if (tx < 0 || tx >= L->w || ty < 0 || ty >= L->h) return ' ';
    return L->t[ty][tx];
}

void level_set(Level *L, int tx, int ty, char c)
{
    if (tx < 0 || tx >= L->w || ty < 0 || ty >= L->h) return;
    L->t[ty][tx] = c;
}

/* Left and right edges are walls; above and below are open. */
bool level_solid(const Level *L, int tx, int ty)
{
    if (tx < 0 || tx >= L->w) return true;
    if (ty < 0 || ty >= L->h) return false;
    char c = L->t[ty][tx];
    return c == '#' || c == 'B';
}

static int fl(float v) { return v < 0 ? (int)v - 1 : (int)v; }

bool box_hits_solid(const Level *L, float x, float y, float w, float h)
{
    int x0 = fl(x / TILE), x1 = fl((x + w - 0.01f) / TILE);
    int y0 = fl(y / TILE), y1 = fl((y + h - 0.01f) / TILE);
    for (int ty = y0; ty <= y1; ty++)
        for (int tx = x0; tx <= x1; tx++)
            if (level_solid(L, tx, ty)) return true;
    return false;
}

bool box_hits_char(const Level *L, float x, float y, float w, float h, char c)
{
    int x0 = fl(x / TILE), x1 = fl((x + w - 0.01f) / TILE);
    int y0 = fl(y / TILE), y1 = fl((y + h - 0.01f) / TILE);
    for (int ty = y0; ty <= y1; ty++)
        for (int tx = x0; tx <= x1; tx++)
            if (level_get(L, tx, ty) == c) return true;
    return false;
}

/* Coarse reachability check used by --check: from each standable cell the
   player can reach standable cells up to 4 tiles across and 3 tiles up, or
   any distance down. Returns 1 if a cell touching the flag is reachable. */
static bool standable(const Level *L, int x, int y)
{
    char c = level_get(L, x, y);
    return !level_solid(L, x, y) && c != '^' && level_solid(L, x, y + 1) &&
           x >= 0 && x < L->w;
}

int level_reachable(const Level *L)
{
    static unsigned char seen[MAXH][MAXW];
    static short qx[MAXH * MAXW], qy[MAXH * MAXW];
    memset(seen, 0, sizeof seen);
    int qh = 0, qt = 0;
    int sx = (int)((L->sx + P_W / 2) / TILE), sy = (int)((L->sy + P_H / 2) / TILE);
    while (sy < L->h && !standable(L, sx, sy)) sy++;
    if (sy >= L->h) return 0;
    seen[sy][sx] = 1; qx[qt] = sx; qy[qt++] = sy;
    while (qh < qt) {
        int x = qx[qh], y = qy[qh++];
        for (int dy = -1; dy <= 1; dy++)
            for (int dx = -1; dx <= 1; dx++)
                if (level_get(L, x + dx, y + dy) == 'F') return 1;
        for (int ny = (y - 3 < 0 ? 0 : y - 3); ny < L->h; ny++)
            for (int nx = x - 4; nx <= x + 4; nx++) {
                if (nx < 0 || nx >= L->w || seen[ny][nx]) continue;
                if (!standable(L, nx, ny)) continue;
                seen[ny][nx] = 1; qx[qt] = nx; qy[qt++] = ny;
            }
    }
    return 0;
}
