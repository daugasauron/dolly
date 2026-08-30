#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define GHOSTTY_STATIC 1
#include <ghostty/vt.h>

#define STB_TRUETYPE_IMPLEMENTATION
#define STBTT_STATIC
#include <stb_truetype.h>

#include <dolly/display.h>

enum {
  DRIVER_ABI_VERSION = 3,
  MIN_FONT_MILLI = 8000,
  MAX_FONT_MILLI = 32000,
  DEFAULT_FONT_MILLI = 15000,
  DEFAULT_SCALE_MILLI = 1000,
  PTY_RESPONSE_CAPACITY = 512 * 1024,
  MAX_GRAPHEME_CODEPOINTS = 16,
};

typedef struct {
  const char *code;
  GhosttyKey key;
} key_mapping;

static const key_mapping key_mappings[] = {
    {"Backquote", GHOSTTY_KEY_BACKQUOTE},
    {"Backslash", GHOSTTY_KEY_BACKSLASH},
    {"BracketLeft", GHOSTTY_KEY_BRACKET_LEFT},
    {"BracketRight", GHOSTTY_KEY_BRACKET_RIGHT},
    {"Comma", GHOSTTY_KEY_COMMA},
    {"Digit0", GHOSTTY_KEY_DIGIT_0},
    {"Digit1", GHOSTTY_KEY_DIGIT_1},
    {"Digit2", GHOSTTY_KEY_DIGIT_2},
    {"Digit3", GHOSTTY_KEY_DIGIT_3},
    {"Digit4", GHOSTTY_KEY_DIGIT_4},
    {"Digit5", GHOSTTY_KEY_DIGIT_5},
    {"Digit6", GHOSTTY_KEY_DIGIT_6},
    {"Digit7", GHOSTTY_KEY_DIGIT_7},
    {"Digit8", GHOSTTY_KEY_DIGIT_8},
    {"Digit9", GHOSTTY_KEY_DIGIT_9},
    {"Equal", GHOSTTY_KEY_EQUAL},
    {"IntlBackslash", GHOSTTY_KEY_INTL_BACKSLASH},
    {"IntlRo", GHOSTTY_KEY_INTL_RO},
    {"IntlYen", GHOSTTY_KEY_INTL_YEN},
    {"KeyA", GHOSTTY_KEY_A}, {"KeyB", GHOSTTY_KEY_B},
    {"KeyC", GHOSTTY_KEY_C}, {"KeyD", GHOSTTY_KEY_D},
    {"KeyE", GHOSTTY_KEY_E}, {"KeyF", GHOSTTY_KEY_F},
    {"KeyG", GHOSTTY_KEY_G}, {"KeyH", GHOSTTY_KEY_H},
    {"KeyI", GHOSTTY_KEY_I}, {"KeyJ", GHOSTTY_KEY_J},
    {"KeyK", GHOSTTY_KEY_K}, {"KeyL", GHOSTTY_KEY_L},
    {"KeyM", GHOSTTY_KEY_M}, {"KeyN", GHOSTTY_KEY_N},
    {"KeyO", GHOSTTY_KEY_O}, {"KeyP", GHOSTTY_KEY_P},
    {"KeyQ", GHOSTTY_KEY_Q}, {"KeyR", GHOSTTY_KEY_R},
    {"KeyS", GHOSTTY_KEY_S}, {"KeyT", GHOSTTY_KEY_T},
    {"KeyU", GHOSTTY_KEY_U}, {"KeyV", GHOSTTY_KEY_V},
    {"KeyW", GHOSTTY_KEY_W}, {"KeyX", GHOSTTY_KEY_X},
    {"KeyY", GHOSTTY_KEY_Y}, {"KeyZ", GHOSTTY_KEY_Z},
    {"Minus", GHOSTTY_KEY_MINUS},
    {"Period", GHOSTTY_KEY_PERIOD},
    {"Quote", GHOSTTY_KEY_QUOTE},
    {"Semicolon", GHOSTTY_KEY_SEMICOLON},
    {"Slash", GHOSTTY_KEY_SLASH},
    {"AltLeft", GHOSTTY_KEY_ALT_LEFT},
    {"AltRight", GHOSTTY_KEY_ALT_RIGHT},
    {"Backspace", GHOSTTY_KEY_BACKSPACE},
    {"CapsLock", GHOSTTY_KEY_CAPS_LOCK},
    {"ContextMenu", GHOSTTY_KEY_CONTEXT_MENU},
    {"ControlLeft", GHOSTTY_KEY_CONTROL_LEFT},
    {"ControlRight", GHOSTTY_KEY_CONTROL_RIGHT},
    {"Enter", GHOSTTY_KEY_ENTER},
    {"MetaLeft", GHOSTTY_KEY_META_LEFT},
    {"MetaRight", GHOSTTY_KEY_META_RIGHT},
    {"ShiftLeft", GHOSTTY_KEY_SHIFT_LEFT},
    {"ShiftRight", GHOSTTY_KEY_SHIFT_RIGHT},
    {"Space", GHOSTTY_KEY_SPACE},
    {"Tab", GHOSTTY_KEY_TAB},
    {"Delete", GHOSTTY_KEY_DELETE},
    {"End", GHOSTTY_KEY_END},
    {"Home", GHOSTTY_KEY_HOME},
    {"Insert", GHOSTTY_KEY_INSERT},
    {"PageDown", GHOSTTY_KEY_PAGE_DOWN},
    {"PageUp", GHOSTTY_KEY_PAGE_UP},
    {"ArrowDown", GHOSTTY_KEY_ARROW_DOWN},
    {"ArrowLeft", GHOSTTY_KEY_ARROW_LEFT},
    {"ArrowRight", GHOSTTY_KEY_ARROW_RIGHT},
    {"ArrowUp", GHOSTTY_KEY_ARROW_UP},
    {"NumLock", GHOSTTY_KEY_NUM_LOCK},
    {"Numpad0", GHOSTTY_KEY_NUMPAD_0},
    {"Numpad1", GHOSTTY_KEY_NUMPAD_1},
    {"Numpad2", GHOSTTY_KEY_NUMPAD_2},
    {"Numpad3", GHOSTTY_KEY_NUMPAD_3},
    {"Numpad4", GHOSTTY_KEY_NUMPAD_4},
    {"Numpad5", GHOSTTY_KEY_NUMPAD_5},
    {"Numpad6", GHOSTTY_KEY_NUMPAD_6},
    {"Numpad7", GHOSTTY_KEY_NUMPAD_7},
    {"Numpad8", GHOSTTY_KEY_NUMPAD_8},
    {"Numpad9", GHOSTTY_KEY_NUMPAD_9},
    {"NumpadAdd", GHOSTTY_KEY_NUMPAD_ADD},
    {"NumpadDecimal", GHOSTTY_KEY_NUMPAD_DECIMAL},
    {"NumpadDivide", GHOSTTY_KEY_NUMPAD_DIVIDE},
    {"NumpadEnter", GHOSTTY_KEY_NUMPAD_ENTER},
    {"NumpadEqual", GHOSTTY_KEY_NUMPAD_EQUAL},
    {"NumpadMultiply", GHOSTTY_KEY_NUMPAD_MULTIPLY},
    {"NumpadSubtract", GHOSTTY_KEY_NUMPAD_SUBTRACT},
    {"Escape", GHOSTTY_KEY_ESCAPE},
    {"F1", GHOSTTY_KEY_F1}, {"F2", GHOSTTY_KEY_F2},
    {"F3", GHOSTTY_KEY_F3}, {"F4", GHOSTTY_KEY_F4},
    {"F5", GHOSTTY_KEY_F5}, {"F6", GHOSTTY_KEY_F6},
    {"F7", GHOSTTY_KEY_F7}, {"F8", GHOSTTY_KEY_F8},
    {"F9", GHOSTTY_KEY_F9}, {"F10", GHOSTTY_KEY_F10},
    {"F11", GHOSTTY_KEY_F11}, {"F12", GHOSTTY_KEY_F12},
    {"PrintScreen", GHOSTTY_KEY_PRINT_SCREEN},
    {"ScrollLock", GHOSTTY_KEY_SCROLL_LOCK},
    {"Pause", GHOSTTY_KEY_PAUSE},
};

