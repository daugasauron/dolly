/* fingers: a figure that one finger moves and two fingers zoom and move,
   each finger marked with its id. SDL's finger events, nothing of Dolly's. */
#include <SDL.h>
#include <math.h>
#include <poll.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <termios.h>
#include <unistd.h>

enum { MAX_FINGERS = 10, FIGURE = 160, CELLS = 4 };

typedef struct {
  SDL_FingerID id;
  float x, y;
} finger;

static finger fingers[MAX_FINGERS];
static int count;
/* Screen = world * scale + offset; the anchor holds both and the fingers'
   positions when the set of fingers last changed. */
static float scale = 1, offset_x, offset_y;
static struct { float scale, x, y, ax, ay, bx, by; } anchor;

/* The terminal's text area in pixels (CSI 14 t), which is the frame's size:
   the figure is drawn at the screen's own shape. */
static int terminal_pixels(int *width, int *height) {
  struct termios saved, raw;
  if (!isatty(0) || tcgetattr(0, &saved) != 0) return 0;
  raw = saved;
  raw.c_lflag &= ~(ICANON | ECHO);
  tcsetattr(0, TCSANOW, &raw);
  fputs("\033[14t", stdout);
  fflush(stdout);
  char reply[32];
  size_t length = 0;
  struct pollfd input = {0, POLLIN, 0};
  while (length + 1 < sizeof(reply) && poll(&input, 1, 500) == 1 && read(0, reply + length, 1) == 1)
    if (reply[length++] == 't') break;
  reply[length] = 0;
  tcsetattr(0, TCSANOW, &saved);
  return sscanf(reply, "\033[4;%d;%dt", height, width) == 2 && *width > 0 && *height > 0;
}

static void reanchor(void) {
  anchor.scale = scale;
  anchor.x = offset_x;
  anchor.y = offset_y;
  if (count > 0) anchor.ax = fingers[0].x, anchor.ay = fingers[0].y;
  if (count > 1) anchor.bx = fingers[1].x, anchor.by = fingers[1].y;
}

/* One finger drags; the first two zoom about their midpoint, which the
   figure follows. */
static void follow(void) {
  if (count == 1) {
    offset_x = anchor.x + fingers[0].x - anchor.ax;
    offset_y = anchor.y + fingers[0].y - anchor.ay;
  } else if (count > 1) {
    const float before = hypotf(anchor.bx - anchor.ax, anchor.by - anchor.ay);
    const float now = hypotf(fingers[1].x - fingers[0].x, fingers[1].y - fingers[0].y);
    if (before < 1 || now < 1) return;
    scale = fminf(fmaxf(anchor.scale * now / before, 0.1f), 20.0f);
    const float world_x = ((anchor.ax + anchor.bx) / 2 - anchor.x) / anchor.scale;
    const float world_y = ((anchor.ay + anchor.by) / 2 - anchor.y) / anchor.scale;
    offset_x = (fingers[0].x + fingers[1].x) / 2 - world_x * scale;
    offset_y = (fingers[0].y + fingers[1].y) / 2 - world_y * scale;
  }
}

static void touched(const SDL_TouchFingerEvent *event, int width, int height) {
  const float x = event->x * width, y = event->y * height;
  int index = 0;
  while (index < count && fingers[index].id != event->fingerId) ++index;
  if (event->type == SDL_FINGERDOWN && index == count && count < MAX_FINGERS) {
    fingers[count++] = (finger){event->fingerId, x, y};
    reanchor();
  } else if (event->type == SDL_FINGERMOTION && index < count) {
    fingers[index].x = x;
    fingers[index].y = y;
    follow();
  } else if (event->type == SDL_FINGERUP && index < count) {
    memmove(&fingers[index], &fingers[index + 1], (size_t)(count - index - 1) * sizeof(finger));
    --count;
    reanchor();
  }
}

