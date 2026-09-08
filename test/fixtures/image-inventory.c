#define _POSIX_C_SOURCE 200809L
#include <dirent.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

static char **paths;
static size_t path_count, extra, missing, live;

static int retained(const char *path, int directory) {
  for (size_t index = 0; index < path_count; ++index) {
    if (strcmp(path, paths[index]) == 0 ||
        (directory && strncmp(path, paths[index], strlen(path)) == 0 &&
         paths[index][strlen(path)] == '/')) return 1;
  }
  return strcmp(path, "/etc/dolly/image.manifest") == 0 ||
         strcmp(path, "/etc/dolly/host.base") == 0;
}

static int walk(const char *path) {
  struct stat metadata;
  if (lstat(path, &metadata) != 0) return 1;
  ++live;
  const int directory = S_ISDIR(metadata.st_mode);
  if (!retained(path, directory)) {
    if (extra++ < 20) fprintf(stderr, "unretained: %s\n", path);
  }
  if (!directory) return 0;
  DIR *input = opendir(path);
  if (input == NULL) return 1;
  int status = 0;
  struct dirent *entry;
  while ((entry = readdir(input)) != NULL) {
    if (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0) continue;
    char child[4096];
    if (snprintf(child, sizeof(child), "%s/%s", path, entry->d_name) >= (int)sizeof(child) ||
        walk(child) != 0) { status = 1; break; }
  }
  return closedir(input) == 0 ? status : 1;
}

int main(int argc, char **argv) {
  if (argc != 2) return 2;
  FILE *manifest = fopen("/etc/dolly/image.manifest", "r");
  if (manifest == NULL) return 2;
  char *line = NULL;
  size_t capacity = 0;
  ssize_t length;
  while ((length = getline(&line, &capacity, manifest)) > 0) {
    if (line[length - 1] != '\n') return 2;
    line[length - 1] = 0;
    paths = realloc(paths, (path_count + 1) * sizeof(*paths));
    if (paths == NULL || (paths[path_count++] = strdup(line)) == NULL) return 2;
    struct stat metadata;
    if (lstat(line, &metadata) != 0) { fprintf(stderr, "missing: %s\n", line); ++missing; }
  }
  free(line);
  if (fclose(manifest) != 0) return 2;
  FILE *help = fopen(argv[1], "r");
  if (help == NULL) return 2;
  char help_line[4096];
  int typescript = 0, absent_command = 0;
  while (fgets(help_line, sizeof(help_line), help) != NULL) {
    if (strstr(help_line, "ghostty-vt") != NULL) absent_command = 1;
    if (strncmp(help_line, "TypeScript:", 11) == 0) typescript = 1;
  }
  if (ferror(help) || fclose(help) != 0) return 2;
  if (absent_command || typescript != (access("/usr/bin/tsc", F_OK) == 0)) {
    fputs("help does not match this image's commands\n", stderr);
    return 1;
  }
  const int status = walk("/bin") || walk("/etc") || walk("/usr");
  printf("IMAGE-INVENTORY: %zu declared, %zu live system paths, %zu extra, %zu missing\n",
    path_count, live, extra, missing);
  for (size_t index = 0; index < path_count; ++index) free(paths[index]);
  free(paths);
  return status || extra || missing ? 1 : 0;
}