static GhosttyTerminal terminal;
static GhosttyKeyEncoder key_encoder;
static GhosttyKeyEvent key_event;
static dolly_display_mailbox *mailbox;
static unsigned char *frames[DOLLY_DISPLAY_FRAME_COUNT];
static size_t frame_capacity;
static unsigned char *paste_buffer;
static unsigned char *copy_buffer;
static size_t clipboard_capacity;
static unsigned char *font_bytes;
static size_t font_bytes_length;
static stbtt_fontinfo font;
static unsigned char *glyph_bitmap;
static size_t glyph_bitmap_capacity;
static uint32_t viewport_width_css = 1000;
static uint32_t viewport_height_css = 650;
static uint32_t device_scale_milli = DEFAULT_SCALE_MILLI;
static uint32_t font_size_milli = DEFAULT_FONT_MILLI;
static uint32_t framebuffer_width;
static uint32_t framebuffer_height;
static uint32_t framebuffer_stride;
static uint32_t cell_width;
static uint32_t cell_height;
static uint32_t padding_x;
static uint32_t padding_y;
static float font_scale;
static int font_ascent;
static unsigned char pty_response[PTY_RESPONSE_CAPACITY];
static size_t pty_response_read;
static size_t pty_response_write;
static int previous_output_was_cr;
static GhosttySelectionGesture selection_gesture;
static GhosttySelectionGestureEvent selection_press;
static GhosttySelectionGestureEvent selection_drag;
static GhosttySelectionGestureEvent selection_release;
static int32_t scroll_remainder_milli;
static bool suspended;

static const GhosttyColorRgb background = {0x26, 0x26, 0x26};
static const GhosttyColorRgb foreground = {0xe8, 0xe3, 0xd7};
static const GhosttyColorRgb accent = {0xf2, 0xd4, 0x5c};
static const GhosttyColorRgb dim = {0x77, 0x73, 0x6c};
static GhosttyColorRgb terminal_palette[256];

static uint32_t clamp_u32(uint32_t value, uint32_t low, uint32_t high) {
  if (value < low) return low;
  if (value > high) return high;
  return value;
}

static int load_font(const char *path) {
  FILE *file = fopen(path, "rb");
  if (file == NULL) return -1;
  if (fseek(file, 0, SEEK_END) != 0) {
    fclose(file);
    return -1;
  }
  long length = ftell(file);
  if (length <= 0 || fseek(file, 0, SEEK_SET) != 0) {
    fclose(file);
    return -1;
  }
  font_bytes = malloc((size_t)length);
  if (font_bytes == NULL ||
      fread(font_bytes, 1, (size_t)length, file) != (size_t)length) {
    free(font_bytes);
    font_bytes = NULL;
    fclose(file);
    return -1;
  }
  fclose(file);
  font_bytes_length = (size_t)length;
  const int offset = stbtt_GetFontOffsetForIndex(font_bytes, 0);
  return offset >= 0 && stbtt_InitFont(&font, font_bytes, offset) ? 0 : -1;
}

static void configure_theme(void) {
  ghostty_color_palette_default(terminal_palette);
  for (size_t index = 0; index < 16; ++index) {
    terminal_palette[index] = foreground;
  }
  terminal_palette[0] = background;
  terminal_palette[3] = accent;
  terminal_palette[8] = dim;
  terminal_palette[11] = accent;
  ghostty_terminal_set(terminal, GHOSTTY_TERMINAL_OPT_COLOR_FOREGROUND,
                       &foreground);
  ghostty_terminal_set(terminal, GHOSTTY_TERMINAL_OPT_COLOR_BACKGROUND,
                       &background);
  ghostty_terminal_set(terminal, GHOSTTY_TERMINAL_OPT_COLOR_CURSOR, &accent);
  ghostty_terminal_set(terminal, GHOSTTY_TERMINAL_OPT_COLOR_PALETTE,
                       terminal_palette);
  size_t scrollback_bytes = 16u * 1024u * 1024u;
  ghostty_terminal_set(terminal, GHOSTTY_TERMINAL_OPT_SCROLLBACK_MAX_BYTES,
                       &scrollback_bytes);
}