/* Digits of a finger's id, five rows of three. */
static void draw_number(SDL_Renderer *renderer, long long number, int x, int y, int size) {
  static const unsigned short digits[10] = {075557, 022222, 071747, 071717, 055711, 074717, 074757, 071111, 075757, 075717};
  char text[24];
  snprintf(text, sizeof(text), "%lld", number);
  for (const char *c = text; *c; ++c, x += 4 * size) {
    for (int row = 0; row < 5; ++row) for (int column = 0; column < 3; ++column)
      if (digits[*c - '0'] >> ((4 - row) * 3 + (2 - column)) & 1)
        SDL_RenderFillRect(renderer, &(SDL_Rect){x + column * size, y + row * size, size, size});
  }
}

static void draw(SDL_Renderer *renderer) {
  SDL_SetRenderDrawColor(renderer, 18, 18, 26, 255);
  SDL_RenderClear(renderer);
  const float cell = FIGURE * scale / CELLS;
  for (int row = 0; row < CELLS; ++row) for (int column = 0; column < CELLS; ++column) {
    const float x = offset_x + (column - CELLS / 2.0f) * cell, y = offset_y + (row - CELLS / 2.0f) * cell;
    if ((row + column) % 2) SDL_SetRenderDrawColor(renderer, 240, 196, 72, 255);
    else SDL_SetRenderDrawColor(renderer, 214, 92, 52, 255);
    SDL_RenderFillRect(renderer, &(SDL_Rect){(int)floorf(x), (int)floorf(y), (int)ceilf(cell), (int)ceilf(cell)});
  }
  for (int index = 0; index < count; ++index) {
    static const SDL_Color colors[] = {{90, 200, 250, 255}, {120, 230, 120, 255}, {250, 120, 200, 255}, {250, 250, 250, 255}};
    const SDL_Color color = colors[fingers[index].id % 4];
    const int x = (int)fingers[index].x, y = (int)fingers[index].y, radius = 36;
    SDL_SetRenderDrawColor(renderer, color.r, color.g, color.b, 255);
    for (int dy = -radius; dy <= radius; ++dy) {
      const int half = (int)sqrtf((float)(radius * radius - dy * dy));
      SDL_RenderDrawLine(renderer, x - half, y + dy, x + half, y + dy);
    }
    draw_number(renderer, (long long)fingers[index].id, x - 6, y - radius - 50, 8);
  }
  SDL_RenderPresent(renderer);
}

int main(int argc, char **argv) {
  int width = 640, height = 480;
  if (argc == 3) width = atoi(argv[1]), height = atoi(argv[2]);
  else if (!terminal_pixels(&width, &height)) fputs("fingers: the terminal gave no size; 640x480\n", stderr);
  if (SDL_Init(SDL_INIT_VIDEO) != 0) {
    fprintf(stderr, "fingers: %s\n", SDL_GetError());
    return 1;
  }
  SDL_Window *window = SDL_CreateWindow("fingers", 0, 0, width, height, 0);
  SDL_Renderer *renderer = window ? SDL_CreateRenderer(window, -1, SDL_RENDERER_SOFTWARE) : NULL;
  if (!renderer) {
    fprintf(stderr, "fingers: %s\n", SDL_GetError());
    return 1;
  }
  offset_x = width / 2.0f;
  offset_y = height / 2.0f;
  unsigned seen = 0;
  for (int running = 1; running;) {
    draw(renderer);
    SDL_Event event;
    if (!SDL_WaitEventTimeout(&event, 100)) continue;
    do {
      if (event.type == SDL_QUIT || (event.type == SDL_KEYDOWN && event.key.keysym.sym == SDLK_ESCAPE)) running = 0;
      else if (event.type == SDL_FINGERDOWN || event.type == SDL_FINGERMOTION || event.type == SDL_FINGERUP) {
        seen += event.type == SDL_FINGERDOWN;
        touched(&event.tfinger, width, height);
      }
    } while (SDL_PollEvent(&event));
  }
  SDL_Quit();
  printf("fingers: %u fingers; the figure at %.0f %.0f, scale %.2f\n", seen, offset_x, offset_y, scale);
  return 0;
}
