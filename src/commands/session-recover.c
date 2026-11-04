#define _POSIX_C_SOURCE 200809L
#include "session-records.h"

static int recoverable(const dolly_fs_record *record) {
  return (record->kind == DOLLY_FS_DIRECTORY || record->kind == DOLLY_FS_FILE) &&
    (strcmp(record->path, "/workspace") == 0 || strncmp(record->path, "/workspace/", 11) == 0 ||
     strcmp(record->path, "/home") == 0 || strncmp(record->path, "/home/", 6) == 0);
}

int main(int argc, char **argv) {
  if (argc == 2 && strcmp(argv[1], "--help") == 0) {
    puts("usage: session-recover DELTA /absolute/new-directory\n"
         "Copy the files and directories a saved session file holds under /home and\n"
         "/workspace into a new directory, leaving the running session as it is.\n"
         "example: session-recover /tmp/saved-session /workspace/recovered");
    return 0;
  }
  if (argc != 3 || !dolly_fs_valid_path(argv[2])) {
    fputs("usage: session-recover DELTA /absolute/new-directory\n", stderr);
    return 2;
  }
  int status = 1, created = 0;
  unsigned char *bytes = NULL;
  dolly_session_delta saved = {0}, copies = {0};
  struct stat metadata;
  if (lstat(argv[2], &metadata) == 0) { errno = EEXIST; goto done; }
  if (errno != ENOENT || dolly_fs_parents(argv[2], 0) != 0) goto done;
  FILE *input = fopen(argv[1], "rb");
  if (input == NULL) goto done;
  if (fstat(fileno(input), &metadata) != 0 || !S_ISREG(metadata.st_mode) ||
      metadata.st_size < DOLLY_SESSION_HEADER_SIZE ||
      (uint64_t)metadata.st_size > DOLLY_SESSION_MAX_SIZE) {
    fclose(input); errno = EINVAL; goto done;
  }
  const uintptr_t size = (uintptr_t)metadata.st_size;
  bytes = malloc(size);
  const int complete = bytes != NULL && fread(bytes, 1, size, input) == size;
  const int closed = fclose(input);
  if (!complete || closed != 0) { errno = bytes == NULL ? ENOMEM : EIO; goto done; }
  if (dolly_session_decode(bytes, size, &saved) != 0) { errno = EINVAL; goto done; }
  copies.records = calloc(saved.count == 0 ? 1 : saved.count, sizeof(*copies.records));
  copies.modified = calloc(saved.count == 0 ? 1 : saved.count, sizeof(*copies.modified));
  if (copies.records == NULL || copies.modified == NULL) goto done;
  for (uint32_t index = 0; index < saved.count; ++index) {
    if (!recoverable(&saved.records[index])) continue;
    const size_t length = strlen(argv[2]) + strlen(saved.records[index].path) + 1;
    if (length > PATH_MAX) { errno = ENAMETOOLONG; goto done; }
    char *path = malloc(length);
    if (path == NULL) goto done;
    snprintf(path, length, "%s%s", argv[2], saved.records[index].path);
    copies.records[copies.count] = saved.records[index];
    copies.records[copies.count].path = path;
    copies.modified[copies.count++] = saved.modified[index];
  }
  if (dolly_fs_validate_restore(copies.records, copies.count, 1) != 0 || mkdir(argv[2], 0755) != 0) goto done;
  created = 1;
  if (dolly_session_restore_delta(&copies, 1) != 0) goto done;
  printf("Recovered %u saved paths to %s; skipped %u system, deletion or symlink records.\n",
    copies.count, argv[2], saved.count - copies.count);
  status = 0;
done:
  if (status != 0) {
    fprintf(stderr, "session-recover: %s\n", strerror(errno));
    if (created) dolly_fs_remove_tree(argv[2]);
  }
  dolly_session_free(&copies);
  dolly_session_free(&saved);
  free(bytes);
  return status;
}