static void terminal_write_pty(GhosttyTerminal ignored,
                               void *userdata,
                               const uint8_t *bytes,
                               size_t length) {
  (void)ignored;
  (void)userdata;
  for (size_t index = 0; index < length; ++index) {
    if (pty_response_write - pty_response_read >= PTY_RESPONSE_CAPACITY) break;
    pty_response[pty_response_write++ & (PTY_RESPONSE_CAPACITY - 1)] = bytes[index];
  }
}

static GhosttyColorRgb theme_color(const GhosttyStyleColor *value,
                                   bool is_background) {
  if (value->tag == GHOSTTY_STYLE_COLOR_RGB) return value->value.rgb;
  if (value->tag == GHOSTTY_STYLE_COLOR_PALETTE) {
    return terminal_palette[value->value.palette];
  }
  return is_background ? background : foreground;
}

static void publish_selection(void) {
  uint32_t flags = 0;
  uint32_t length = 0;
  if (terminal != NULL && copy_buffer != NULL && clipboard_capacity != 0) {
    GhosttyTerminalSelectionFormatOptions options =
        GHOSTTY_INIT_SIZED(GhosttyTerminalSelectionFormatOptions);
    options.emit = GHOSTTY_FORMATTER_FORMAT_PLAIN;
    options.unwrap = true;
    options.trim = true;
    options.selection = NULL;
    size_t required = 0;
    GhosttyResult result = ghostty_terminal_selection_format_buf(
        terminal, options, NULL, 0, &required);
    if (result == GHOSTTY_SUCCESS || result == GHOSTTY_OUT_OF_SPACE) {
      flags = DOLLY_DISPLAY_COPY_AVAILABLE;
      if (required > clipboard_capacity) {
        flags |= DOLLY_DISPLAY_COPY_TRUNCATED;
      } else if (required != 0) {
        size_t written = 0;
        if (ghostty_terminal_selection_format_buf(
                terminal, options, copy_buffer, clipboard_capacity,
                &written) == GHOSTTY_SUCCESS) {
          length = (uint32_t)written;
        } else {
          flags = 0;
        }
      }
    }
  }
  __c11_atomic_store(&mailbox->copy_length, length, __ATOMIC_RELAXED);
  __c11_atomic_store(&mailbox->copy_flags, flags, __ATOMIC_RELAXED);
  __c11_atomic_fetch_add(&mailbox->copy_sequence, 1, __ATOMIC_RELEASE);
}

static void fill_rect(unsigned char *frame, int x, int y, int width, int height,
                      GhosttyColorRgb color) {
  if (x < 0) { width += x; x = 0; }
  if (y < 0) { height += y; y = 0; }
  if (x + width > (int)framebuffer_width) width = (int)framebuffer_width - x;
  if (y + height > (int)framebuffer_height) height = (int)framebuffer_height - y;
  if (width <= 0 || height <= 0) return;
  for (int row = 0; row < height; ++row) {
    unsigned char *pixel = frame + (size_t)(y + row) * framebuffer_stride +
                           (size_t)x * 4;
    for (int column = 0; column < width; ++column) {
      pixel[0] = color.r;
      pixel[1] = color.g;
      pixel[2] = color.b;
      pixel[3] = 255;
      pixel += 4;
    }
  }
}

static int ensure_glyph_bitmap(size_t size) {
  if (size <= glyph_bitmap_capacity) return 0;
  unsigned char *grown = realloc(glyph_bitmap, size);
  if (grown == NULL) return -1;
  glyph_bitmap = grown;
  glyph_bitmap_capacity = size;
  return 0;
}

static void draw_codepoint(unsigned char *frame, uint32_t codepoint,
                           int cell_x, int cell_y, GhosttyColorRgb color) {
  int x0, y0, x1, y1;
  stbtt_GetCodepointBitmapBox(&font, (int)codepoint, font_scale, font_scale,
                             &x0, &y0, &x1, &y1);
  const int width = x1 - x0;
  const int height = y1 - y0;
  if (width <= 0 || height <= 0 ||
      ensure_glyph_bitmap((size_t)width * (size_t)height) != 0) return;
  stbtt_MakeCodepointBitmap(&font, glyph_bitmap, width, height, width,
                           font_scale, font_scale, (int)codepoint);
  int advance = 0;
  int left_bearing = 0;
  stbtt_GetCodepointHMetrics(&font, (int)codepoint, &advance, &left_bearing);
  (void)left_bearing;
  const int drawn_advance = (int)(advance * font_scale + 0.5f);
  const int origin_x = cell_x + ((int)cell_width - drawn_advance) / 2 + x0;
  const int baseline = cell_y + ((int)cell_height +
      (int)(font_ascent * font_scale + 0.5f)) / 2;
  const int origin_y = baseline + y0;
  for (int row = 0; row < height; ++row) {
    const int destination_y = origin_y + row;
    if (destination_y < 0 || destination_y >= (int)framebuffer_height) continue;
    for (int column = 0; column < width; ++column) {
      const int destination_x = origin_x + column;
      if (destination_x < 0 || destination_x >= (int)framebuffer_width) continue;
      const unsigned alpha = glyph_bitmap[(size_t)row * width + column];
      if (alpha == 0) continue;
      unsigned char *pixel = frame + (size_t)destination_y * framebuffer_stride +
                             (size_t)destination_x * 4;
      pixel[0] = (unsigned char)((pixel[0] * (255 - alpha) + color.r * alpha) / 255);
      pixel[1] = (unsigned char)((pixel[1] * (255 - alpha) + color.g * alpha) / 255);
      pixel[2] = (unsigned char)((pixel[2] * (255 - alpha) + color.b * alpha) / 255);
      pixel[3] = 255;
    }
  }
}

