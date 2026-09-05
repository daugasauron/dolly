#include <string.h>

static int increment(int value) { return value + 1; }

static const char library_name[] = "dolly-process-dso";

static const struct {
  const char *name;
  int (*transform)(int);
} library = {
    .name = library_name,
    .transform = increment,
};

int dolly_process_dso_answer(int value) {
  return strcmp(library.name, "dolly-process-dso") == 0
             ? library.transform(value)
             : -1;
}
