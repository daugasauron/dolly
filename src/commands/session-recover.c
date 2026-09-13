#define _POSIX_C_SOURCE 200809L
#include "session-records.h"

static int recoverable(const dolly_fs_record *record) {
  return (record->kind == DOLLY_FS_DIRECTORY || record->kind == DOLLY_FS_FILE) &&
    (strcmp(record->path, "/workspace") == 0 || strncmp(record->path, "/workspace/", 11) == 0 ||
     strcmp(record->path, "/home") == 0 || strncmp(record->path, "/home/", 6) == 0);
}

int main(int argc, char **argv) {
  if (argc != 3 || !dolly_fs_valid_path(argv[2])) {
    fputs("usage: session-recover DELTA /absolute/new-directory\n", stderr);
    return 2;
  }
  int status = 1, created = 0;
  unsigned char *bytes = NULL;
  dolly_fs_record *records = NULL, *copies = NULL;
  uint32_t count = 0;
  size_t copied = 0;
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
  if (dolly_session_decode(bytes, size, &records, &count) != 0) { errno = EINVAL; goto done; }
  copies = calloc(count == 0 ? 1 : count, sizeof(*copies));
  if (copies == NULL) goto done;
  for (uint32_t index = 0; index < count; ++index) {
    if (!recoverable(&records[index])) continue;
    const size_t length = strlen(argv[2]) + strlen(records[index].path) + 1;
    if (length > PATH_MAX) { errno = ENAMETOOLONG; goto done; }
    char *path = malloc(length);
    if (path == NULL) goto done;
    snprintf(path, length, "%s%s", argv[2], records[index].path);
    copies[copied] = records[index];
    copies[copied++].path = path;
  }
  if (dolly_fs_validate_restore(copies, copied, 1) != 0 || mkdir(argv[2], 0755) != 0) goto done;
  created = 1;
  if (dolly_fs_restore(copies, copied, 1) != 0) goto done;
  printf("Recovered %zu saved paths to %s; skipped %zu system, deletion or symlink records.\n",
    copied, argv[2], (size_t)count - copied);
  status = 0;
done:
  if (status != 0) {
    fprintf(stderr, "session-recover: %s\n", strerror(errno));
    if (created) dolly_fs_remove_tree(argv[2]);
  }
  dolly_session_free_records(copies, copied);
  dolly_session_free_records(records, count);
  free(bytes);
  return status;
}
