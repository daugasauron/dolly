#define _POSIX_C_SOURCE 200809L
#include "fs-record.h"

#define CHECK(expression) do { if (!(expression)) { \
  fprintf(stderr, "fs-record:%d: %s (%s)\n", __LINE__, #expression, strerror(errno)); \
  return 1; \
} } while (0)

static int kind_is(const char *path, uint32_t expected) {
  uint32_t kind = 0;
  uintptr_t size = 0;
  return dolly_fs_metadata(path, &kind, &size) == 0 && kind == expected;
}

int main(int argc, char **argv) {
  CHECK(argc == 2 && argv[1][0] == '/');
  const char *suffixes[] = {"/tree", "/tree/cycle", "/tree/dangling", "/tree/empty",
                          "/tree/file", "/tree/link", "/tree/new\nline\\name"};
  char paths[7][PATH_MAX];
  for (size_t index = 0; index < 7; ++index) {
    CHECK(snprintf(paths[index], PATH_MAX, "%s%s", argv[1], suffixes[index]) < PATH_MAX);
  }
  dolly_fs_record records[] = {
    {paths[0], DOLLY_FS_DIRECTORY, 0, NULL},
    {paths[1], DOLLY_FS_SYMLINK, 1, (const unsigned char *)"."},
    {paths[2], DOLLY_FS_SYMLINK, 7, (const unsigned char *)"missing"},
    {paths[3], DOLLY_FS_DIRECTORY, 0, NULL},
    {paths[4], DOLLY_FS_FILE, 4, (const unsigned char *)"data"},
    {paths[5], DOLLY_FS_SYMLINK, 4, (const unsigned char *)"file"},
    {paths[6], DOLLY_FS_FILE, 0, NULL},
  };
  CHECK(dolly_fs_restore(records, 7, 1) == 0);
  for (size_t index = 0; index < 7; ++index) {
    CHECK(kind_is(paths[index], records[index].kind));
    uint32_t kind;
    uintptr_t size;
    CHECK(dolly_fs_metadata(paths[index], &kind, &size) == 0 && size == records[index].size);
    unsigned char data[16] = {0};
    CHECK(dolly_fs_read_data(&records[index], data) == 0);
    CHECK(size == 0 || memcmp(data, records[index].data, size) == 0);
  }
  // Invalid final parents are rejected before an earlier file can be removed.
  dolly_fs_record invalid[] = {records[0], records[4]};
  invalid[0].kind = DOLLY_FS_FILE;
  CHECK(dolly_fs_restore(invalid, 2, 0) == -1 && errno == ENOTDIR);
  CHECK(kind_is(paths[4], DOLLY_FS_FILE));
  invalid[0] = records[4]; invalid[1] = records[4];
  CHECK(dolly_fs_restore(invalid, 2, 0) == -1 && errno == EINVAL);
  CHECK(kind_is(paths[4], DOLLY_FS_FILE));
  // Replacement must unlink the alias, never delete the old alias's target.
  dolly_fs_record change = {paths[5], DOLLY_FS_DIRECTORY, 0, NULL};
  CHECK(dolly_fs_restore(&change, 1, 0) == 0);
  CHECK(kind_is(paths[4], DOLLY_FS_FILE) && kind_is(paths[5], DOLLY_FS_DIRECTORY));
  change = records[5];
  CHECK(dolly_fs_restore(&change, 1, 0) == 0);
  CHECK(kind_is(paths[5], DOLLY_FS_SYMLINK));
  // Replace an old symlink ancestor with a directory and then its new child.
  char child[PATH_MAX];
  CHECK(snprintf(child, PATH_MAX, "%s/child", paths[5]) < PATH_MAX);
  dolly_fs_record replacement[] = {
    {paths[5], DOLLY_FS_DIRECTORY, 0, NULL},
    {child, DOLLY_FS_FILE, 3, (const unsigned char *)"new"},
  };
  CHECK(dolly_fs_restore(replacement, 2, 0) == 0);
  CHECK(kind_is(child, DOLLY_FS_FILE) && kind_is(paths[4], DOLLY_FS_FILE));
  // A child record cannot implicitly traverse an existing symbolic parent.
  CHECK(dolly_fs_restore(&records[5], 1, 0) == 0);
  CHECK(dolly_fs_restore(&replacement[1], 1, 1) == -1 && errno == ENOTDIR);
  change = (dolly_fs_record){paths[0], DOLLY_FS_DELETED, 0, NULL};
  CHECK(dolly_fs_restore(&change, 1, 0) == 0);
  struct stat metadata;
  CHECK(lstat(paths[0], &metadata) == -1 && errno == ENOENT);
  puts("FS-RECORD-OK");
  return 0;
}
