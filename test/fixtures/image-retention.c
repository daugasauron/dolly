// Native diagnostic of the real Dollyfile collector. Unused runtime/HTTP
// functions are discarded at link time; this is not a host runtime adapter.
#define main dollyfile_main
#include "../../src/dollyfile.c"
#undef main

int main(int argc, char **argv) {
  if (argc != 3 || chdir(argv[1]) != 0) return 2;
  char **paths = NULL;
  size_t count = 0, capacity = 0;
  const int result = collect_paths(&paths, &count, &capacity, argv[2]);
  if (result != 0) fprintf(stderr, "collect: %s\n", strerror(-result));
  for (size_t index = 0; index < count; ++index) {
    puts(paths[index]);
    free(paths[index]);
  }
  free(paths);
  return result == 0 ? 0 : 1;
}