static int set_layout(uint32_t width_css, uint32_t height_css,
                      uint32_t scale_milli, uint32_t requested_font_milli) {
  viewport_width_css = clamp_u32(width_css, 160, 8192);
  viewport_height_css = clamp_u32(height_css, 100, 8192);
  device_scale_milli = clamp_u32(scale_milli, 500, 4000);
  font_size_milli = clamp_u32(requested_font_milli,
                             MIN_FONT_MILLI, MAX_FONT_MILLI);

  uint64_t width = ((uint64_t)viewport_width_css * device_scale_milli + 500) / 1000;
  uint64_t height = ((uint64_t)viewport_height_css * device_scale_milli + 500) / 1000;
  if (width > DOLLY_DISPLAY_MAX_WIDTH) width = DOLLY_DISPLAY_MAX_WIDTH;
  if (height > DOLLY_DISPLAY_MAX_HEIGHT) height = DOLLY_DISPLAY_MAX_HEIGHT;
  framebuffer_width = (uint32_t)width;
  framebuffer_height = (uint32_t)height;
  framebuffer_stride = framebuffer_width * 4;
  if ((uint64_t)framebuffer_stride * framebuffer_height > frame_capacity) return -1;
  // Geometry belongs to the shared display surface, even while terminal frame
  // publication is suspended by a graphics lease. The sequence is advanced
  // only after a renderer has filled and presented a complete buffer.
  __c11_atomic_store(&mailbox->frame_width, framebuffer_width,
                     __ATOMIC_RELAXED);
  __c11_atomic_store(&mailbox->frame_height, framebuffer_height,
                     __ATOMIC_RELAXED);
  __c11_atomic_store(&mailbox->frame_stride, framebuffer_stride,
                     __ATOMIC_RELAXED);

  const float font_pixels = ((float)font_size_milli * device_scale_milli) /
                            1000000.0f;
  font_scale = stbtt_ScaleForPixelHeight(&font, font_pixels);
  int descent = 0;
  int line_gap = 0;
  stbtt_GetFontVMetrics(&font, &font_ascent, &descent, &line_gap);
  int advance = 0;
  int bearing = 0;
  stbtt_GetCodepointHMetrics(&font, 'M', &advance, &bearing);
  (void)bearing;
  cell_width = (uint32_t)(advance * font_scale + 0.5f);
  if (cell_width < 4) cell_width = 4;
  cell_height = (uint32_t)(font_pixels * 1.32f + 0.5f);
  if (cell_height < 8) cell_height = 8;
  padding_x = (12u * device_scale_milli + 500) / 1000;
  padding_y = (10u * device_scale_milli + 500) / 1000;
  uint32_t usable_width = framebuffer_width > 2 * padding_x
      ? framebuffer_width - 2 * padding_x : cell_width;
  uint32_t usable_height = framebuffer_height > 2 * padding_y
      ? framebuffer_height - 2 * padding_y : cell_height;
  uint32_t cols = clamp_u32(usable_width / cell_width, 1, UINT16_MAX);
  uint32_t rows = clamp_u32(usable_height / cell_height, 1, UINT16_MAX);
  if (ghostty_terminal_resize(terminal, (uint16_t)cols, (uint16_t)rows,
                              cell_width, cell_height) != GHOSTTY_SUCCESS) return -1;
  __c11_atomic_store(&mailbox->font_size_milli, font_size_milli,
                     __ATOMIC_RELAXED);
  __c11_atomic_store(&mailbox->cell_width, cell_width, __ATOMIC_RELAXED);
  __c11_atomic_store(&mailbox->cell_height, cell_height, __ATOMIC_RELAXED);
  __c11_atomic_store(&mailbox->padding_x, padding_x, __ATOMIC_RELAXED);
  __c11_atomic_store(&mailbox->padding_y, padding_y, __ATOMIC_RELAXED);
  return 0;
}

