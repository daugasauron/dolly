// Creates the upload destination while the user is still choosing a file.
#include <dolly/runtime.h>
#include <stdio.h>
#include <unistd.h>
int main(void) {
  char *args[] = {"upload", "/workspace/upload-race", NULL};
  const int child = dolly_spawn("/bin/upload", 2, args, 0, 1, 2);
  if (child <= 0) return 2;
  sleep(1);
  FILE *file = fopen(args[1], "w");
  if (!file) return 2;
  fputs("created while selecting", file);
  fclose(file);
  puts("UPLOAD-RACE-READY");
  fflush(stdout);
  int status;
  return dolly_wait(child, &status) == 0 ? status : 2;
}
