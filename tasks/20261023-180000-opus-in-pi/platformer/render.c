/* render.c - tiles, sprites built from rectangles, and a 5x7 bitmap font */
#include "game.h"
#include <SDL2/SDL.h>
#include <ctype.h>
#include <math.h>
#include <string.h>

static const char font_chars[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:-!.>/,";
static const unsigned char font[][7] = {
    {0x0E,0x11,0x11,0x1F,0x11,0x11,0x11},{0x1E,0x11,0x11,0x1E,0x11,0x11,0x1E},
    {0x0E,0x11,0x10,0x10,0x10,0x11,0x0E},{0x1E,0x11,0x11,0x11,0x11,0x11,0x1E},
    {0x1F,0x10,0x10,0x1E,0x10,0x10,0x1F},{0x1F,0x10,0x10,0x1E,0x10,0x10,0x10},
    {0x0E,0x11,0x10,0x17,0x11,0x11,0x0F},{0x11,0x11,0x11,0x1F,0x11,0x11,0x11},
    {0x0E,0x04,0x04,0x04,0x04,0x04,0x0E},{0x07,0x02,0x02,0x02,0x02,0x12,0x0C},
    {0x11,0x12,0x14,0x18,0x14,0x12,0x11},{0x10,0x10,0x10,0x10,0x10,0x10,0x1F},
    {0x11,0x1B,0x15,0x15,0x11,0x11,0x11},{0x11,0x11,0x19,0x15,0x13,0x11,0x11},
    {0x0E,0x11,0x11,0x11,0x11,0x11,0x0E},{0x1E,0x11,0x11,0x1E,0x10,0x10,0x10},
    {0x0E,0x11,0x11,0x11,0x15,0x12,0x0D},{0x1E,0x11,0x11,0x1E,0x14,0x12,0x11},
    {0x0F,0x10,0x10,0x0E,0x01,0x01,0x1E},{0x1F,0x04,0x04,0x04,0x04,0x04,0x04},
    {0x11,0x11,0x11,0x11,0x11,0x11,0x0E},{0x11,0x11,0x11,0x11,0x11,0x0A,0x04},
    {0x11,0x11,0x11,0x15,0x15,0x15,0x0A},{0x11,0x11,0x0A,0x04,0x0A,0x11,0x11},
    {0x11,0x11,0x0A,0x04,0x04,0x04,0x04},{0x1F,0x01,0x02,0x04,0x08,0x10,0x1F},
    {0x0E,0x11,0x13,0x15,0x19,0x11,0x0E},{0x04,0x0C,0x04,0x04,0x04,0x04,0x0E},
    {0x0E,0x11,0x01,0x02,0x04,0x08,0x1F},{0x1F,0x02,0x04,0x02,0x01,0x11,0x0E},
    {0x02,0x06,0x0A,0x12,0x1F,0x02,0x02},{0x1F,0x10,0x1E,0x01,0x01,0x11,0x0E},
    {0x06,0x08,0x10,0x1E,0x11,0x11,0x0E},{0x1F,0x01,0x02,0x04,0x08,0x08,0x08},
    {0x0E,0x11,0x11,0x0E,0x11,0x11,0x0E},{0x0E,0x11,0x11,0x0F,0x01,0x02,0x0C},
    {0x00,0x0C,0x0C,0x00,0x0C,0x0C,0x00},{0x00,0x00,0x00,0x1F,0x00,0x00,0x00},
    {0x04,0x04,0x04,0x04,0x04,0x00,0x04},{0x00,0x00,0x00,0x00,0x00,0x0C,0x0C},
    {0x08,0x04,0x02,0x01,0x02,0x04,0x08},{0x01,0x01,0x02,0x04,0x08,0x10,0x10},
    {0x00,0x00,0x00,0x00,0x0C,0x04,0x08},
};

static void color(SDL_Renderer *r, unsigned rgb)
{
    SDL_SetRenderDrawColor(r, rgb >> 16, (rgb >> 8) & 255, rgb & 255, 255);
}

static void rect(SDL_Renderer *r, int x, int y, int w, int h, unsigned rgb)
{
    SDL_Rect q = {x, y, w, h};
    color(r, rgb);
    SDL_RenderFillRect(r, &q);
}

int text_width(const char *s, int scale) { return (int)strlen(s) * 6 * scale; }

void draw_text(SDL_Renderer *r, int x, int y, int scale, const char *s, unsigned rgb)
{
    for (; *s; s++, x += 6 * scale) {
        const char *p = strchr(font_chars, toupper((unsigned char)*s));
        if (!p || *s == ' ') continue;
        const unsigned char *g = font[p - font_chars];
        for (int row = 0; row < 7; row++)
            for (int col = 0; col < 5; col++)
                if (g[row] & (0x10 >> col)) {
                    rect(r, x + col * scale + scale / 2 + 1, y + row * scale + 1,
                         scale, scale, 0x000000);       /* shadow */
                    rect(r, x + col * scale, y + row * scale, scale, scale, rgb);
                }
    }
}

static void draw_tile(SDL_Renderer *r, const Level *L, int tx, int ty, int sx, int sy, int frame)
{
    char c = L->t[ty][tx];
    switch (c) {
    case '#': {
        bool top = !level_solid(L, tx, ty - 1);
        rect(r, sx, sy, TILE, TILE, 0x8b5a2b);
        rect(r, sx + 3, sy + 7, 2, 2, 0x6e4420);
        rect(r, sx + 10, sy + 11, 2, 2, 0x6e4420);
        if (top) { rect(r, sx, sy, TILE, 4, 0x3cb043); rect(r, sx, sy + 4, TILE, 1, 0x2a7d2f); }
        break;
    }
    case 'B':
        rect(r, sx, sy, TILE, TILE, 0xb5532a);
        rect(r, sx, sy + 7, TILE, 1, 0x5a2a10);
        rect(r, sx, sy + 15, TILE, 1, 0x5a2a10);
        rect(r, sx + 7, sy, 1, 7, 0x5a2a10);
        rect(r, sx + 3, sy + 8, 1, 7, 0x5a2a10);
        rect(r, sx + 12, sy + 8, 1, 7, 0x5a2a10);
        break;
    case 'o': {
        int w = 2 + (int)(5 * fabsf(sinf(frame * 0.08f + tx)));
        rect(r, sx + 8 - w, sy + 3, w * 2, 10, 0xffd700);
        rect(r, sx + 8 - w / 2, sy + 5, w > 2 ? w / 2 : 1, 6, 0xfff6a0);
        break;
    }
    case '^':
        /* four triangular spikes, each 4 px wide and 8 px tall */
        for (int i = 0; i < 4; i++)
            for (int k = 0; k < 8; k++) {
                int w = k < 2 ? 1 : k < 5 ? 2 : 4;
                rect(r, sx + i * 4 + (4 - w) / 2, sy + 8 + k, w, 1, k < 2 ? 0xffffff : 0xb0b0c0);
            }
        break;
    case 'F':
        rect(r, sx + 7, sy, 2, TILE, 0xeeeeee);
        if (level_get(L, tx, ty - 1) != 'F') {
            int wave = (frame / 8) % 2;
            rect(r, sx + 9, sy + 1 + wave, 7, 6, 0xff3030);
            rect(r, sx + 6, sy - 2, 4, 3, 0xffd700);
        }
        break;
    default:
        break;
    }
}

void draw_world(SDL_Renderer *r, const Level *L, const Player *p, float camx, float camy, int frame)
{
    int cx = (int)floorf(camx), cy = (int)floorf(camy);
    /* sky gradient */
    for (int i = 0; i < 8; i++)
        rect(r, 0, i * VIEW_H / 8, VIEW_W, VIEW_H / 8 + 1,
             ((0x50 + i * 8) << 16) | ((0x90 + i * 8) << 8) | 0xf0);
    /* parallax hills and clouds */
    for (int i = -1; i < 8; i++) {
        int hx = i * 120 - (cx / 4) % 120;
        for (int k = 0; k < 40; k += 4) rect(r, hx + k, VIEW_H - 90 + k, 120 - 2 * k, 4, 0x78c878);
        rect(r, hx, VIEW_H - 50, 120, 50, 0x78c878);
        int cl = i * 160 - (cx / 8) % 160;
        rect(r, cl + 20, 30 + (i & 1) * 20, 40, 10, 0xffffff);
        rect(r, cl + 28, 24 + (i & 1) * 20, 22, 8, 0xffffff);
    }
    int tx0 = cx / TILE, ty0 = cy / TILE;
    for (int ty = ty0 < 0 ? 0 : ty0; ty <= ty0 + VIEW_H / TILE + 1 && ty < L->h; ty++)
        for (int tx = tx0 < 0 ? 0 : tx0; tx <= tx0 + VIEW_W / TILE + 1 && tx < L->w; tx++)
            draw_tile(r, L, tx, ty, tx * TILE - cx, ty * TILE - cy, frame);

    /* enemies */
    for (int i = 0; i < L->ne; i++) {
        const Enemy *e = &L->e[i];
        if (!e->alive) continue;
        int ex = (int)e->x - cx, ey = (int)e->y - cy;
        if (e->squash > 0) { rect(r, ex, ey + E_H - 4, E_W, 4, 0x7a3fa0); continue; }
        int step = (frame / 10) % 2;
        rect(r, ex + 1, ey, E_W - 2, E_H - 3, 0x9b4fd0);
        rect(r, ex, ey + 3, E_W, E_H - 6, 0x9b4fd0);
        int look = e->vx > 0 ? 2 : 0;
        rect(r, ex + 2 + look, ey + 3, 4, 4, 0xffffff);
        rect(r, ex + 8 + look, ey + 3, 4, 4, 0xffffff);
        rect(r, ex + 3 + look + (e->vx > 0), ey + 4, 2, 2, 0x000000);
        rect(r, ex + 9 + look + (e->vx > 0), ey + 4, 2, 2, 0x000000);
        rect(r, ex + (step ? 0 : 2), ey + E_H - 3, 5, 3, 0x3a1f50);
        rect(r, ex + E_W - 5 - (step ? 0 : 2), ey + E_H - 3, 5, 3, 0x3a1f50);
    }

    /* player */
    int px = (int)p->x - cx, py = (int)p->y - cy;
    unsigned body = p->dead ? 0x909090 : 0xe03030;
    rect(r, px + 1, py, P_W - 2, 4, body);                /* cap */
    rect(r, px + (p->facing > 0 ? 6 : -2), py + 2, 8, 2, body);
    rect(r, px + 2, py + 4, P_W - 4, 4, 0xf5c79e);        /* face */
    rect(r, px + (p->facing > 0 ? 7 : 3), py + 5, 2, 2, 0x000000);
    rect(r, px + 1, py + 8, P_W - 2, 4, 0x2050d0);        /* overalls */
    int leg = (int)p->anim % 2;
    if (!p->on_ground && !p->dead) leg = 2;
    rect(r, px + 1 + (leg == 1), py + 12, 4, 2, 0x5a3010);
    rect(r, px + P_W - 5 - (leg == 0 ? 0 : 1) + (leg == 2), py + 12, 4, 2, 0x5a3010);
}