static void render_frame(void) {
  if (suspended || terminal == NULL || frames[0] == NULL ||
      frames[1] == NULL) return;
  uint16_t cols = 0;
  uint16_t rows = 0;
  uint16_t cursor_x = 0;
  uint16_t cursor_y = 0;
  bool cursor_visible = false;
  GhosttyTerminalScrollbar scrollbar = {0};
  if (ghostty_terminal_get(terminal, GHOSTTY_TERMINAL_DATA_COLS, &cols) != GHOSTTY_SUCCESS ||
      ghostty_terminal_get(terminal, GHOSTTY_TERMINAL_DATA_ROWS, &rows) != GHOSTTY_SUCCESS ||
      ghostty_terminal_get(terminal, GHOSTTY_TERMINAL_DATA_CURSOR_X, &cursor_x) != GHOSTTY_SUCCESS ||
      ghostty_terminal_get(terminal, GHOSTTY_TERMINAL_DATA_CURSOR_Y, &cursor_y) != GHOSTTY_SUCCESS ||
      ghostty_terminal_get(terminal, GHOSTTY_TERMINAL_DATA_CURSOR_VISIBLE,
                           &cursor_visible) != GHOSTTY_SUCCESS ||
      ghostty_terminal_get(terminal, GHOSTTY_TERMINAL_DATA_SCROLLBAR,
                           &scrollbar) != GHOSTTY_SUCCESS) return;
  const bool viewport_at_bottom = scrollbar.offset >= scrollbar.total ||
      scrollbar.len >= scrollbar.total - scrollbar.offset;
  cursor_visible = cursor_visible && viewport_at_bottom;

  GhosttySelection selection = GHOSTTY_INIT_SIZED(GhosttySelection);
  const bool has_selection = ghostty_terminal_get(
      terminal, GHOSTTY_TERMINAL_DATA_SELECTION, &selection) == GHOSTTY_SUCCESS;
  publish_selection();

  const uint32_t active = __c11_atomic_load(&mailbox->frame_index,
                                             __ATOMIC_ACQUIRE) & 1u;
  const uint32_t next = active ^ 1u;
  unsigned char *frame = frames[next];
  fill_rect(frame, 0, 0, (int)framebuffer_width, (int)framebuffer_height,
            background);

  for (uint16_t row = 0; row < rows; ++row) {
    for (uint16_t column = 0; column < cols; ++column) {
      GhosttyGridRef ref = GHOSTTY_INIT_SIZED(GhosttyGridRef);
      const GhosttyPoint point = {
          .tag = GHOSTTY_POINT_TAG_VIEWPORT,
          .value = {.coordinate = {.x = column, .y = row}},
      };
      if (ghostty_terminal_grid_ref(terminal, point, &ref) != GHOSTTY_SUCCESS) continue;
      GhosttyCell cell = 0;
      GhosttyStyle style = GHOSTTY_INIT_SIZED(GhosttyStyle);
      bool has_text = false;
      GhosttyCellWide wide = GHOSTTY_CELL_WIDE_NARROW;
      if (ghostty_grid_ref_cell(&ref, &cell) != GHOSTTY_SUCCESS ||
          ghostty_grid_ref_style(&ref, &style) != GHOSTTY_SUCCESS ||
          ghostty_cell_get(cell, GHOSTTY_CELL_DATA_HAS_TEXT, &has_text) != GHOSTTY_SUCCESS ||
          ghostty_cell_get(cell, GHOSTTY_CELL_DATA_WIDE, &wide) != GHOSTTY_SUCCESS) continue;

      GhosttyColorRgb fg = theme_color(&style.fg_color, false);
      GhosttyColorRgb bg = theme_color(&style.bg_color, true);
      if (style.inverse) {
        GhosttyColorRgb temporary = fg;
        fg = bg;
        bg = temporary;
      }
      const int x = (int)padding_x + (int)column * (int)cell_width;
      const int y = (int)padding_y + (int)row * (int)cell_height;
      if (style.bg_color.tag != GHOSTTY_STYLE_COLOR_NONE || style.inverse) {
        fill_rect(frame, x, y, (int)cell_width, (int)cell_height, bg);
      }
      bool selected = false;
      if (has_selection) {
        (void)ghostty_terminal_selection_contains(
            terminal, &selection, point, &selected);
      }
      const bool cursor_here = cursor_visible && cursor_x == column &&
                               cursor_y == row;
      if (selected || cursor_here) {
        bg = accent;
        fg = background;
        fill_rect(frame, x, y, (int)cell_width, (int)cell_height, bg);
      }
      if (style.faint) {
        fg.r = (uint8_t)((fg.r + background.r) / 2);
        fg.g = (uint8_t)((fg.g + background.g) / 2);
        fg.b = (uint8_t)((fg.b + background.b) / 2);
      }
      if (has_text && !style.invisible &&
          wide != GHOSTTY_CELL_WIDE_SPACER_TAIL) {
        uint32_t codepoints[MAX_GRAPHEME_CODEPOINTS];
        size_t count = 0;
        GhosttyResult result = ghostty_grid_ref_graphemes(
            &ref, codepoints, MAX_GRAPHEME_CODEPOINTS, &count);
        if (result == GHOSTTY_SUCCESS) {
          for (size_t index = 0; index < count; ++index) {
            draw_codepoint(frame, codepoints[index], x, y, fg);
          }
        } else {
          uint32_t codepoint = 0;
          if (ghostty_cell_get(cell, GHOSTTY_CELL_DATA_CODEPOINT,
                               &codepoint) == GHOSTTY_SUCCESS) {
            draw_codepoint(frame, codepoint, x, y, fg);
          }
        }
      }
      if (style.underline != 0) {
        fill_rect(frame, x, y + (int)cell_height - 2,
                  (int)cell_width, 1, fg);
      }
      if (style.strikethrough) {
        fill_rect(frame, x, y + (int)cell_height / 2,
                  (int)cell_width, 1, fg);
      }
    }
  }

  __c11_atomic_store(&mailbox->frame_width, framebuffer_width, __ATOMIC_RELAXED);
  __c11_atomic_store(&mailbox->frame_height, framebuffer_height, __ATOMIC_RELAXED);
  __c11_atomic_store(&mailbox->frame_stride, framebuffer_stride, __ATOMIC_RELAXED);
  __c11_atomic_store(&mailbox->terminal_cols, cols, __ATOMIC_RELAXED);
  __c11_atomic_store(&mailbox->terminal_rows, rows, __ATOMIC_RELAXED);
  __c11_atomic_store(&mailbox->cursor_col,
                     cursor_visible ? cursor_x : UINT32_MAX, __ATOMIC_RELAXED);
  __c11_atomic_store(&mailbox->cursor_row,
                     cursor_visible ? cursor_y : UINT32_MAX, __ATOMIC_RELAXED);
  __c11_atomic_store(&mailbox->frame_index, next, __ATOMIC_RELEASE);
  __c11_atomic_fetch_add(&mailbox->frame_sequence, 1, __ATOMIC_ACQ_REL);
}

