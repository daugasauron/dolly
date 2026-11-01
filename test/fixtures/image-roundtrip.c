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

// The image as the Worker captures it: through a staging window, here of an odd
// size so that pieces end inside headers, paths and data; NULL when the
// capture fails.
static unsigned char *capture_image(size_t *size) {
  const uintptr_t total = dolly_snapshot_capture_begin();
  unsigned char *window = (unsigned char *)dolly_snapshot_restore_address(17);
  unsigned char *bytes = total != 0 && window != NULL ? malloc(total) : NULL;
  if (bytes == NULL) return NULL;
  uintptr_t offset = 0, got;
  while ((got = dolly_snapshot_capture_read()) != 0) {
    if (got > total - offset) { free(bytes); return NULL; }
    memcpy(bytes + offset, window, got);
    offset += got;
  }
  if (offset != total) { free(bytes); return NULL; }
  *size = total;
  return bytes;
}

// Whether a capture now gives BYTES again.
static int captures(const unsigned char *bytes, size_t size) {
  size_t again;
  unsigned char *now = capture_image(&again);
  const int same = now != NULL && again == size && memcmp(now, bytes, size) == 0;
  free(now);
  return same;
}

static int roundtrip(void) {
  FILE *manifest = fopen("/etc/dolly/image.manifest", "w");
  CHECK(manifest != NULL);
  for (size_t index = 0; index < 6; ++index) CHECK(fprintf(manifest, "%s\n", records[index].path) > 0);
  CHECK(fclose(manifest) == 0);
  CHECK(dolly_snapshot_format_version() == 2);
  size_t size;
  unsigned char *image = capture_image(&size);
  CHECK(image != NULL);
  unsigned char *staged = (unsigned char *)dolly_snapshot_restore_address(size);
  CHECK(staged != NULL);
  memcpy(staged, image, size);
  CHECK(dolly_fs_remove_tree(ROOT) == 0);
  CHECK(dolly_snapshot_restore_staged(size, NULL) == 0);
  CHECK(restore_bytes == NULL && restore_capacity == 0);
  for (const char **path = (const char *[]){ROOT "/missing", ROOT, ROOT "/link", NULL}; *path; ++path) {
    staged = (unsigned char *)dolly_snapshot_restore_address(size);
    CHECK(staged != NULL);
    memcpy(staged, image, size);
    CHECK(dolly_snapshot_restore_staged(size, *path) != 0);
    CHECK(restore_bytes == NULL && restore_capacity == 0);
  }
  CHECK(dolly_fs_remove_tree(ROOT) == 0);
  for (int corruption = 0; corruption < 2; ++corruption) {
    staged = (unsigned char *)dolly_snapshot_restore_address(size);
    CHECK(staged != NULL);
    memcpy(staged, image, size);
    if (corruption == 0) staged[16] = DOLLY_FS_FILE; // invalid parent elsewhere in the image
    else staged[size - 1] = 0; // invalid unselected symlink
    CHECK(dolly_snapshot_restore_staged(size, ROOT "/file") != 0);
    CHECK(restore_bytes == NULL && restore_capacity == 0);
    CHECK(access(ROOT, F_OK) == -1 && errno == ENOENT);
  }
  staged = (unsigned char *)dolly_snapshot_restore_address(size);
  CHECK(staged != NULL);
  memcpy(staged, image, size);
  CHECK(dolly_snapshot_restore_staged(size, ROOT "/file") == 0);
  CHECK(restore_bytes == NULL && restore_capacity == 0);
  unsigned char selected[4];
  CHECK(dolly_fs_read_data(&records[4], selected) == 0 && memcmp(selected, "data", 4) == 0);
  CHECK(access(ROOT "/empty", F_OK) == -1 && errno == ENOENT);
  struct stat absent;
  CHECK(lstat(ROOT "/link", &absent) == -1 && errno == ENOENT);
  staged = (unsigned char *)dolly_snapshot_restore_address(size);
  CHECK(staged != NULL);
  memcpy(staged, image, size);
  CHECK(dolly_snapshot_restore_staged(size, NULL) == 0);
  CHECK(restore_bytes == NULL && restore_capacity == 0);
  CHECK(dolly_snapshot_restore_staged(size, NULL) != 0 && errno == EINVAL);
  // A malformed path kind fails before touching the restored file tree.
  staged = (unsigned char *)dolly_snapshot_restore_address(size);
  CHECK(staged != NULL);
  memcpy(staged, image, size);
  staged[16] = 4;
  CHECK(dolly_snapshot_restore_staged(size, NULL) != 0);
  CHECK(restore_bytes == NULL && restore_capacity == 0);
  staged = (unsigned char *)dolly_snapshot_restore_address(size);
  CHECK(staged != NULL);
  memcpy(staged, image, size);
  CHECK(dolly_snapshot_restore_staged(size + 1, NULL) != 0 && errno == EINVAL);
  CHECK(restore_bytes == NULL && restore_capacity == 0);
  staged = (unsigned char *)dolly_snapshot_restore_address(size);
  CHECK(staged != NULL);
  memcpy(staged, image, size);
  CHECK(dolly_snapshot_restore_staged(size, NULL) == 0);
  CHECK(restore_bytes == NULL && restore_capacity == 0);
  CHECK(captures(image, size));
  // A capture left unread is replaced by the next; a missing input fails one.
  CHECK(dolly_snapshot_capture_begin() == size);
  CHECK(captures(image, size));
  CHECK(unlink(ROOT "/file") == 0);
  CHECK(dolly_snapshot_capture_begin() == 0);
  CHECK(dolly_fs_restore(&records[4], 1, 0) == 0);
  CHECK(captures(image, size));
  free(image);
  return 0;
}

