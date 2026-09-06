// Compile inside Dolly. These tests exercise the actual image codec
// against the shared Wasm filesystem, not a native filesystem substitute.
#ifndef __wasm__
#error This fixture temporarily replaces the sandbox image manifest; run in Dolly only.
#endif
#define _POSIX_C_SOURCE 200809L
#include "system-snapshot.c"

#define ROOT "/usr/share/dolly-image-roundtrip"
#define CHECK(expression) do { if (!(expression)) { \
  fprintf(stderr, "image-roundtrip:%d: %s (%s)\n", __LINE__, #expression, strerror(errno)); \
  return 1; \
} } while (0)

static dolly_fs_record records[] = {
  {ROOT, DOLLY_FS_DIRECTORY, 0, NULL},
  {ROOT "/cycle", DOLLY_FS_SYMLINK, 1, (const unsigned char *)"."},
  {ROOT "/dangling", DOLLY_FS_SYMLINK, 7, (const unsigned char *)"missing"},
  {ROOT "/empty", DOLLY_FS_DIRECTORY, 0, NULL},
  {ROOT "/file", DOLLY_FS_FILE, 4, (const unsigned char *)"data"},
  {ROOT "/link", DOLLY_FS_SYMLINK, 4, (const unsigned char *)"file"},
};

static int roundtrip(void) {
  FILE *manifest = fopen("/etc/dolly/image.manifest", "w");
  CHECK(manifest != NULL);
  for (size_t index = 0; index < 6; ++index) CHECK(fprintf(manifest, "%s\n", records[index].path) > 0);
  CHECK(fclose(manifest) == 0);
  CHECK(dolly_snapshot_capture() == 0 && dolly_snapshot_format_version() == 2);
  const uintptr_t size = dolly_snapshot_size();
  unsigned char *staged = (unsigned char *)dolly_snapshot_restore_address(size);
  CHECK(staged != NULL);
  memcpy(staged, (const void *)dolly_snapshot_address(), size);
  CHECK(dolly_fs_remove_tree(ROOT) == 0);
  CHECK(dolly_snapshot_restore_staged(size) == 0);
  CHECK(restore_bytes == NULL && restore_capacity == 0);
  CHECK(dolly_snapshot_restore_staged(size) != 0 && errno == EINVAL);
  // A malformed path kind fails before touching the restored file tree.
  staged = (unsigned char *)dolly_snapshot_restore_address(size);
  CHECK(staged != NULL);
  memcpy(staged, (const void *)dolly_snapshot_address(), size);
  staged[16] = 4;
  CHECK(dolly_snapshot_restore_staged(size) != 0);
  CHECK(restore_bytes == NULL && restore_capacity == 0);
  staged = (unsigned char *)dolly_snapshot_restore_address(size);
  CHECK(staged != NULL);
  memcpy(staged, (const void *)dolly_snapshot_address(), size);
  CHECK(dolly_snapshot_restore_staged(size + 1) != 0 && errno == EINVAL);
  CHECK(restore_bytes == NULL && restore_capacity == 0);
  staged = (unsigned char *)dolly_snapshot_restore_address(size);
  CHECK(staged != NULL);
  memcpy(staged, (const void *)dolly_snapshot_address(), size);
  CHECK(dolly_snapshot_restore_staged(size) == 0);
  CHECK(restore_bytes == NULL && restore_capacity == 0);
  return 0;
}

static int check_roundtrip(void) {
  CHECK(dolly_fs_restore(records, 6, 1) == 0);
  CHECK(roundtrip() == 0);
  for (size_t index = 0; index < 6; ++index) {
    uint32_t kind;
    uintptr_t size;
    CHECK(dolly_fs_metadata(records[index].path, &kind, &size) == 0);
    CHECK(kind == records[index].kind && size == records[index].size);
    unsigned char data[16];
    CHECK(dolly_fs_read_data(&records[index], data) == 0);
    CHECK(size == 0 || memcmp(data, records[index].data, size) == 0);
  }
  puts("IMAGE-ROUNDTRIP-OK");
  return 0;
}

int main(void) {
  struct stat metadata;
  CHECK(lstat(ROOT, &metadata) == -1 && errno == ENOENT);
  const int descriptor = open("/etc/dolly/image.manifest", O_RDONLY);
  CHECK(descriptor >= 0 && fstat(descriptor, &metadata) == 0);
  const size_t saved_size = metadata.st_size;
  unsigned char *saved = malloc(saved_size);
  CHECK(saved != NULL && read_exact(descriptor, saved, saved_size) == 0 && close(descriptor) == 0);
  const int result = check_roundtrip();
  CHECK(dolly_fs_remove_tree(ROOT) == 0);
  FILE *manifest = fopen("/etc/dolly/image.manifest", "w");
  CHECK(manifest != NULL && fwrite(saved, 1, saved_size, manifest) == saved_size && fclose(manifest) == 0);
  free(saved);
  return result;
}