static int initialize(dolly_display_mailbox *shared_mailbox,
                      unsigned char *frame_a,
                      unsigned char *frame_b,
                      size_t capacity,
                      unsigned char *shared_paste_buffer,
                      unsigned char *shared_copy_buffer,
                      size_t shared_clipboard_capacity,
                      const char *font_path) {
  if (shared_mailbox == NULL || frame_a == NULL || frame_b == NULL ||
      capacity < (size_t)160 * 100 * 4 || shared_paste_buffer == NULL ||
      shared_copy_buffer == NULL || shared_clipboard_capacity == 0 ||
      font_path == NULL) return -1;
  mailbox = shared_mailbox;
  frames[0] = frame_a;
  frames[1] = frame_b;
  frame_capacity = capacity;
  paste_buffer = shared_paste_buffer;
  copy_buffer = shared_copy_buffer;
  clipboard_capacity = shared_clipboard_capacity;
  if (load_font(font_path) != 0 ||
      ghostty_terminal_new(NULL, &terminal, 100, 30) != GHOSTTY_SUCCESS ||
      ghostty_key_encoder_new(NULL, &key_encoder) != GHOSTTY_SUCCESS ||
      ghostty_key_event_new(NULL, &key_event) != GHOSTTY_SUCCESS ||
      ghostty_selection_gesture_new(NULL, &selection_gesture) !=
          GHOSTTY_SUCCESS ||
      ghostty_selection_gesture_event_new(
          NULL, &selection_press,
          GHOSTTY_SELECTION_GESTURE_EVENT_TYPE_PRESS) != GHOSTTY_SUCCESS ||
      ghostty_selection_gesture_event_new(
          NULL, &selection_drag,
          GHOSTTY_SELECTION_GESTURE_EVENT_TYPE_DRAG) != GHOSTTY_SUCCESS ||
      ghostty_selection_gesture_event_new(
          NULL, &selection_release,
          GHOSTTY_SELECTION_GESTURE_EVENT_TYPE_RELEASE) != GHOSTTY_SUCCESS) {
    return -1;
  }
  configure_theme();
  ghostty_terminal_set(terminal, GHOSTTY_TERMINAL_OPT_USERDATA, NULL);
  ghostty_terminal_set(terminal, GHOSTTY_TERMINAL_OPT_WRITE_PTY,
                       terminal_write_pty);
  if (set_layout(viewport_width_css, viewport_height_css,
                 device_scale_milli, font_size_milli) != 0) return -1;
  render_frame();
  return 0;
}

static void write_terminal(const unsigned char *bytes, size_t length) {
  if (terminal == NULL || bytes == NULL || length == 0) return;
  size_t start = 0;
  for (size_t index = 0; index < length; ++index) {
    if (bytes[index] != '\n' || previous_output_was_cr) {
      previous_output_was_cr = bytes[index] == '\r';
      continue;
    }
    if (index > start) ghostty_terminal_vt_write(terminal, bytes + start,
                                                 index - start);
    static const unsigned char newline[] = {'\r', '\n'};
    ghostty_terminal_vt_write(terminal, newline, sizeof(newline));
    start = index + 1;
    previous_output_was_cr = false;
  }
  if (start < length) ghostty_terminal_vt_write(terminal, bytes + start,
                                                length - start);
  render_frame();
}

static void set_suspended(int value) {
  const bool was_suspended = suspended;
  suspended = value != 0;
  if (was_suspended && !suspended) render_frame();
}

static GhosttyKey map_key(const char *code) {
  for (size_t index = 0;
       index < sizeof(key_mappings) / sizeof(key_mappings[0]); ++index) {
    if (strcmp(code, key_mappings[index].code) == 0) return key_mappings[index].key;
  }
  return GHOSTTY_KEY_UNIDENTIFIED;
}

static uint32_t unshifted_codepoint(const char *code) {
  if (code[0] == 'K' && code[1] == 'e' && code[2] == 'y' &&
      code[3] >= 'A' && code[3] <= 'Z' && code[4] == '\0') {
    return (uint32_t)('a' + code[3] - 'A');
  }
  if (strncmp(code, "Digit", 5) == 0 && code[5] >= '0' &&
      code[5] <= '9' && code[6] == '\0') return (uint32_t)code[5];
  static const struct { const char *code; uint32_t value; } values[] = {
      {"Backquote", '`'}, {"Backslash", '\\'}, {"BracketLeft", '['},
      {"BracketRight", ']'}, {"Comma", ','}, {"Equal", '='},
      {"Minus", '-'}, {"Period", '.'}, {"Quote", '\''},
      {"Semicolon", ';'}, {"Slash", '/'}, {"Space", ' '},
  };
  for (size_t index = 0; index < sizeof(values) / sizeof(values[0]); ++index) {
    if (strcmp(code, values[index].code) == 0) return values[index].value;
  }
  return 0;
}

static bool printable_key(const char *key, size_t length) {
  if (length == 0 || (unsigned char)key[0] < 0x20 ||
      (length == 1 && (unsigned char)key[0] == 0x7f)) return false;
  static const char *special[] = {
      "Alt", "AltGraph", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp",
      "Backspace", "CapsLock", "Control", "Dead", "Delete", "End", "Enter",
      "Escape", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9",
      "F10", "F11", "F12", "Home", "Insert", "Meta", "PageDown", "PageUp",
      "Pause", "Process", "ScrollLock", "Shift", "Tab", "Unidentified",
  };
  for (size_t index = 0; index < sizeof(special) / sizeof(special[0]); ++index) {
    if (strlen(special[index]) == length &&
        memcmp(key, special[index], length) == 0) return false;
  }
  return true;
}

typedef struct {
  const unsigned char *bytes;
  size_t length;
} paste_source;

static int drain_pty_response(unsigned char *output, size_t capacity,
                              size_t *output_length);

static bool read_paste(void *userdata, GhosttyString mime,
                       GhosttyWriter writer) {
  (void)mime;
  const paste_source *source = userdata;
  return source->length == 0 ||
         writer.write(writer.userdata, source->bytes, source->length);
}

