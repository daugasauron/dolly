#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include <ghostty/vt.h>

static int fail(GhosttyTerminal terminal, const char *message) {
  if (terminal != NULL) ghostty_terminal_free(terminal);
  fprintf(stderr, "ghostty-vt: %s\n", message);
  return 1;
}

int main(int argc, char **argv) {
  (void)argc;
  (void)argv;

  GhosttyTerminal terminal = NULL;
  if (ghostty_terminal_new(NULL, &terminal, 10, 3) != GHOSTTY_SUCCESS) {
    return fail(NULL, "could not create terminal");
  }

  const char input[] = "Hello!\r\nWorld\r\n\033[1mBold";
  ghostty_terminal_vt_write(terminal, (const uint8_t *)input,
                            strlen(input));

  uint16_t cols = 0;
  uint16_t rows = 0;
  if (ghostty_terminal_get(terminal, GHOSTTY_TERMINAL_DATA_COLS, &cols) !=
          GHOSTTY_SUCCESS ||
      ghostty_terminal_get(terminal, GHOSTTY_TERMINAL_DATA_ROWS, &rows) !=
          GHOSTTY_SUCCESS ||
      cols != 10 || rows != 3) {
    return fail(terminal, "unexpected terminal dimensions");
  }

  for (uint16_t row = 0; row < rows; ++row) {
    printf("row %u: ", row);
    for (uint16_t col = 0; col < cols; ++col) {
      GhosttyGridRef ref = GHOSTTY_INIT_SIZED(GhosttyGridRef);
      const GhosttyPoint point = {
          .tag = GHOSTTY_POINT_TAG_ACTIVE,
          .value = {.coordinate = {.x = col, .y = row}},
      };
      if (ghostty_terminal_grid_ref(terminal, point, &ref) != GHOSTTY_SUCCESS) {
        return fail(terminal, "could not resolve grid cell");
      }

      GhosttyCell cell = 0;
      bool has_text = false;
      uint32_t codepoint = 0;
      if (ghostty_grid_ref_cell(&ref, &cell) != GHOSTTY_SUCCESS ||
          ghostty_cell_get(cell, GHOSTTY_CELL_DATA_HAS_TEXT, &has_text) !=
              GHOSTTY_SUCCESS ||
          (has_text &&
           ghostty_cell_get(cell, GHOSTTY_CELL_DATA_CODEPOINT, &codepoint) !=
               GHOSTTY_SUCCESS)) {
        return fail(terminal, "could not inspect grid cell");
      }
      putchar(has_text && codepoint < 128 ? (char)codepoint : '.');
    }

    GhosttyGridRef first = GHOSTTY_INIT_SIZED(GhosttyGridRef);
    const GhosttyPoint point = {
        .tag = GHOSTTY_POINT_TAG_ACTIVE,
        .value = {.coordinate = {.x = 0, .y = row}},
    };
    GhosttyStyle style = GHOSTTY_INIT_SIZED(GhosttyStyle);
    if (ghostty_terminal_grid_ref(terminal, point, &first) != GHOSTTY_SUCCESS ||
        ghostty_grid_ref_style(&first, &style) != GHOSTTY_SUCCESS) {
      return fail(terminal, "could not inspect grid style");
    }
    printf(" bold=%s\n", style.bold ? "true" : "false");
  }

  ghostty_terminal_free(terminal);
  return 0;
}