static int feed_part(const unsigned char *bytes, size_t size, size_t chunk) {
  for (size_t offset = 0; offset < size; offset += chunk) {
    size_t amount = size - offset < chunk ? size - offset : chunk;
    unsigned char *staged = (unsigned char *)dolly_snapshot_restore_address(chunk < 32 ? 32 : chunk);
    CHECK(staged != NULL);
    memcpy(staged, bytes + offset, amount);
    CHECK(dolly_snapshot_stream_write(amount, 0) == 0);
  }
  CHECK(dolly_snapshot_stream_write(0, 1) == 0);
  Sha256 sha;
  unsigned char digest[32];
  sha256_init(&sha); sha256_update(&sha, bytes, size); sha256_finish(&sha, digest);
  CHECK(memcmp(restore_bytes, digest, 32) == 0);
  return 0;
}

static int begin_stream(const unsigned char *bytes, size_t size, int corrupt_hash) {
  unsigned char *staged = (unsigned char *)dolly_snapshot_restore_address(4096);
  CHECK(staged != NULL);
  Sha256 sha;
  sha256_init(&sha); sha256_update(&sha, bytes, size); sha256_finish(&sha, staged);
  if (corrupt_hash) staged[0] ^= 1;
  CHECK(dolly_snapshot_stream_begin(size) == 0);
  return 0;
}

static int stream_roundtrip(void) {
  size_t size;
  unsigned char *bytes = capture_image(&size);
  CHECK(bytes != NULL);
  for (size_t chunk = 1; chunk <= 1024; chunk *= 2) {
    CHECK(dolly_fs_remove_tree(ROOT) == 0);
    CHECK(begin_stream(bytes, size, 0) == 0);
    CHECK(feed_part(bytes, size, chunk) == 0);
    CHECK(dolly_snapshot_stream_finish() == 0);
    CHECK(captures(bytes, size));
  }
  size_t offsets[7];
  const unsigned char *cursor = bytes + 16, *end = bytes + size;
  for (size_t index = 0; index < 6; ++index) {
    offsets[index] = cursor - bytes;
    uint32_t kind, path;
    uint64_t length;
    CHECK(dolly_fs_take_u32(&cursor, end, &kind) == 0 && dolly_fs_take_u32(&cursor, end, &path) == 0 &&
          dolly_fs_take_u64(&cursor, end, &length) == 0);
    cursor += path + length;
  }
  offsets[6] = size;
  CHECK(dolly_fs_remove_tree(ROOT) == 0);
  CHECK(begin_stream(bytes, size, 0) == 0);
  for (size_t index = 6; index != 0; --index) {
    const size_t length = offsets[index] - offsets[index - 1];
    unsigned char part[4096];
    CHECK(length + 16 <= sizeof(part));
    memcpy(part, bytes, 16); part[12] = 1;
    memcpy(part + 16, bytes + offsets[index - 1], length);
    CHECK(feed_part(part, 16 + length, 7) == 0);
  }
  CHECK(dolly_snapshot_stream_finish() == 0);
  CHECK(captures(bytes, size));
  CHECK(begin_stream(bytes, size, 1) == 0);
  CHECK(feed_part(bytes, size, 31) == 0);
  CHECK(dolly_snapshot_stream_finish() != 0 && errno == EBADMSG);
  for (size_t cut = 0; cut < size; ++cut) {
    CHECK(begin_stream(bytes, size, 0) == 0);
    memcpy(restore_bytes, bytes, cut);
    CHECK(dolly_snapshot_stream_write(cut, 0) == 0);
    CHECK(dolly_snapshot_stream_write(0, 1) != 0);
    CHECK(dolly_snapshot_stream_finish() != 0);
  }
  CHECK(begin_stream(bytes, size, 0) == 0);
  CHECK(feed_part(bytes, size, 16) == 0);
  memcpy(restore_bytes, bytes, size);
  CHECK(dolly_snapshot_stream_write(size, 1) != 0); // duplicate paths
  CHECK(begin_stream(bytes, size, 0) == 0);
  memcpy(restore_bytes, bytes, size);
  restore_bytes[16] = DOLLY_FS_SYMLINK; // a retained parent cannot be a link
  CHECK(dolly_snapshot_stream_write(size, 1) != 0);
  CHECK(dolly_fs_restore(records, 6, 1) == 0);
  free(bytes);
  puts("IMAGE-STREAM-OK");
  return 0;
}

static int check_roundtrip(void) {
  CHECK(dolly_fs_restore(records, 6, 1) == 0);
  CHECK(roundtrip() == 0);
  CHECK(stream_roundtrip() == 0);
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
  CHECK(saved != NULL && dolly_fs_read_exact(descriptor, saved, saved_size) == 0 && close(descriptor) == 0);
  const int result = check_roundtrip();
  CHECK(dolly_fs_remove_tree(ROOT) == 0);
  FILE *manifest = fopen("/etc/dolly/image.manifest", "w");
  CHECK(manifest != NULL && fwrite(saved, 1, saved_size, manifest) == saved_size && fclose(manifest) == 0);
  free(saved);
  return result;
}