static int handle_paste(unsigned char *output, size_t output_capacity,
                        size_t *output_length) {
  const uint32_t sequence = __c11_atomic_load(
      &mailbox->paste_sequence, __ATOMIC_ACQUIRE);
  const uint32_t consumed = __c11_atomic_load(
      &mailbox->paste_consumed_sequence, __ATOMIC_RELAXED);
  if (sequence == consumed) return 0;
  const uint32_t length = __c11_atomic_load(
      &mailbox->paste_length, __ATOMIC_RELAXED);
  GhosttyResult result = GHOSTTY_INVALID_VALUE;
  if ((size_t)length <= clipboard_capacity) {
    static const uint8_t mime_bytes[] = "text/plain";
    const GhosttyString mime = {
        .ptr = mime_bytes,
        .len = sizeof(mime_bytes) - 1,
    };
    const paste_source source = {
        .bytes = paste_buffer,
        .length = length,
    };
    const GhosttyPaste paste = {
        .size = sizeof(GhosttyPaste),
        .location = GHOSTTY_CLIPBOARD_LOCATION_STANDARD,
        .source = GHOSTTY_PASTE_SOURCE_CLIPBOARD,
        .mimes = &mime,
        .mimes_len = 1,
        .reader = {.read = read_paste, .userdata = (void *)&source},
        // The browser only creates this event from an explicit user paste.
        .allow_unsafe = true,
    };
    result = ghostty_terminal_paste(terminal, &paste, NULL);
  }
  __c11_atomic_store(&mailbox->paste_consumed_sequence, sequence,
                     __ATOMIC_RELEASE);
  if (result != GHOSTTY_SUCCESS) return -1;
  return drain_pty_response(output, output_capacity, output_length);
}

static int handle_pointer(const dolly_input_event *event) {
  uint16_t cols = 0;
  uint16_t rows = 0;
  if (ghostty_terminal_get(terminal, GHOSTTY_TERMINAL_DATA_COLS, &cols) !=
          GHOSTTY_SUCCESS ||
      ghostty_terminal_get(terminal, GHOSTTY_TERMINAL_DATA_ROWS, &rows) !=
          GHOSTTY_SUCCESS ||
      cols == 0 || rows == 0) return -1;

  uint32_t column = event->width_css_px > padding_x
      ? (event->width_css_px - padding_x) / cell_width : 0;
  uint32_t row = event->height_css_px > padding_y
      ? (event->height_css_px - padding_y) / cell_height : 0;
  if (column >= cols) column = cols - 1;
  if (row >= rows) row = rows - 1;
  const GhosttyPoint point = {
      .tag = GHOSTTY_POINT_TAG_VIEWPORT,
      .value = {.coordinate = {.x = (uint16_t)column, .y = row}},
  };
  GhosttyGridRef ref = GHOSTTY_INIT_SIZED(GhosttyGridRef);
  if (ghostty_terminal_grid_ref(terminal, point, &ref) != GHOSTTY_SUCCESS) {
    return -1;
  }
  GhosttySurfacePosition position = {
      .x = event->width_css_px,
      .y = event->height_css_px,
  };
  GhosttySelectionGestureEvent gesture_event = NULL;
  if (event->action == DOLLY_POINTER_ACTION_PRESS) {
    (void)ghostty_terminal_set(terminal, GHOSTTY_TERMINAL_OPT_SELECTION, NULL);
    gesture_event = selection_press;
  } else if (event->action == DOLLY_POINTER_ACTION_DRAG) {
    gesture_event = selection_drag;
  } else if (event->action == DOLLY_POINTER_ACTION_RELEASE) {
    gesture_event = selection_release;
  } else {
    return -1;
  }
  if (ghostty_selection_gesture_event_set(
          gesture_event, GHOSTTY_SELECTION_GESTURE_EVENT_OPT_REF, &ref) !=
      GHOSTTY_SUCCESS) return -1;
  if (event->action != DOLLY_POINTER_ACTION_RELEASE &&
      ghostty_selection_gesture_event_set(
          gesture_event, GHOSTTY_SELECTION_GESTURE_EVENT_OPT_POSITION,
          &position) != GHOSTTY_SUCCESS) return -1;

  bool rectangle = (event->modifiers & DOLLY_INPUT_MOD_ALT) != 0;
  GhosttySelectionGestureGeometry geometry = {
      .columns = cols,
      .cell_width = cell_width,
      .padding_left = padding_x,
      .screen_height = framebuffer_height,
  };
  if (event->action == DOLLY_POINTER_ACTION_DRAG &&
      (ghostty_selection_gesture_event_set(
           gesture_event, GHOSTTY_SELECTION_GESTURE_EVENT_OPT_RECTANGLE,
           &rectangle) != GHOSTTY_SUCCESS ||
       ghostty_selection_gesture_event_set(
           gesture_event, GHOSTTY_SELECTION_GESTURE_EVENT_OPT_GEOMETRY,
           &geometry) != GHOSTTY_SUCCESS)) return -1;

  GhosttySelection selection = GHOSTTY_INIT_SIZED(GhosttySelection);
  GhosttyResult result = ghostty_selection_gesture_event(
      selection_gesture, terminal, gesture_event,
      event->action == DOLLY_POINTER_ACTION_DRAG ? &selection : NULL);
  if (event->action == DOLLY_POINTER_ACTION_DRAG) {
    if (result != GHOSTTY_SUCCESS ||
        ghostty_terminal_set(terminal, GHOSTTY_TERMINAL_OPT_SELECTION,
                            &selection) != GHOSTTY_SUCCESS) return -1;
  } else if (result != GHOSTTY_NO_VALUE) {
    return -1;
  }
  render_frame();
  return 0;
}

static int handle_scroll(const dolly_input_event *event) {
  const int32_t delta_milli = (int32_t)event->action;
  if ((delta_milli > 0 && scroll_remainder_milli > INT32_MAX - delta_milli) ||
      (delta_milli < 0 && scroll_remainder_milli < INT32_MIN - delta_milli)) {
    scroll_remainder_milli = 0;
    return -1;
  }
  scroll_remainder_milli += delta_milli;
  const intptr_t rows = scroll_remainder_milli / 1000;
  scroll_remainder_milli %= 1000;
  if (rows == 0) return 0;
  const GhosttyTerminalScrollViewport viewport = {
      .tag = GHOSTTY_SCROLL_VIEWPORT_DELTA,
      .value = {.delta = rows},
  };
  ghostty_terminal_scroll_viewport(terminal, viewport);
  render_frame();
  return 0;
}

