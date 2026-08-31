#define _POSIX_C_SOURCE 200809L

#include <ctype.h>
#include <errno.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>

static const char *classify(const char *path, int mime) {
  static char result[96];
  struct stat metadata;
  if (lstat(path, &metadata) != 0) {
    snprintf(result, sizeof(result), "cannot open: %s", strerror(errno));
    return result;
  }
  if (S_ISDIR(metadata.st_mode)) return mime ? "inode/directory" : "directory";
  FILE *stream = fopen(path, "rb");
  if (stream == NULL) {
    snprintf(result, sizeof(result), "cannot open: %s", strerror(errno));
    return result;
  }
  unsigned char bytes[512];
  const size_t length = fread(bytes, 1, sizeof(bytes), stream);
  fclose(stream);
  static const unsigned char wasm_magic[] = {0, 'a', 's', 'm', 1, 0, 0, 0};
  if (length >= sizeof(wasm_magic) && memcmp(bytes, wasm_magic, sizeof(wasm_magic)) == 0)
    return mime ? "application/wasm" : "WebAssembly binary module";
  if (length >= 8 && memcmp(bytes, "!<arch>\n", 8) == 0)
    return mime ? "application/x-archive" : "current ar archive";
  if (length >= 2 && bytes[0] == 0x1f && bytes[1] == 0x8b)
    return mime ? "application/gzip" : "gzip compressed data";
  if (length == 0) return mime ? "application/x-empty" : "empty";
  int text = 1;
  for (size_t index = 0; index < length; index++) {
    if (bytes[index] == 0 || (!isprint(bytes[index]) && !isspace(bytes[index]))) { text = 0; break; }
  }
  return text ? (mime ? "text/plain" : "ASCII text")
              : (mime ? "application/octet-stream" : "data");
}

int main(int argc, char **argv) {
  int brief = 0, mime = 0, first = 1;
  for (; first < argc; first++) {
    if (strcmp(argv[first], "--") == 0) { first++; break; }
    if (strcmp(argv[first], "-b") == 0 || strcmp(argv[first], "--brief") == 0) brief = 1;
    else if (strcmp(argv[first], "--mime-type") == 0) mime = 1;
    else if (strcmp(argv[first], "--help") == 0) { fputs("usage: file [-b] [--mime-type] FILE ...\n", stdout); return 0; }
    else if (argv[first][0] == '-') { fprintf(stderr, "file: unsupported option: %s\n", argv[first]); return 2; }
    else break;
  }
  if (first == argc) { fputs("file: missing file operand\n", stderr); return 2; }
  for (; first < argc; first++) {
    if (!brief) printf("%s: ", argv[first]);
    puts(classify(argv[first], mime));
  }
  return 0;
}