static int drain_pty_response(unsigned char *output, size_t capacity,
                              size_t *output_length) {
  size_t length = pty_response_write - pty_response_read;
  if (length > capacity) length = capacity;
  for (size_t index = 0; index < length; ++index) {
    output[index] = pty_response[pty_response_read++ & (PTY_RESPONSE_CAPACITY - 1)];
  }
  if (pty_response_read == pty_response_write) {
    pty_response_read = 0;
    pty_response_write = 0;
  }
  *output_length = length;
  return 0;
}

static int handle_event(const dolly_input_event *event,
                        unsigned char *output,
                        size_t output_capacity,
                        size_t *output_length) {
  if (output == NULL || output_length == NULL) return -1;
  *output_length = 0;
  if (pty_response_read != pty_response_write) {
    return drain_pty_response(output, output_capacity, output_length);
  }
  if (event == NULL) return 0;
  const size_t total = (size_t)event->key_length + event->code_length +
                       event->text_length;
  if (total > sizeof(event->data)) return -1;
  if (event->type == DOLLY_INPUT_EVENT_RESIZE) {
    if (set_layout(event->width_css_px, event->height_css_px,
                   event->device_scale_milli, event->font_size_milli) != 0) return -1;
    render_frame();
    return 0;
  }
  if (event->type == DOLLY_INPUT_EVENT_TEXT) {
    if (event->text_length > output_capacity) return -1;
    memcpy(output, event->data, event->text_length);
    *output_length = event->text_length;
    return 0;
  }
  if (event->type == DOLLY_INPUT_EVENT_PASTE) {
    return handle_paste(output, output_capacity, output_length);
  }
  if (event->type == DOLLY_INPUT_EVENT_POINTER) {
    return handle_pointer(event);
  }
  if (event->type == DOLLY_INPUT_EVENT_SCROLL) {
    return handle_scroll(event);
  }
  if (event->type != DOLLY_INPUT_EVENT_KEY) return 0;

  char key[DOLLY_DISPLAY_EVENT_DATA_SIZE + 1];
  char code[DOLLY_DISPLAY_EVENT_DATA_SIZE + 1];
  memcpy(key, event->data, event->key_length);
  key[event->key_length] = '\0';
  memcpy(code, event->data + event->key_length, event->code_length);
  code[event->code_length] = '\0';

  if (event->action != DOLLY_KEY_ACTION_RELEASE &&
      (event->modifiers & DOLLY_INPUT_MOD_CONTROL) != 0 &&
      (strcmp(code, "Equal") == 0 || strcmp(code, "NumpadAdd") == 0 ||
       strcmp(code, "Minus") == 0 || strcmp(code, "NumpadSubtract") == 0)) {
    const bool increase = strcmp(code, "Equal") == 0 ||
                          strcmp(code, "NumpadAdd") == 0;
    uint32_t next = increase ? font_size_milli + 1000 : font_size_milli - 1000;
    next = clamp_u32(next, MIN_FONT_MILLI, MAX_FONT_MILLI);
    if (set_layout(viewport_width_css, viewport_height_css,
                   device_scale_milli, next) == 0) render_frame();
    return 0;
  }
  if (strcmp(code, "F11") == 0) return 0;

  ghostty_key_event_set_action(key_event, (GhosttyKeyAction)event->action);
  ghostty_key_event_set_key(key_event, map_key(code));
  GhosttyMods mods = 0;
  if ((event->modifiers & DOLLY_INPUT_MOD_SHIFT) != 0) mods |= GHOSTTY_MODS_SHIFT;
  if ((event->modifiers & DOLLY_INPUT_MOD_CONTROL) != 0) mods |= GHOSTTY_MODS_CTRL;
  if ((event->modifiers & DOLLY_INPUT_MOD_ALT) != 0) mods |= GHOSTTY_MODS_ALT;
  if ((event->modifiers & DOLLY_INPUT_MOD_META) != 0) mods |= GHOSTTY_MODS_SUPER;
  if ((event->modifiers & DOLLY_INPUT_MOD_CAPS_LOCK) != 0) mods |= GHOSTTY_MODS_CAPS_LOCK;
  if ((event->modifiers & DOLLY_INPUT_MOD_NUM_LOCK) != 0) mods |= GHOSTTY_MODS_NUM_LOCK;
  ghostty_key_event_set_mods(key_event, mods);
  ghostty_key_event_set_consumed_mods(key_event, 0);
  ghostty_key_event_set_composing(
      key_event, (event->flags & DOLLY_INPUT_FLAG_COMPOSING) != 0);
  if (printable_key(key, event->key_length)) {
    ghostty_key_event_set_utf8(key_event, key, event->key_length);
  } else {
    ghostty_key_event_set_utf8(key_event, NULL, 0);
  }
  ghostty_key_event_set_unshifted_codepoint(key_event,
                                            unshifted_codepoint(code));
  ghostty_key_encoder_setopt_from_terminal(key_encoder, terminal);
  size_t written = 0;
  GhosttyResult result = ghostty_key_encoder_encode(
      key_encoder, key_event, (char *)output, output_capacity, &written);
  if (result != GHOSTTY_SUCCESS) return -1;
  *output_length = written;
  return 0;
}

static const dolly_display_driver_v3 driver = {
    .abi_version = DRIVER_ABI_VERSION,
    .struct_size = sizeof(dolly_display_driver_v3),
    .initialize = initialize,
    .write = write_terminal,
    .handle_event = handle_event,
    .set_suspended = set_suspended,
};

__attribute__((export_name("dolly_display_driver_get_v3")))
const dolly_display_driver_v3 *dolly_display_driver_export(void) {
  return &driver;
}

int main(int argc, char **argv) {
  (void)argc;
  (void)argv;
  return 0;
}
