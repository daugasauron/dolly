#define _POSIX_C_SOURCE 200809L

#include <ctype.h>
#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#include <dolly/http.h>
#include <dolly/runtime.h>

enum {
  MAX_RECIPE_BYTES = 128 * 1024,
  MAX_LOGICAL_LINE_BYTES = 64 * 1024,
  MAX_SOURCE_BYTES = 512 * 1024 * 1024,
  MAX_RECIPE_DEPTH = 16,
  MAX_MANIFEST_FILES = 100000,
};

typedef struct {
  uint32_t state[8];
  uint64_t bits;
  unsigned char block[64];
  size_t used;
} Sha256;

typedef struct {
  unsigned char *data;
  size_t length;
  size_t capacity;
  size_t limit;
} Buffer;

typedef struct {
  char *kind;
  char *name;
  char *locator;
  char digest[65];
  char *source;
} RecipeRecord;

typedef struct {
  char **items;
  size_t count;
  size_t capacity;
  size_t references;
} ObjectMembers;

typedef struct {
  char *type;
  char *name;
  char *detail;
  char *sha256;
  ObjectMembers *members;
} Object;

typedef struct {
  Object *items;
  size_t count;
  size_t capacity;
} Scope;

typedef struct {
  char *host_base;
  char **keep;
  size_t keep_count;
  size_t keep_capacity;
  char **entry;
  size_t entry_count;
  RecipeRecord *recipes;
  size_t recipe_count;
  size_t recipe_capacity;
  char **stack;
  size_t stack_count;
  char **selected_modules;
  size_t selected_module_count;
  size_t selected_module_capacity;
  char **selected_names;
  size_t selected_name_count;
  size_t selected_name_capacity;
  char **environment_names;
  size_t environment_name_count;
  size_t environment_name_capacity;
  char *selected_image;
  size_t resume_uses;
} Engine;

typedef struct {
  int descriptor;
  Sha256 sha;
  size_t length;
} Download;

static uint32_t rotate_right(uint32_t value, unsigned amount) {
  return (value >> amount) | (value << (32 - amount));
}

static void sha256_transform(Sha256 *sha, const unsigned char block[64]) {
  static const uint32_t constants[64] = {
      0x428a2f98u, 0x71374491u, 0xb5c0fbcfu, 0xe9b5dba5u,
      0x3956c25bu, 0x59f111f1u, 0x923f82a4u, 0xab1c5ed5u,
      0xd807aa98u, 0x12835b01u, 0x243185beu, 0x550c7dc3u,
      0x72be5d74u, 0x80deb1feu, 0x9bdc06a7u, 0xc19bf174u,
      0xe49b69c1u, 0xefbe4786u, 0x0fc19dc6u, 0x240ca1ccu,
      0x2de92c6fu, 0x4a7484aau, 0x5cb0a9dcu, 0x76f988dau,
      0x983e5152u, 0xa831c66du, 0xb00327c8u, 0xbf597fc7u,
      0xc6e00bf3u, 0xd5a79147u, 0x06ca6351u, 0x14292967u,
      0x27b70a85u, 0x2e1b2138u, 0x4d2c6dfcu, 0x53380d13u,
      0x650a7354u, 0x766a0abbu, 0x81c2c92eu, 0x92722c85u,
      0xa2bfe8a1u, 0xa81a664bu, 0xc24b8b70u, 0xc76c51a3u,
      0xd192e819u, 0xd6990624u, 0xf40e3585u, 0x106aa070u,
      0x19a4c116u, 0x1e376c08u, 0x2748774cu, 0x34b0bcb5u,
      0x391c0cb3u, 0x4ed8aa4au, 0x5b9cca4fu, 0x682e6ff3u,
      0x748f82eeu, 0x78a5636fu, 0x84c87814u, 0x8cc70208u,
      0x90befffau, 0xa4506cebu, 0xbef9a3f7u, 0xc67178f2u,
  };
  uint32_t words[64];
  for (size_t index = 0; index < 16; ++index) {
    words[index] = ((uint32_t)block[index * 4] << 24) |
                   ((uint32_t)block[index * 4 + 1] << 16) |
                   ((uint32_t)block[index * 4 + 2] << 8) |
                   block[index * 4 + 3];
  }
  for (size_t index = 16; index < 64; ++index) {
    const uint32_t left = words[index - 15];
    const uint32_t right = words[index - 2];
    const uint32_t small0 = rotate_right(left, 7) ^ rotate_right(left, 18) ^
                            (left >> 3);
    const uint32_t small1 = rotate_right(right, 17) ^ rotate_right(right, 19) ^
                            (right >> 10);
    words[index] = words[index - 16] + small0 + words[index - 7] + small1;
  }
  uint32_t a = sha->state[0];
  uint32_t b = sha->state[1];
  uint32_t c = sha->state[2];
  uint32_t d = sha->state[3];
  uint32_t e = sha->state[4];
  uint32_t f = sha->state[5];
  uint32_t g = sha->state[6];
  uint32_t h = sha->state[7];
  for (size_t index = 0; index < 64; ++index) {
    const uint32_t big1 = rotate_right(e, 6) ^ rotate_right(e, 11) ^
                          rotate_right(e, 25);
    const uint32_t choose = (e & f) ^ ((~e) & g);
    const uint32_t first = h + big1 + choose + constants[index] + words[index];
    const uint32_t big0 = rotate_right(a, 2) ^ rotate_right(a, 13) ^
                          rotate_right(a, 22);
    const uint32_t majority = (a & b) ^ (a & c) ^ (b & c);
    const uint32_t second = big0 + majority;
    h = g;
    g = f;
    f = e;
    e = d + first;
    d = c;
    c = b;
    b = a;
    a = first + second;
  }
  sha->state[0] += a;
  sha->state[1] += b;
  sha->state[2] += c;
  sha->state[3] += d;
  sha->state[4] += e;
  sha->state[5] += f;
  sha->state[6] += g;
  sha->state[7] += h;
}

static void sha256_init(Sha256 *sha) {
  static const uint32_t initial[8] = {
      0x6a09e667u, 0xbb67ae85u, 0x3c6ef372u, 0xa54ff53au,
      0x510e527fu, 0x9b05688cu, 0x1f83d9abu, 0x5be0cd19u,
  };
  memcpy(sha->state, initial, sizeof(initial));
  sha->bits = 0;
  sha->used = 0;
}

static void sha256_update(Sha256 *sha, const void *data_value, size_t length) {
  const unsigned char *data = data_value;
  sha->bits += (uint64_t)length * 8;
  while (length != 0) {
    const size_t available = sizeof(sha->block) - sha->used;
    const size_t count = length < available ? length : available;
    memcpy(sha->block + sha->used, data, count);
    sha->used += count;
    data += count;
    length -= count;
    if (sha->used == sizeof(sha->block)) {
      sha256_transform(sha, sha->block);
      sha->used = 0;
    }
  }
}

static void sha256_finish(Sha256 *sha, unsigned char digest[32]) {
  sha->block[sha->used++] = 0x80;
  if (sha->used > 56) {
    memset(sha->block + sha->used, 0, sizeof(sha->block) - sha->used);
    sha256_transform(sha, sha->block);
    sha->used = 0;
  }
  memset(sha->block + sha->used, 0, 56 - sha->used);
  for (size_t index = 0; index < 8; ++index) {
    sha->block[63 - index] = (unsigned char)(sha->bits >> (index * 8));
  }
  sha256_transform(sha, sha->block);
  for (size_t index = 0; index < 8; ++index) {
    digest[index * 4] = (unsigned char)(sha->state[index] >> 24);
    digest[index * 4 + 1] = (unsigned char)(sha->state[index] >> 16);
    digest[index * 4 + 2] = (unsigned char)(sha->state[index] >> 8);
    digest[index * 4 + 3] = (unsigned char)sha->state[index];
  }
}

static void digest_hex(const unsigned char digest[32], char output[65]) {
  static const char digits[] = "0123456789abcdef";
  for (size_t index = 0; index < 32; ++index) {
    output[index * 2] = digits[digest[index] >> 4];
    output[index * 2 + 1] = digits[digest[index] & 15];
  }
  output[64] = '\0';
}

static void sha256_bytes(const void *bytes, size_t length, char output[65]) {
  Sha256 sha;
  unsigned char digest[32];
  sha256_init(&sha);
  sha256_update(&sha, bytes, length);
  sha256_finish(&sha, digest);
  digest_hex(digest, output);
}

static int buffer_reserve(Buffer *buffer, size_t additional) {
  if (additional > buffer->limit - buffer->length) return -EFBIG;
  const size_t required = buffer->length + additional;
  if (required <= buffer->capacity) return 0;
  size_t capacity = buffer->capacity == 0 ? 4096 : buffer->capacity;
  while (capacity < required) {
    if (capacity > buffer->limit / 2) {
      capacity = buffer->limit;
      break;
    }
    capacity *= 2;
  }
  unsigned char *replacement = realloc(buffer->data, capacity + 1);
  if (replacement == NULL) return -ENOMEM;
  buffer->data = replacement;
  buffer->capacity = capacity;
  return 0;
}

static size_t append_buffer(const void *bytes, size_t length, void *context) {
  Buffer *buffer = context;
  if (length == 0) return 0;
  if (buffer_reserve(buffer, length) != 0) return 0;
  memcpy(buffer->data + buffer->length, bytes, length);
  buffer->length += length;
  buffer->data[buffer->length] = '\0';
  return length;
}

static size_t write_download(const void *bytes, size_t length, void *context) {
  Download *download = context;
  if (length > MAX_SOURCE_BYTES - download->length) return 0;
  const unsigned char *cursor = bytes;
  size_t remaining = length;
  while (remaining != 0) {
    const ssize_t written = write(download->descriptor, cursor, remaining);
    if (written <= 0) return 0;
    cursor += (size_t)written;
    remaining -= (size_t)written;
  }
  sha256_update(&download->sha, bytes, length);
  download->length += length;
  return length;
}

// WasmFS can assign a preloaded directory and a newly created file to
// different internal backends, and its rename wrapper is not reliable across
// that boundary. Verification has already completed and recipe execution is
// synchronous, so publish by copying only within Dolly's in-Wasm filesystem.
static int publish_download(const char *temporary, const char *destination) {
  int input = open(temporary, O_RDONLY);
  if (input < 0) return -errno;
  int output = open(destination, O_WRONLY | O_CREAT | O_TRUNC, 0666);
  if (output < 0) {
    const int error = -errno;
    close(input);
    return error;
  }
  unsigned char bytes[64 * 1024];
  int status = 0;
  for (;;) {
    const ssize_t count = read(input, bytes, sizeof(bytes));
    if (count < 0) {
      status = -errno;
      break;
    }
    if (count == 0) break;
    const unsigned char *cursor = bytes;
    size_t remaining = (size_t)count;
    while (remaining != 0) {
      const ssize_t written = write(output, cursor, remaining);
      if (written <= 0) {
        status = -errno;
        break;
      }
      cursor += (size_t)written;
      remaining -= (size_t)written;
    }
    if (status != 0) break;
  }
  if (close(input) != 0 && status == 0) status = -errno;
  if (close(output) != 0 && status == 0) status = -errno;
  if (status == 0) (void)unlink(temporary);
  if (status != 0) unlink(destination);
  return status;
}

static int valid_name(const char *value) {
  const size_t length = strlen(value);
  if (length == 0 || length > 32 || value[0] < 'a' || value[0] > 'z') return 0;
  for (size_t index = 1; index < length; ++index) {
    if (!((value[index] >= 'a' && value[index] <= 'z') ||
          (value[index] >= '0' && value[index] <= '9') || value[index] == '-')) {
      return 0;
    }
  }
  return 1;
}

static int valid_module_name(const char *value) {
  const size_t length = strlen(value);
  if (length == 0 || length > 64 || value[0] < 'a' || value[0] > 'z') return 0;
  for (size_t index = 1; index < length; ++index) {
    if (!((value[index] >= 'a' && value[index] <= 'z') ||
          (value[index] >= '0' && value[index] <= '9') || value[index] == '-')) {
      return 0;
    }
  }
  return 1;
}

static int valid_object_name(const char *value) {
  if (strcmp(value, "[") == 0) return 1;
  const size_t length = strlen(value);
  if (length == 0 || length > 128 ||
      !((value[0] >= 'a' && value[0] <= 'z') ||
        (value[0] >= 'A' && value[0] <= 'Z'))) return 0;
  for (size_t index = 1; index < length; ++index) {
    const unsigned char character = (unsigned char)value[index];
    if (!(isalnum(character) || character == '.' || character == '_' ||
          character == '+' || character == '-')) return 0;
  }
  return 1;
}

static int valid_environment_name(const char *value) {
  const size_t length = strlen(value);
  if (length == 0 || length > 128 ||
      !((value[0] >= 'A' && value[0] <= 'Z') ||
        (value[0] >= 'a' && value[0] <= 'z') || value[0] == '_')) return 0;
  for (size_t index = 1; index < length; ++index) {
    const unsigned char character = (unsigned char)value[index];
    if (!(isalnum(character) || character == '_')) return 0;
  }
  return 1;
}

static int valid_object_type(const char *value) {
  static const char *const types[] = {
      "TOOL", "LIB", "ENV", "FILE", "FOLDER", "HEADER",
  };
  for (size_t index = 0; index < sizeof(types) / sizeof(types[0]); ++index) {
    if (strcmp(value, types[index]) == 0) return 1;
  }
  return 0;
}

static int valid_module_locator(const char *value) {
  static const char prefix[] = "/modules/";
  const size_t length = strlen(value);
  const size_t prefix_length = sizeof(prefix) - 1;
  const size_t name_length = length > prefix_length + 3
                                 ? length - prefix_length - 3
                                 : 0;
  if (name_length == 0 || name_length > 64 ||
      strncmp(value, prefix, prefix_length) != 0 ||
      strcmp(value + length - 3, ".dm") != 0 || strstr(value, "..") != NULL ||
      strchr(value + prefix_length, '/') != NULL) return 0;
  if (value[prefix_length] < 'a' || value[prefix_length] > 'z') return 0;
  for (size_t index = prefix_length + 1; index < length - 3; ++index) {
    if (!((value[index] >= 'a' && value[index] <= 'z') ||
          (value[index] >= '0' && value[index] <= '9') ||
          value[index] == '-')) return 0;
  }
  return 1;
}

static int module_name_matches_locator(const char *locator, const char *name) {
  static const char prefix[] = "/modules/";
  const size_t prefix_length = sizeof(prefix) - 1;
  const size_t name_length = strlen(name);
  return strncmp(locator, prefix, prefix_length) == 0 &&
         strncmp(locator + prefix_length, name, name_length) == 0 &&
         strcmp(locator + prefix_length + name_length, ".dm") == 0;
}

static int valid_sha256(const char *value) {
  if (strlen(value) != 64) return 0;
  for (size_t index = 0; index < 64; ++index) {
    if (!((value[index] >= '0' && value[index] <= '9') ||
          (value[index] >= 'a' && value[index] <= 'f'))) return 0;
  }
  return 1;
}

static int valid_absolute_path(const char *path) {
  if (path == NULL || path[0] != '/' || path[1] == '\0' || strlen(path) > 4096 ||
      strstr(path, "//") != NULL || strchr(path, '\\') != NULL) return 0;
  for (const char *cursor = path; *cursor != '\0'; ++cursor) {
    if (cursor[0] == '/' && cursor[1] == '.' &&
        (cursor[2] == '/' || cursor[2] == '\0' ||
         (cursor[2] == '.' && (cursor[3] == '/' || cursor[3] == '\0')))) return 0;
  }
  return 1;
}

static int forbidden_keep(const char *path) {
  static const char *const prefixes[] = {
      "/tmp", "/workspace", "/home/dolly/.pi/agent/auth.json",
      "/home/dolly/.pi/agent/sessions",
  };
  for (size_t index = 0; index < sizeof(prefixes) / sizeof(prefixes[0]); ++index) {
    const size_t length = strlen(prefixes[index]);
    if (strncmp(path, prefixes[index], length) == 0 &&
        (path[length] == '\0' || path[length] == '/')) return 1;
  }
  return 0;
}

static int mkdir_parents(const char *path, int include_last) {
  char *copy = strdup(path);
  if (copy == NULL) return -ENOMEM;
  char *end = strrchr(copy, '/');
  if (!include_last && end != NULL) *end = '\0';
  for (char *cursor = copy + 1;; ++cursor) {
    if (*cursor != '/' && *cursor != '\0') continue;
    const char saved = *cursor;
    *cursor = '\0';
    if (copy[0] != '\0') {
      struct stat metadata;
      if (stat(copy, &metadata) == 0) {
        if (!S_ISDIR(metadata.st_mode)) {
          free(copy);
          return -ENOTDIR;
        }
      } else {
        (void)mkdir(copy, 0755);
        if (stat(copy, &metadata) != 0 || !S_ISDIR(metadata.st_mode)) {
          const int error = errno == 0 ? -EIO : -errno;
          free(copy);
          return error;
        }
      }
    }
    *cursor = saved;
    if (saved == '\0') break;
  }
  free(copy);
  return 0;
}

static char *join_host_url(const Engine *engine, const char *path) {
  if (path == NULL || path[0] != '/' || strstr(path, "..") != NULL ||
      strchr(path, '?') != NULL || strchr(path, '#') != NULL ||
      strchr(path, '\\') != NULL || strstr(path, "//") != NULL) return NULL;
  const size_t base_length = strlen(engine->host_base);
  const int has_slash = base_length != 0 && engine->host_base[base_length - 1] == '/';
  const size_t length = base_length + strlen(path) + 1;
  char *url = malloc(length);
  if (url == NULL) return NULL;
  snprintf(url, length, "%s%s", engine->host_base, path + (has_slash ? 1 : 0));
  return url;
}

static int fetch_memory(const char *url, Buffer *buffer) {
  dolly_http_response response = {0};
  dolly_http_request request = {
      .method = "GET",
      .url = url,
      .headers = "",
      .flags = DOLLY_HTTP_FAIL_STATUS,
      .write = append_buffer,
      .write_context = buffer,
  };
  const int status = dolly_http_perform(&request, &response);
  const unsigned response_status = response.status;
  if (status != 0) {
    fprintf(stderr, "dollyfile: GET %s failed: %d\n", url, status);
  } else if (response.status < 200 || response.status >= 300) {
    fprintf(stderr, "dollyfile: GET %s returned HTTP %u\n", url, response.status);
  }
  dolly_http_response_dispose(&response);
  return status == 0 && response_status >= 200 && response_status < 300
      ? 0 : status != 0 ? status : -EIO;
}

static int read_file_buffer(const char *path, Buffer *buffer) {
  int descriptor = open(path, O_RDONLY);
  if (descriptor < 0) return -errno;
  unsigned char bytes[4096];
  int result = 0;
  for (;;) {
    const ssize_t count = read(descriptor, bytes, sizeof(bytes));
    if (count < 0) {
      result = -errno;
      break;
    }
    if (count == 0) break;
    if (append_buffer(bytes, (size_t)count, buffer) != (size_t)count) {
      result = -EFBIG;
      break;
    }
  }
  if (close(descriptor) != 0 && result == 0) result = -errno;
  return result;
}

static int sha256_file(const char *path, char output[65]) {
  int descriptor = open(path, O_RDONLY);
  if (descriptor < 0) return -errno;
  Sha256 sha;
  sha256_init(&sha);
  unsigned char bytes[64 * 1024];
  int result = 0;
  for (;;) {
    const ssize_t count = read(descriptor, bytes, sizeof(bytes));
    if (count < 0) {
      result = -errno;
      break;
    }
    if (count == 0) break;
    sha256_update(&sha, bytes, (size_t)count);
  }
  if (close(descriptor) != 0 && result == 0) result = -errno;
  if (result == 0) {
    unsigned char digest[32];
    sha256_finish(&sha, digest);
    digest_hex(digest, output);
  }
  return result;
}

static int fetch_recipe(Engine *engine, const char *locator, Buffer *buffer,
                        char digest[65]) {
  int status;
  if (strncmp(locator, "FILE:", 5) == 0) {
    status = valid_absolute_path(locator + 5) ? read_file_buffer(locator + 5, buffer) : -EINVAL;
  } else {
    char *url = join_host_url(engine, locator);
    if (url == NULL) return -EINVAL;
    status = fetch_memory(url, buffer);
    free(url);
  }
  if (status != 0) return status;
  if (buffer->length == 0 || buffer->length > MAX_RECIPE_BYTES) return -EFBIG;
  sha256_bytes(buffer->data, buffer->length, digest);
  return 0;
}

static int fetch_source(Engine *engine, const char *kind, const char *location,
                        const char *destination, const char *expected) {
  char *url = NULL;
  if (strcmp(kind, "HOST") == 0) {
    url = join_host_url(engine, location);
  } else if (strcmp(kind, "URL") == 0 &&
             (strncmp(location, "https://", 8) == 0 ||
              strncmp(location, "http://", 7) == 0) &&
             strchr(location, '#') == NULL) {
    url = strdup(location);
  }
  if (url == NULL || !valid_absolute_path(destination) || !valid_sha256(expected)) {
    free(url);
    return -EINVAL;
  }
  int status = mkdir_parents(destination, 0);
  if (status != 0) {
    free(url);
    return status;
  }
  const size_t temporary_length = strlen(destination) + 13;
  char *temporary = malloc(temporary_length);
  if (temporary == NULL) {
    free(url);
    return -ENOMEM;
  }
  snprintf(temporary, temporary_length, "%s.dolly-part", destination);
  unlink(temporary);
  Download download = {.descriptor = open(temporary, O_WRONLY | O_CREAT | O_EXCL, 0666)};
  if (download.descriptor < 0) {
    status = -errno;
    goto done;
  }
  sha256_init(&download.sha);
  dolly_http_response response = {0};
  dolly_http_request request = {
      .method = "GET",
      .url = url,
      .headers = "",
      .flags = DOLLY_HTTP_FAIL_STATUS,
      .write = write_download,
      .write_context = &download,
  };
  printf("dollyfile: SOURCE %s %s -> %s\n", kind, location, destination);
  fflush(stdout);
  status = dolly_http_perform(&request, &response);
  if (close(download.descriptor) != 0 && status == 0) status = -errno;
  download.descriptor = -1;
  if (status == 0 && (response.status < 200 || response.status >= 300)) status = -EIO;
  if (status != 0) {
    fprintf(stderr, "dollyfile: GET %s failed: %d (HTTP %u, %zu bytes)\n",
            url, status, response.status, download.length);
  }
  dolly_http_response_dispose(&response);
  if (status == 0) {
    unsigned char digest[32];
    char actual[65];
    sha256_finish(&download.sha, digest);
    digest_hex(digest, actual);
    if (strcmp(actual, expected) != 0) {
      fprintf(stderr, "dollyfile: SHA256 mismatch for %s\nexpected %s\nactual   %s\n",
              location, expected, actual);
      status = -EBADMSG;
    }
  }
  if (status == 0) {
    status = publish_download(temporary, destination);
    if (status != 0) {
      fprintf(stderr, "dollyfile: could not publish %s: %s (%d)\n",
              destination, strerror(-status), status);
    }
  }
done:
  if (download.descriptor >= 0) close(download.descriptor);
  if (status != 0) unlink(temporary);
  free(temporary);
  free(url);
  return status;
}

static char *trim(char *value) {
  while (isspace((unsigned char)*value)) ++value;
  char *end = value + strlen(value);
  while (end != value && isspace((unsigned char)end[-1])) --end;
  *end = '\0';
  return value;
}

static void strip_comment(char *line) {
  int quote = 0;
  int escaped = 0;
  for (size_t index = 0; line[index] != '\0'; ++index) {
    const unsigned char character = (unsigned char)line[index];
    if (escaped) {
      escaped = 0;
    } else if (character == '\\' && quote != '\'') {
      escaped = 1;
    } else if (quote != 0) {
      if (character == quote) quote = 0;
    } else if (character == '\'' || character == '"') {
      quote = character;
    } else if (character == '#' && (index == 0 || isspace((unsigned char)line[index - 1]))) {
      line[index] = '\0';
      return;
    }
  }
}

static int split_words(char *value, char ***words_out, size_t *count_out) {
  size_t capacity = 8;
  size_t count = 0;
  char **words = calloc(capacity, sizeof(*words));
  if (words == NULL) return -ENOMEM;
  char *read_cursor = value;
  char *write_cursor = value;
  while (*read_cursor != '\0') {
    while (isspace((unsigned char)*read_cursor)) ++read_cursor;
    if (*read_cursor == '\0') break;
    if (count == capacity) {
      capacity *= 2;
      char **replacement = realloc(words, capacity * sizeof(*words));
      if (replacement == NULL) {
        free(words);
        return -ENOMEM;
      }
      words = replacement;
    }
    words[count++] = write_cursor;
    int quote = 0;
    int escaped = 0;
    while (*read_cursor != '\0') {
      const unsigned char character = (unsigned char)*read_cursor++;
      if (escaped) {
        *write_cursor++ = (char)character;
        escaped = 0;
      } else if (character == '\\' && quote != '\'') {
        escaped = 1;
      } else if (quote != 0) {
        if (character == quote) quote = 0;
        else *write_cursor++ = (char)character;
      } else if (character == '\'' || character == '"') {
        quote = character;
      } else if (isspace(character)) {
        break;
      } else {
        *write_cursor++ = (char)character;
      }
    }
    if (escaped || quote != 0) {
      free(words);
      return -EINVAL;
    }
    *write_cursor++ = '\0';
  }
  *words_out = words;
  *count_out = count;
  return 0;
}

static int append_string(char ***items, size_t *count, size_t *capacity,
                         const char *value) {
  for (size_t index = 0; index < *count; ++index) {
    if (strcmp((*items)[index], value) == 0) return 0;
  }
  if (*count == *capacity) {
    const size_t next = *capacity == 0 ? 16 : *capacity * 2;
    char **replacement = realloc(*items, next * sizeof(**items));
    if (replacement == NULL) return -ENOMEM;
    *items = replacement;
    *capacity = next;
  }
  (*items)[*count] = strdup(value);
  if ((*items)[*count] == NULL) return -ENOMEM;
  ++*count;
  return 0;
}

static const Object *scope_find(const Scope *scope, const char *type,
                                const char *name) {
  for (size_t index = 0; index < scope->count; ++index) {
    if (strcmp(scope->items[index].type, type) == 0 &&
        strcmp(scope->items[index].name, name) == 0) return &scope->items[index];
  }
  return NULL;
}

static int scope_add(Scope *scope, const char *type, const char *name,
                     const char *detail, const char *sha256) {
  if (scope_find(scope, type, name) != NULL) return -EEXIST;
  if (scope->count == scope->capacity) {
    const size_t next = scope->capacity == 0 ? 16 : scope->capacity * 2;
    Object *replacement = realloc(scope->items, next * sizeof(*replacement));
    if (replacement == NULL) return -ENOMEM;
    scope->items = replacement;
    scope->capacity = next;
  }
  Object *object = &scope->items[scope->count];
  memset(object, 0, sizeof(*object));
  object->type = strdup(type);
  object->name = strdup(name);
  object->detail = detail == NULL ? NULL : strdup(detail);
  object->sha256 = sha256 == NULL ? NULL : strdup(sha256);
  if (object->type == NULL || object->name == NULL ||
      (detail != NULL && object->detail == NULL) ||
      (sha256 != NULL && object->sha256 == NULL)) return -ENOMEM;
  ++scope->count;
  return 0;
}

static int scope_add_object(Scope *scope, const Object *source) {
  int result = scope_add(scope, source->type, source->name,
                         source->detail, source->sha256);
  if (result != 0) return result;
  Object *destination = &scope->items[scope->count - 1];
  destination->members = source->members;
  if (destination->members != NULL) ++destination->members->references;
  return 0;
}

static int scope_copy(Scope *destination, const Scope *source) {
  for (size_t index = 0; index < source->count; ++index) {
    const int result = scope_add_object(destination, &source->items[index]);
    if (result != 0) return result;
  }
  return 0;
}

static void dispose_scope(Scope *scope) {
  for (size_t index = 0; index < scope->count; ++index) {
    free(scope->items[index].type);
    free(scope->items[index].name);
    free(scope->items[index].detail);
    free(scope->items[index].sha256);
    ObjectMembers *members = scope->items[index].members;
    if (members != NULL && --members->references == 0) {
      for (size_t member = 0; member < members->count; ++member) {
        free(members->items[member]);
      }
      free(members->items);
      free(members);
    }
  }
  free(scope->items);
  memset(scope, 0, sizeof(*scope));
}

static int permit_tool(Scope *scope, const char *name) {
  const int result = scope_add(scope, "TOOL", name, NULL, NULL);
  return result == -EEXIST ? 0 : result;
}

static int contains_string(char *const *items, size_t count, const char *value) {
  for (size_t index = 0; index < count; ++index) {
    if (strcmp(items[index], value) == 0) return 1;
  }
  return 0;
}

static int resolve_tool(const char *name, char **path_out) {
  static const char *const directories[] = {"/bin", "/usr/bin"};
  for (size_t index = 0; index < sizeof(directories) / sizeof(directories[0]); ++index) {
    const size_t length = strlen(directories[index]) + strlen(name) + 2;
    char *path = malloc(length);
    if (path == NULL) return -ENOMEM;
    snprintf(path, length, "%s/%s", directories[index], name);
    struct stat metadata;
    if (stat(path, &metadata) == 0 && S_ISREG(metadata.st_mode)) {
      *path_out = path;
      return 0;
    }
    free(path);
  }
  return -ENOENT;
}

static int compare_strings(const void *left, const void *right);

static int collect_paths(char ***paths, size_t *count, size_t *capacity,
                         const char *path) {
  if (forbidden_keep(path)) return -EPERM;
  struct stat metadata;
  if (lstat(path, &metadata) != 0) return -errno;
  if (S_ISREG(metadata.st_mode)) {
    if (*count >= MAX_MANIFEST_FILES) return -E2BIG;
    return append_string(paths, count, capacity, path);
  }
  if (!S_ISDIR(metadata.st_mode)) return -EINVAL;
  DIR *directory = opendir(path);
  if (directory == NULL) return -errno;
  struct dirent *entry;
  int result = 0;
  while (result == 0 && (entry = readdir(directory)) != NULL) {
    if (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0) continue;
    const size_t length = strlen(path) + strlen(entry->d_name) + 2;
    char *child = malloc(length);
    if (child == NULL) {
      result = -ENOMEM;
      break;
    }
    snprintf(child, length, "%s/%s", path, entry->d_name);
    result = collect_paths(paths, count, capacity, child);
    free(child);
  }
  if (closedir(directory) != 0 && result == 0) result = -errno;
  return result;
}

static int collect_tree(Engine *engine, const char *path) {
  return collect_paths(&engine->keep, &engine->keep_count,
                       &engine->keep_capacity, path);
}

static int apply_environment(const char *name, const char *detail) {
  static const char append_prefix[] = "APPEND ";
  if (strncmp(detail, append_prefix, sizeof(append_prefix) - 1) != 0) {
    return setenv(name, detail, 1) == 0 ? 0 : -errno;
  }
  const char *value = detail + sizeof(append_prefix) - 1;
  const char *current = getenv(name);
  if (current == NULL || *current == '\0') return setenv(name, value, 1) == 0 ? 0 : -errno;
  const size_t length = strlen(current) + strlen(value) + 2;
  char *combined = malloc(length);
  if (combined == NULL) return -ENOMEM;
  snprintf(combined, length, "%s:%s", current, value);
  const int result = setenv(name, combined, 1) == 0 ? 0 : -errno;
  free(combined);
  return result;
}

static int resolve_export_path(const char *type, const char *name,
                               const char *detail, const char *expected,
                               char **path_out) {
  char *path = NULL;
  int result = 0;
  if (strcmp(type, "TOOL") == 0) {
    result = resolve_tool(name, &path);
    if (result == 0 && expected != NULL) {
      char actual[65];
      result = sha256_file(path, actual);
      if (result == 0 && strcmp(actual, expected) != 0) {
        fprintf(stderr,
                "dollyfile: exported TOOL %s has SHA256 %s, expected %s\n",
                name, actual, expected);
        result = -EBADMSG;
      }
    }
  } else {
    path = strdup(detail);
    if (path == NULL) result = -ENOMEM;
  }
  if (result == 0) {
    struct stat metadata;
    if (stat(path, &metadata) != 0) result = -errno;
    else if (!S_ISREG(metadata.st_mode) && !S_ISDIR(metadata.st_mode)) result = -EINVAL;
  }
  if (result == 0) *path_out = path;
  else free(path);
  return result;
}

static int validate_export(const char *type, const char *name,
                           const char *detail, const char *expected) {
  if (strcmp(type, "ENV") == 0) return apply_environment(name, detail);
  char *path = NULL;
  const int result = resolve_export_path(type, name, detail, expected, &path);
  free(path);
  return result;
}

static int capture_export_members(Object *object) {
  if (strcmp(object->type, "ENV") == 0) return 0;
  object->members = calloc(1, sizeof(*object->members));
  if (object->members == NULL) return -ENOMEM;
  object->members->references = 1;
  char *path = NULL;
  int result = resolve_export_path(object->type, object->name, object->detail,
                                   object->sha256, &path);
  if (result == 0) {
    result = collect_paths(&object->members->items, &object->members->count,
                           &object->members->capacity, path);
  }
  free(path);
  return result;
}

static int retain_export(Engine *engine, const Object *object) {
  if (strcmp(object->type, "ENV") == 0) return 0;
  char *path = NULL;
  int result = resolve_export_path(object->type, object->name, object->detail,
                                   object->sha256, &path);
  free(path);
  if (result != 0) return result;
  result = 0;
  if (object->members == NULL) return -EINVAL;
  for (size_t index = 0;
       result == 0 && index < object->members->count; ++index) {
    result = append_string(&engine->keep, &engine->keep_count,
                           &engine->keep_capacity, object->members->items[index]);
  }
  return result;
}

static void module_cache_key(const Engine *engine, const Scope *available,
                             const char *locator, const char digest[65],
                             char output[65]) {
  static const char prefix[] = "DOLLY-MODULE-CACHE 1\n";
  Sha256 sha;
  unsigned char bytes[32];
  sha256_init(&sha);
  sha256_update(&sha, prefix, sizeof(prefix) - 1);
  for (size_t index = 0; index < engine->recipe_count; ++index) {
    const RecipeRecord *record = &engine->recipes[index];
    sha256_update(&sha, record->locator, strlen(record->locator));
    sha256_update(&sha, " ", 1);
    sha256_update(&sha, record->digest, 64);
    sha256_update(&sha, "\n", 1);
  }
  sha256_update(&sha, locator, strlen(locator));
  sha256_update(&sha, " ", 1);
  sha256_update(&sha, digest, 64);
  sha256_update(&sha, "\n", 1);
  static const char scope_prefix[] = "DOLLY-MODULE-SCOPE 1\0";
  sha256_update(&sha, scope_prefix, sizeof(scope_prefix) - 1);
  for (size_t index = 0; index < available->count; ++index) {
    const Object *object = &available->items[index];
    sha256_update(&sha, object->type, strlen(object->type));
    sha256_update(&sha, "\0", 1);
    sha256_update(&sha, object->name, strlen(object->name));
    sha256_update(&sha, "\0", 1);
    if (object->detail != NULL) {
      sha256_update(&sha, object->detail, strlen(object->detail));
    }
    sha256_update(&sha, "\0", 1);
    if (object->sha256 != NULL) sha256_update(&sha, object->sha256, 64);
    sha256_update(&sha, "\0", 1);
  }
  sha256_finish(&sha, bytes);
  digest_hex(bytes, output);
}

static char *module_cache_path(const char *directory, const char key[65]) {
  const size_t length = strlen(directory) + 72;
  char *path = malloc(length);
  if (path != NULL) snprintf(path, length, "%s/%s.layer", directory, key);
  return path;
}

static size_t append_u32(Buffer *buffer, uint32_t value) {
  unsigned char bytes[4] = {
      (unsigned char)value,
      (unsigned char)(value >> 8),
      (unsigned char)(value >> 16),
      (unsigned char)(value >> 24),
  };
  return append_buffer(bytes, sizeof(bytes), buffer);
}

static size_t append_u64(Buffer *buffer, uint64_t value) {
  unsigned char bytes[8];
  for (unsigned index = 0; index < 8; ++index) {
    bytes[index] = (unsigned char)(value >> (index * 8));
  }
  return append_buffer(bytes, sizeof(bytes), buffer);
}

static int collect_layer_paths(char ***paths, size_t *count, size_t *capacity,
                               const char *path) {
  struct stat metadata;
  if (lstat(path, &metadata) != 0) return -errno;
  if (S_ISREG(metadata.st_mode)) {
    return append_string(paths, count, capacity, path);
  }
  if (!S_ISDIR(metadata.st_mode)) return -EINVAL;
  DIR *directory = opendir(path);
  if (directory == NULL) return -errno;
  struct dirent *entry;
  int result = 0;
  while (result == 0 && (entry = readdir(directory)) != NULL) {
    if (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0) continue;
    const size_t length = strlen(path) + strlen(entry->d_name) + 2;
    char *child = malloc(length);
    if (child == NULL) {
      result = -ENOMEM;
      break;
    }
    snprintf(child, length, "%s/%s", path, entry->d_name);
    result = collect_layer_paths(paths, count, capacity, child);
    free(child);
  }
  if (closedir(directory) != 0 && result == 0) result = -errno;
  return result;
}

static int append_layer_file(Buffer *layer, const char *path) {
  struct stat metadata;
  if (stat(path, &metadata) != 0) return -errno;
  if (!S_ISREG(metadata.st_mode) || metadata.st_size < 0 ||
      (uint64_t)metadata.st_size > MAX_SOURCE_BYTES || strlen(path) > UINT32_MAX) {
    return -EINVAL;
  }
  if (append_u32(layer, (uint32_t)strlen(path)) != 4 ||
      append_u64(layer, (uint64_t)metadata.st_size) != 8 ||
      append_buffer(path, strlen(path), layer) != strlen(path)) return -EFBIG;
  int descriptor = open(path, O_RDONLY);
  if (descriptor < 0) return -errno;
  unsigned char bytes[64 * 1024];
  int result = 0;
  for (;;) {
    const ssize_t size = read(descriptor, bytes, sizeof(bytes));
    if (size < 0) {
      result = -errno;
      break;
    }
    if (size == 0) break;
    if (append_buffer(bytes, (size_t)size, layer) != (size_t)size) {
      result = -EFBIG;
      break;
    }
  }
  if (close(descriptor) != 0 && result == 0) result = -errno;
  return result;
}

static int write_module_layer(Engine *engine, const Scope *exports,
                              size_t keep_start,
                              const char key[65]) {
  char **paths = NULL;
  size_t count = 0;
  size_t capacity = 0;
  int result = 0;
  for (size_t index = keep_start; result == 0 && index < engine->keep_count; ++index) {
    result = collect_layer_paths(&paths, &count, &capacity, engine->keep[index]);
  }
  for (size_t index = 0; result == 0 && index < exports->count; ++index) {
    const Object *object = &exports->items[index];
    if (strcmp(object->type, "ENV") == 0) continue;
    if (object->members == NULL) {
      result = -EINVAL;
      break;
    }
    for (size_t member = 0;
         result == 0 && member < object->members->count; ++member) {
      result = collect_layer_paths(&paths, &count, &capacity,
                                   object->members->items[member]);
    }
  }
  if (result == 0 && count > MAX_MANIFEST_FILES) result = -E2BIG;
  if (result == 0) {
    qsort(paths, count, sizeof(*paths), compare_strings);
    size_t unique = 0;
    for (size_t index = 0; index < count; ++index) {
      if (unique != 0 && strcmp(paths[unique - 1], paths[index]) == 0) {
        free(paths[index]);
      } else {
        paths[unique++] = paths[index];
      }
    }
    count = unique;
  }
  Buffer layer = {.limit = MAX_SOURCE_BYTES};
  static const unsigned char magic[8] = {'D', 'O', 'L', 'L', 'Y', 'L', 'Y', 'R'};
  if (result == 0 &&
      (append_buffer(magic, sizeof(magic), &layer) != sizeof(magic) ||
       append_u32(&layer, 1) != 4 || append_u32(&layer, (uint32_t)count) != 4)) {
    result = -EFBIG;
  }
  for (size_t index = 0; result == 0 && index < count; ++index) {
    result = append_layer_file(&layer, paths[index]);
  }
  char *output = NULL;
  if (result == 0) {
    output = module_cache_path("/etc/dolly/module-cache-output", key);
    if (output == NULL) result = -ENOMEM;
  }
  if (result == 0) result = mkdir_parents(output, 0);
  if (result == 0) result = dolly_write_file(output, layer.data, layer.length);
  if (result == 0) {
    printf("dollyfile: saved module layer %s (%zu files, %zu bytes)\n",
           key, count, layer.length);
  }
  free(output);
  free(layer.data);
  for (size_t index = 0; index < count; ++index) free(paths[index]);
  free(paths);
  return result;
}

static int take_layer_bytes(const unsigned char **cursor, const unsigned char *end,
                            size_t count, const unsigned char **output) {
  if (count > (size_t)(end - *cursor)) return -EINVAL;
  *output = *cursor;
  *cursor += count;
  return 0;
}

static int take_layer_u32(const unsigned char **cursor, const unsigned char *end,
                          uint32_t *output) {
  const unsigned char *bytes;
  if (take_layer_bytes(cursor, end, 4, &bytes) != 0) return -EINVAL;
  *output = (uint32_t)bytes[0] | (uint32_t)bytes[1] << 8 |
            (uint32_t)bytes[2] << 16 | (uint32_t)bytes[3] << 24;
  return 0;
}

static int take_layer_u64(const unsigned char **cursor, const unsigned char *end,
                          uint64_t *output) {
  const unsigned char *bytes;
  if (take_layer_bytes(cursor, end, 8, &bytes) != 0) return -EINVAL;
  uint64_t value = 0;
  for (unsigned index = 0; index < 8; ++index) value |= (uint64_t)bytes[index] << (index * 8);
  *output = value;
  return 0;
}

static int restore_module_layer(const char key[65]) {
  char *path = module_cache_path("/etc/dolly/module-cache-input", key);
  if (path == NULL) return -ENOMEM;
  Buffer layer = {.limit = MAX_SOURCE_BYTES};
  int result = read_file_buffer(path, &layer);
  free(path);
  if (result != 0) {
    free(layer.data);
    return result;
  }
  static const unsigned char magic[8] = {'D', 'O', 'L', 'L', 'Y', 'L', 'Y', 'R'};
  const unsigned char *cursor = layer.data;
  const unsigned char *end = layer.data + layer.length;
  const unsigned char *actual_magic;
  uint32_t version = 0;
  uint32_t count = 0;
  if (take_layer_bytes(&cursor, end, 8, &actual_magic) != 0 ||
      memcmp(actual_magic, magic, 8) != 0 ||
      take_layer_u32(&cursor, end, &version) != 0 || version != 1 ||
      take_layer_u32(&cursor, end, &count) != 0 || count > MAX_MANIFEST_FILES) {
    result = -EINVAL;
  }
  typedef struct {
    char *path;
    const unsigned char *data;
    size_t length;
  } LayerEntry;
  LayerEntry *entries = result == 0 && count != 0
                            ? calloc(count, sizeof(*entries))
                            : NULL;
  if (result == 0 && count != 0 && entries == NULL) result = -ENOMEM;
  const char *previous = NULL;
  for (uint32_t index = 0; result == 0 && index < count; ++index) {
    uint32_t path_length = 0;
    uint64_t data_length = 0;
    const unsigned char *path_bytes;
    const unsigned char *data;
    if (take_layer_u32(&cursor, end, &path_length) != 0 || path_length == 0 ||
        path_length > 4096 || take_layer_u64(&cursor, end, &data_length) != 0 ||
        data_length > MAX_SOURCE_BYTES ||
        take_layer_bytes(&cursor, end, path_length, &path_bytes) != 0 ||
        take_layer_bytes(&cursor, end, (size_t)data_length, &data) != 0) {
      result = -EINVAL;
      break;
    }
    entries[index].path = malloc((size_t)path_length + 1);
    if (entries[index].path == NULL) {
      result = -ENOMEM;
      break;
    }
    memcpy(entries[index].path, path_bytes, path_length);
    entries[index].path[path_length] = '\0';
    entries[index].data = data;
    entries[index].length = (size_t)data_length;
    if (strlen(entries[index].path) != path_length ||
        !valid_absolute_path(entries[index].path) ||
        forbidden_keep(entries[index].path) ||
        (previous != NULL && strcmp(previous, entries[index].path) >= 0)) {
      result = -EINVAL;
    }
    previous = entries[index].path;
  }
  if (result == 0 && cursor != end) result = -EINVAL;
  for (uint32_t index = 0; result == 0 && index < count; ++index) {
    result = mkdir_parents(entries[index].path, 0);
    if (result == 0) {
      result = dolly_write_file(entries[index].path,
                                entries[index].data, entries[index].length);
    }
  }
  if (result == 0) printf("dollyfile: restored module layer %s\n", key);
  for (uint32_t index = 0; index < count; ++index) free(entries[index].path);
  free(entries);
  free(layer.data);
  return result;
}

static int run_slop(const char *cwd, const char *command) {
  if (chdir(cwd) != 0) return -errno;
  printf("+ SLOP CWD %s %s\n", cwd, command);
  fflush(stdout);
  char *arguments[] = {"slop", "-e", "-c", (char *)command, NULL};
  const int pid = dolly_spawn("/bin/slop", 4, arguments,
                              STDIN_FILENO, STDOUT_FILENO, STDERR_FILENO);
  int status = pid;
  if (pid >= 0) {
    status = 126;
    const int waited = dolly_wait(pid, &status);
    if (waited != 0) status = waited;
  }
  if (chdir("/") != 0 && status == 0) status = -errno;
  return status;
}

static int execute_slop(char *arguments, const Scope *permitted_tools,
                        int execute) {
  char *cwd = "/";
  char *command = trim(arguments);
  if (strncmp(command, "CWD", 3) == 0 &&
      isspace((unsigned char)command[3])) {
    char *path = trim(command + 3);
    char *end = path;
    while (*end != '\0' && !isspace((unsigned char)*end)) ++end;
    if (*end == '\0') return 2;
    *end++ = '\0';
    if (strcmp(path, "/") != 0 && !valid_absolute_path(path)) return 2;
    cwd = path;
    command = trim(end);
  }
  if (*command == '\0') return 2;
  char *end = command;
  while (*end != '\0' && !isspace((unsigned char)*end)) ++end;
  const char saved = *end;
  *end = '\0';
  const char *tool = strrchr(command, '/');
  tool = tool == NULL ? command : tool + 1;
  const int permitted = scope_find(permitted_tools, "TOOL", tool) != NULL;
  if (!permitted) {
    fprintf(stderr,
            "dollyfile: SLOP tool %s was not declared by an earlier "
            "REQUIRES TOOL or EXPORTS TOOL\n",
            tool);
  }
  *end = saved;
  if (!permitted) return 2;
  if (!execute) return 0;
  const int status = run_slop(cwd, command);
  return status == 0 ? 0 : 1;
}

static int write_inline_file(const char *path, const unsigned char *body,
                             size_t body_length) {
  const int parent_status = mkdir_parents(path, 0);
  if (parent_status != 0) return parent_status;
  return dolly_write_file(path, body, body_length);
}

static int verify_temporary_directory_empty(const char *locator) {
  DIR *directory = opendir("/tmp");
  if (directory == NULL) return errno == ENOENT ? 0 : -errno;
  struct dirent *entry;
  int result = 0;
  while ((entry = readdir(directory)) != NULL) {
    if (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0) continue;
    fprintf(stderr,
            "dollyfile: module %s left temporary path /tmp/%s; "
            "each module must remove its own build scratch\n",
            locator, entry->d_name);
    result = 2;
    break;
  }
  if (closedir(directory) != 0 && result == 0) result = -errno;
  return result;
}

static int remove_path_recursive(const char *path) {
  struct stat metadata;
  if (lstat(path, &metadata) != 0) return errno == ENOENT ? 0 : -errno;
  if (!S_ISDIR(metadata.st_mode)) return unlink(path) == 0 ? 0 : -errno;
  DIR *directory = opendir(path);
  if (directory == NULL) return -errno;
  struct dirent *entry;
  int result = 0;
  while (result == 0 && (entry = readdir(directory)) != NULL) {
    if (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0) continue;
    const size_t length = strlen(path) + strlen(entry->d_name) + 2;
    char *child = malloc(length);
    if (child == NULL) {
      result = -ENOMEM;
      break;
    }
    snprintf(child, length, "%s/%s", path, entry->d_name);
    result = remove_path_recursive(child);
    free(child);
  }
  if (closedir(directory) != 0 && result == 0) result = -errno;
  if (result == 0 && rmdir(path) != 0) result = -errno;
  return result;
}

static int clean_temporary_directory(const char *locator) {
  DIR *directory = opendir("/tmp");
  if (directory == NULL) return errno == ENOENT ? 0 : -errno;
  struct dirent *entry;
  int result = 0;
  while (result == 0 && (entry = readdir(directory)) != NULL) {
    if (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0) continue;
    const size_t length = strlen(entry->d_name) + 6;
    char *path = malloc(length);
    if (path == NULL) {
      result = -ENOMEM;
      break;
    }
    snprintf(path, length, "/tmp/%s", entry->d_name);
    result = remove_path_recursive(path);
    free(path);
  }
  if (closedir(directory) != 0 && result == 0) result = -errno;
  if (result == 0) {
    fprintf(stderr, "dollyfile: cleaned failed module scratch after %s\n", locator);
  }
  return result;
}

static int set_entry(Engine *engine, char **words, size_t count) {
  for (size_t index = 0; index < engine->entry_count; ++index) free(engine->entry[index]);
  free(engine->entry);
  engine->entry = calloc(count, sizeof(*engine->entry));
  engine->entry_count = 0;
  if (engine->entry == NULL) return -ENOMEM;
  for (size_t index = 0; index < count; ++index) {
    engine->entry[index] = strdup(words[index]);
    if (engine->entry[index] == NULL) return -ENOMEM;
    ++engine->entry_count;
  }
  return 0;
}

static int execute_recipe(Engine *engine, const char *locator,
                          const char *expected_sha256, size_t depth,
                          const Scope *available, int root, int execute,
                          Scope *exports_out);

static int process_line(Engine *engine, const char *locator, size_t depth,
                        size_t line_number, char *line,
                        const unsigned char *body, size_t body_length,
                        const Scope *available, Scope *imports, Scope *children,
                        Scope *permitted_tools, Scope *exports,
                        char **kind, char **name,
                        int *header_seen, size_t *uses, size_t *slops,
                        int *module_form, int execute,
                        int filesystem_available) {
  strip_comment(line);
  char *text = trim(line);
  if (*text == '\0') return 0;
  char *separator = text;
  while (*separator != '\0' && !isspace((unsigned char)*separator)) ++separator;
  char *arguments = separator;
  if (*separator != '\0') {
    *separator++ = '\0';
    arguments = trim(separator);
  }
  if (!*header_seen) {
    if (strcmp(text, "DOLLY") != 0 || strcmp(arguments, "2") != 0) {
      fprintf(stderr, "dollyfile: %s:%zu: first declaration must be DOLLY 2\n",
              locator, line_number);
      return 2;
    }
    *header_seen = 1;
    return 0;
  }
  if (*kind == NULL) {
    if ((strcmp(text, "IMAGE") != 0 && strcmp(text, "MODULE") != 0) ||
        (strcmp(text, "IMAGE") == 0 ? !valid_name(arguments)
                                     : !valid_module_name(arguments))) {
      fprintf(stderr, "dollyfile: %s:%zu: expected IMAGE or MODULE\n",
              locator, line_number);
      return 2;
    }
    *kind = strdup(text);
    *name = strdup(arguments);
    if (*kind == NULL || *name == NULL) return 1;
    if (strcmp(text, "MODULE") == 0) {
      if (contains_string(engine->selected_names, engine->selected_name_count,
                          arguments)) {
        fprintf(stderr, "dollyfile: %s:%zu: module %s was already USEd\n",
                locator, line_number, arguments);
        return 2;
      }
      if (append_string(&engine->selected_names, &engine->selected_name_count,
                        &engine->selected_name_capacity, arguments) != 0) return 1;
    }
    return 0;
  }
  int result = 0;
  char **words = NULL;
  size_t count = 0;
  const int image = strcmp(*kind, "IMAGE") == 0;
  const int build_step = strcmp(text, "SOURCE") == 0 ||
                         strcmp(text, "FILE") == 0 ||
                         strcmp(text, "FOLDER") == 0 ||
                         strcmp(text, "SLOP") == 0;
  if ((image && strcmp(text, "USE") != 0 && strcmp(text, "ENTRY") != 0) ||
      (image && engine->entry_count != 0) ||
      (!image && strcmp(text, "USE") == 0 && *module_form == 2) ||
      (!image && build_step && *module_form == 1) ||
      (!image && strcmp(text, "REQUIRES") == 0 && *module_form != 0)) {
    result = 2;
  }
  if (result == 0 && !image && strcmp(text, "USE") == 0) *module_form = 1;
  if (result == 0 && !image && build_step) *module_form = 2;
  if (result == 0 && !image && strcmp(text, "EXPORTS") == 0 &&
      *module_form == 0) {
    *module_form = 2;
  }
  if (result != 0) {
    // The common error path below reports the invalid declaration.
  } else if (strcmp(text, "IMAGE") == 0 || strcmp(text, "MODULE") == 0 ||
      strcmp(text, "DOLLY") == 0) {
    result = 2;
  } else if (strcmp(text, "USE") == 0) {
    result = split_words(arguments, &words, &count);
    if (result == 0 &&
        (count != 3 || strcmp(words[0], "HOST") != 0 ||
         !valid_module_locator(words[1]) || !valid_sha256(words[2]))) result = 2;
    if (result == 0) {
      Scope child = {0};
      Scope visible = {0};
      const int child_execute =
          execute && !(depth == 0 && *uses < engine->resume_uses);
      if (!child_execute && depth == 0) {
        printf("dollyfile: cache hit %s\n", words[1]);
      }
      if (result == 0) result = scope_copy(&visible, imports);
      if (result == 0) result = scope_copy(&visible, children);
      if (result == 0) {
        result = execute_recipe(engine, words[1], words[2], depth + 1,
                                &visible, 0, child_execute, &child);
      }
      dispose_scope(&visible);
      for (size_t index = 0; result == 0 && depth == 0 && index < child.count;
           ++index) {
        result = retain_export(engine, &child.items[index]);
        if (result == 0 && strcmp(child.items[index].type, "ENV") == 0) {
          result = append_string(&engine->environment_names,
                                 &engine->environment_name_count,
                                 &engine->environment_name_capacity,
                                 child.items[index].name);
        }
        if (result != 0) {
          fprintf(stderr, "dollyfile: %s:%zu: missing image export %s %s: %s\n",
                  locator, line_number, child.items[index].type,
                  child.items[index].name, strerror(-result));
          result = 1;
        }
      }
      for (size_t index = 0; result == 0 && index < child.count; ++index) {
        const Object *object = &child.items[index];
        if (scope_find(imports, object->type, object->name) != NULL) {
          result = -EEXIST;
        } else {
          result = scope_add_object(children, object);
        }
        if (result == -EEXIST) {
          fprintf(stderr, "dollyfile: %s:%zu: duplicate export %s %s in scope\n",
                  locator, line_number, object->type, object->name);
          result = 2;
        }
      }
      dispose_scope(&child);
      if (result == 0) ++*uses;
    }
  } else if (strcmp(text, "REQUIRES") == 0) {
    result = split_words(arguments, &words, &count);
    if (result == 0 &&
        (strcmp(*kind, "IMAGE") == 0 || count != 2 ||
         !valid_object_type(words[0]) ||
         (strcmp(words[0], "ENV") == 0
              ? !valid_environment_name(words[1])
              : !valid_object_name(words[1])))) result = 2;
    const Object *provider = result == 0
                                 ? scope_find(available, words[0], words[1])
                                 : NULL;
    if (result == 0 && provider == NULL) {
      fprintf(stderr,
              "dollyfile: %s:%zu: %s %s must be exported by an earlier USE\n",
              locator, line_number, words[0], words[1]);
      result = 2;
    }
    if (result == 0) {
      result = scope_add_object(imports, provider);
      if (result == -EEXIST) result = 2;
    }
    if (result == 0 && strcmp(words[0], "TOOL") == 0) {
      result = permit_tool(permitted_tools, provider->name);
    }
  } else if (strcmp(text, "EXPORTS") == 0) {
    result = split_words(arguments, &words, &count);
    if (result == 0 &&
        (count < 2 || !valid_object_type(words[0]) ||
         (strcmp(words[0], "ENV") == 0
              ? !valid_environment_name(words[1])
              : !valid_object_name(words[1])))) result = 2;
    const char *detail = NULL;
    const char *sha256 = NULL;
    char *environment_detail = NULL;
    const Object *child_export = result == 0 && *uses != 0
                                     ? scope_find(children, words[0], words[1])
                                     : NULL;
    if (result == 0 && *uses != 0 && child_export == NULL) {
      fprintf(stderr,
              "dollyfile: %s:%zu: aggregate export %s %s must come from a direct child\n",
              locator, line_number, words[0], words[1]);
      result = 2;
    }
    if (result == 0 && *uses != 0) {
      if (count != 2) result = 2;
      else {
        detail = child_export->detail;
        sha256 = child_export->sha256;
      }
    } else if (result == 0 && strcmp(words[0], "TOOL") == 0) {
      if (count == 3 && valid_sha256(words[2])) sha256 = words[2];
      else if (count != 2) result = 2;
    } else if (result == 0 && strcmp(words[0], "ENV") == 0) {
      if (count == 3) detail = words[2];
      else if (count == 4 && strcmp(words[2], "APPEND") == 0) {
        const size_t length = strlen(words[3]) + 8;
        environment_detail = malloc(length);
        if (environment_detail == NULL) result = 1;
        else {
          snprintf(environment_detail, length, "APPEND %s", words[3]);
          detail = environment_detail;
        }
      } else result = 2;
    } else if (result == 0) {
      if (count != 3 || !valid_absolute_path(words[2]) ||
          forbidden_keep(words[2])) result = 2;
      else detail = words[2];
    }
    if (result == 0) {
      result = *uses != 0
                   ? scope_add_object(exports, child_export)
                   : scope_add(exports, words[0], words[1], detail, sha256);
      if (result == -EEXIST) result = 2;
    }
    // A packaged-prefix resume parses every skipped descendant to reconstruct
    // the module graph, but the snapshot contains only the top-level module's
    // public exports. Do not require a private descendant export to remain on
    // disk. At depth 1 the export is public to the image and must be present;
    // a leaf-layer cache also sets filesystem_available because it restored
    // the complete leaf output before parsing its declarations.
    const int exported_files_available = filesystem_available || depth == 1;
    if (result == 0 && *uses == 0 &&
        (strcmp(words[0], "ENV") == 0 || exported_files_available)) {
      result = validate_export(words[0], words[1], detail, sha256);
      if (result != 0) {
        fprintf(stderr, "dollyfile: %s:%zu: missing exported %s %s: %s\n",
                locator, line_number, words[0], words[1], strerror(-result));
        result = 1;
      }
    }
    if (result == 0 && strcmp(words[0], "ENV") != 0 &&
        exported_files_available &&
        exports->items[exports->count - 1].members == NULL) {
      result = capture_export_members(&exports->items[exports->count - 1]);
      if (result != 0) {
        fprintf(stderr, "dollyfile: %s:%zu: could not capture exported %s %s: %s\n",
                locator, line_number, words[0], words[1], strerror(-result));
        result = 1;
      }
    }
    if (result == 0 && strcmp(words[0], "TOOL") == 0) {
      result = permit_tool(permitted_tools, words[1]);
    }
    free(environment_detail);
  } else if (strcmp(text, "SOURCE") == 0) {
    result = split_words(arguments, &words, &count);
    if (result == 0 &&
        (count != 4 || (strcmp(words[0], "HOST") != 0 &&
                        strcmp(words[0], "URL") != 0) ||
         (strcmp(words[0], "HOST") == 0 && !valid_absolute_path(words[1])) ||
         (strcmp(words[0], "URL") == 0 &&
          ((strncmp(words[1], "https://", 8) != 0 &&
            strncmp(words[1], "http://", 7) != 0) ||
           strchr(words[1], '#') != NULL)) ||
         !valid_absolute_path(words[2]) || !valid_sha256(words[3]))) result = 2;
    if (result == 0 && execute &&
        fetch_source(engine, words[0], words[1], words[2], words[3]) != 0) {
      result = 1;
    }
  } else if (strcmp(text, "SLOP") == 0) {
    result = execute_slop(arguments, permitted_tools, execute);
    if (result == 0) ++*slops;
  } else if (strcmp(text, "FILE") == 0) {
    result = split_words(arguments, &words, &count);
    if (result == 0 && (count != 1 || !valid_absolute_path(words[0]))) result = 2;
    if (result == 0 && execute && body != NULL) {
      const int status = write_inline_file(words[0], body, body_length);
      if (status != 0) result = 1;
    }
    if (result == 0 && forbidden_keep(words[0])) {
      if (strncmp(words[0], "/tmp/", 5) != 0) {
        result = 2;
      }
    } else if (result == 0) {
      result = append_string(&engine->keep, &engine->keep_count,
                             &engine->keep_capacity, words[0]);
    }
  } else if (strcmp(text, "FOLDER") == 0) {
    result = split_words(arguments, &words, &count);
    if (result == 0 && (count != 1 || !valid_absolute_path(words[0]) ||
                        forbidden_keep(words[0]))) result = 2;
    if (result == 0) {
      result = collect_tree(engine, words[0]);
      if (result != 0) {
        fprintf(stderr, "dollyfile: %s:%zu: FOLDER is missing or invalid: %s\n",
                locator, line_number, strerror(-result));
        result = 1;
      }
    }
  } else if (strcmp(text, "ENTRY") == 0) {
    result = split_words(arguments, &words, &count);
    if (result == 0 && (strcmp(*kind, "IMAGE") != 0 || engine->entry_count != 0 ||
                        count == 0 || !valid_absolute_path(words[0]))) result = 2;
    if (result == 0) result = set_entry(engine, words, count);
  } else {
    result = 2;
  }
  free(words);
  if (result != 0) {
    fprintf(stderr, "dollyfile: %s:%zu: invalid %s declaration\n",
            locator, line_number, text);
  }
  return result;
}

static int append_recipe(Engine *engine, const char *kind, const char *name,
                         const char *locator, const char digest[65],
                         const char *source) {
  if (engine->recipe_count == engine->recipe_capacity) {
    const size_t next = engine->recipe_capacity == 0 ? 4 : engine->recipe_capacity * 2;
    RecipeRecord *replacement = realloc(engine->recipes, next * sizeof(*replacement));
    if (replacement == NULL) return -ENOMEM;
    engine->recipes = replacement;
    engine->recipe_capacity = next;
  }
  RecipeRecord *record = &engine->recipes[engine->recipe_count++];
  memset(record, 0, sizeof(*record));
  record->kind = strdup(kind);
  record->name = strdup(name);
  record->locator = strdup(locator);
  record->source = strdup(source);
  memcpy(record->digest, digest, 65);
  return record->kind != NULL && record->name != NULL &&
         record->locator != NULL && record->source != NULL ? 0 : -ENOMEM;
}

static int execute_recipe(Engine *engine, const char *locator,
                          const char *expected_sha256, size_t depth,
                          const Scope *available, int root, int execute,
                          Scope *exports_out) {
  if (depth >= MAX_RECIPE_DEPTH) {
    fprintf(stderr, "dollyfile: module graph exceeds %d layers\n", MAX_RECIPE_DEPTH);
    return 2;
  }
  for (size_t index = 0; index < engine->stack_count; ++index) {
    if (strcmp(engine->stack[index], locator) == 0) {
      fprintf(stderr, "dollyfile: module cycle at %s\n", locator);
      return 2;
    }
  }
  if (!root) {
    if (contains_string(engine->selected_modules, engine->selected_module_count,
                        locator)) {
      fprintf(stderr,
              "dollyfile: module %s may be USEd only once in one Dollyfile graph\n",
              locator);
      return 2;
    }
    if (append_string(&engine->selected_modules, &engine->selected_module_count,
                      &engine->selected_module_capacity, locator) != 0) return 1;
  }
  Buffer recipe = {.limit = MAX_RECIPE_BYTES};
  char digest[65];
  int result = fetch_recipe(engine, locator, &recipe, digest);
  if (result != 0) {
    fprintf(stderr, "dollyfile: could not load recipe %s: %d\n", locator, result);
    free(recipe.data);
    return 1;
  }
  if (expected_sha256 != NULL && strcmp(digest, expected_sha256) != 0) {
    fprintf(stderr,
            "dollyfile: module pin mismatch for %s\nexpected %s\nactual   %s\n",
            locator, expected_sha256, digest);
    free(recipe.data);
    return 2;
  }
  char cache_key[65] = {0};
  int recipe_execute = execute;
  if (!root) {
    module_cache_key(engine, available, locator, digest, cache_key);
    if (execute) {
      const int cache_status = restore_module_layer(cache_key);
      if (cache_status == 0) {
        recipe_execute = 0;
      } else if (cache_status != -ENOENT) {
        fprintf(stderr, "dollyfile: ignoring invalid module cache %s: %s\n",
                cache_key, strerror(-cache_status));
        char *cache_path = module_cache_path("/etc/dolly/module-cache-input",
                                             cache_key);
        if (cache_path != NULL) {
          unlink(cache_path);
          free(cache_path);
        }
      }
    }
  }
  char **stack_replacement = realloc(engine->stack,
      (engine->stack_count + 1) * sizeof(*engine->stack));
  if (stack_replacement == NULL) {
    free(recipe.data);
    return 1;
  }
  engine->stack = stack_replacement;
  engine->stack[engine->stack_count++] = strdup(locator);
  if (engine->stack[engine->stack_count - 1] == NULL) {
    free(recipe.data);
    return 1;
  }

  char *kind = NULL;
  char *name = NULL;
  int header_seen = 0;
  size_t uses = 0;
  size_t slops = 0;
  int module_form = 0;
  Scope imports = {0};
  Scope children = {0};
  Scope permitted_tools = {0};
  const size_t keep_start = engine->keep_count;
  size_t physical_line = 1;
  size_t cursor = 0;
  while (result == 0 && cursor < recipe.length) {
    const size_t logical_line = physical_line;
    Buffer logical = {.limit = MAX_LOGICAL_LINE_BYTES};
    int continued = 0;
    do {
      size_t end = cursor;
      while (end < recipe.length && recipe.data[end] != '\n' &&
             recipe.data[end] != '\r') ++end;
      size_t content_end = end;
      while (content_end > cursor &&
             (recipe.data[content_end - 1] == ' ' ||
              recipe.data[content_end - 1] == '\t')) --content_end;
      continued = content_end > cursor && recipe.data[content_end - 1] == '\\';
      if (continued) --content_end;
      if (logical.length != 0 && append_buffer(" ", 1, &logical) != 1) result = 1;
      if (result == 0 && append_buffer(recipe.data + cursor,
                                      content_end - cursor, &logical) !=
                             content_end - cursor) result = 1;
      if (end < recipe.length && recipe.data[end] == '\r' &&
          end + 1 < recipe.length && recipe.data[end + 1] == '\n') ++end;
      cursor = end < recipe.length ? end + 1 : end;
      ++physical_line;
      if (continued && cursor >= recipe.length) {
        fprintf(stderr, "dollyfile: %s:%zu: unterminated continuation\n",
                locator, logical_line);
        result = 2;
      }
    } while (result == 0 && continued);
    if (result != 0) {
      free(logical.data);
      break;
    }
    if (logical.data == NULL) {
      logical.data = calloc(1, 1);
      if (logical.data == NULL) {
        result = 1;
        break;
      }
    }
    int file_directive = 0;
    char *probe = strdup((char *)logical.data);
    if (probe == NULL) result = 1;
    else {
      strip_comment(probe);
      char *trimmed = trim(probe);
      file_directive = strncmp(trimmed, "FILE", 4) == 0 &&
                       isspace((unsigned char)trimmed[4]);
      free(probe);
    }
    Buffer body = {.limit = MAX_RECIPE_BYTES};
    if (result == 0 && file_directive) {
      while (cursor < recipe.length) {
        size_t end = cursor;
        while (end < recipe.length && recipe.data[end] != '\n' &&
               recipe.data[end] != '\r') ++end;
        if (end - cursor < 4 || memcmp(recipe.data + cursor, "    ", 4) != 0) break;
        if (append_buffer(recipe.data + cursor + 4, end - cursor - 4, &body) !=
                end - cursor - 4 ||
            append_buffer("\n", 1, &body) != 1) {
          result = 1;
          break;
        }
        if (end < recipe.length && recipe.data[end] == '\r' &&
            end + 1 < recipe.length && recipe.data[end + 1] == '\n') ++end;
        cursor = end < recipe.length ? end + 1 : end;
        ++physical_line;
      }
    }
    if (result == 0) {
      result = process_line(engine, locator, depth, logical_line,
                            (char *)logical.data,
                            body.data, body.length, available, &imports, &children,
                            &permitted_tools, exports_out,
                            &kind, &name, &header_seen, &uses, &slops,
                            &module_form, recipe_execute, execute);
    }
    free(body.data);
    free(logical.data);
  }
  if (result == 0 && (!header_seen || kind == NULL || name == NULL)) {
    fprintf(stderr, "dollyfile: %s: missing IMAGE or MODULE\n", locator);
    result = 2;
  }
  if (result == 0 && root && strcmp(kind, "IMAGE") != 0) {
    fprintf(stderr, "dollyfile: %s: root must declare IMAGE\n", locator);
    result = 2;
  }
  if (result == 0 && !root && strcmp(kind, "MODULE") != 0) {
    fprintf(stderr, "dollyfile: %s: USE target must declare MODULE\n", locator);
    result = 2;
  }
  if (result == 0 && !root && !module_name_matches_locator(locator, name)) {
    fprintf(stderr, "dollyfile: %s: MODULE %s must match its filename\n",
            locator, name);
    result = 2;
  }
  if (result == 0 && root && engine->entry_count == 0) {
    fprintf(stderr, "dollyfile: %s: IMAGE is missing ENTRY\n", locator);
    result = 2;
  }
  if (result == 0 && root && engine->resume_uses > uses) {
    fprintf(stderr, "dollyfile: cache prefix has %zu USEs, recipe has %zu\n",
            engine->resume_uses, uses);
    result = 2;
  }
  if (result == 0 && !root && uses != 0) {
    for (size_t index = 0; index < children.count; ++index) {
      const Object *object = &children.items[index];
      if (strcmp(object->type, "ENV") != 0 ||
          scope_find(exports_out, object->type, object->name) != NULL) continue;
      const Object *inherited = scope_find(&imports, object->type, object->name);
      const int environment_status = inherited == NULL
                                         ? unsetenv(object->name)
                                         : apply_environment(inherited->name,
                                                             inherited->detail);
      if (environment_status != 0) {
        fprintf(stderr, "dollyfile: could not hide private ENV %s from %s\n",
                object->name, locator);
        result = 1;
        break;
      }
    }
  }
  if (execute && !root) {
    if (result == 0) {
      result = verify_temporary_directory_empty(locator);
      if (result < 0) {
        fprintf(stderr, "dollyfile: could not inspect /tmp after %s: %s\n",
                locator, strerror(-result));
        result = 1;
      }
    }
    if (result != 0) {
      const int cleanup_status = clean_temporary_directory(locator);
      if (cleanup_status != 0) {
        fprintf(stderr, "dollyfile: could not clean /tmp after %s failed: %s\n",
                locator, strerror(-cleanup_status));
      }
    }
  }
  if (result == 0 && recipe_execute && !root && uses == 0 && slops != 0) {
    const int cache_status = write_module_layer(
        engine, exports_out, keep_start, cache_key);
    if (cache_status != 0) {
      fprintf(stderr, "dollyfile: could not save optional module cache %s: %s\n",
              cache_key, strerror(-cache_status));
    }
  }
  if (result == 0) result = append_recipe(engine, kind, name, locator, digest,
                                          (char *)recipe.data);
  if (result == 0 && root) {
    free(engine->selected_image);
    engine->selected_image = strdup(name);
    if (engine->selected_image == NULL) result = 1;
  }
  free(kind);
  free(name);
  dispose_scope(&imports);
  dispose_scope(&children);
  dispose_scope(&permitted_tools);
  free(recipe.data);
  free(engine->stack[--engine->stack_count]);
  if (result != 0) dispose_scope(exports_out);
  return result;
}

static int compare_strings(const void *left, const void *right) {
  return strcmp(*(const char *const *)left, *(const char *const *)right);
}

static void put_u32(unsigned char **cursor, uint32_t value) {
  (*cursor)[0] = (unsigned char)value;
  (*cursor)[1] = (unsigned char)(value >> 8);
  (*cursor)[2] = (unsigned char)(value >> 16);
  (*cursor)[3] = (unsigned char)(value >> 24);
  *cursor += 4;
}

static int write_environment_file(Engine *engine) {
  Buffer environment = {.limit = MAX_RECIPE_BYTES};
  static const unsigned char magic[8] = {
      'D', 'O', 'L', 'L', 'Y', 'E', 'N', 'V',
  };
  if (engine->environment_name_count > UINT32_MAX ||
      append_buffer(magic, sizeof(magic), &environment) != sizeof(magic) ||
      append_u32(&environment, 1) != 4 ||
      append_u32(&environment,
                 (uint32_t)engine->environment_name_count) != 4) {
    free(environment.data);
    return -EFBIG;
  }
  int result = 0;
  for (size_t index = 0;
       result == 0 && index < engine->environment_name_count; ++index) {
    const char *name = engine->environment_names[index];
    const char *value = getenv(name);
    if (value == NULL || strlen(name) > UINT32_MAX || strlen(value) > UINT32_MAX ||
        append_u32(&environment, (uint32_t)strlen(name)) != 4 ||
        append_u32(&environment, (uint32_t)strlen(value)) != 4 ||
        append_buffer(name, strlen(name), &environment) != strlen(name) ||
        append_buffer(value, strlen(value), &environment) != strlen(value)) {
      result = value == NULL ? -ENOENT : -EFBIG;
    }
  }
  if (result == 0) {
    result = dolly_write_file("/etc/dolly/environment",
                              environment.data, environment.length);
  }
  free(environment.data);
  if (result == 0) {
    result = append_string(&engine->keep, &engine->keep_count,
                           &engine->keep_capacity, "/etc/dolly/environment");
  }
  return result;
}

static int write_control_files(Engine *engine) {
  if (engine->entry_count == 0 || engine->selected_image == NULL) {
    fprintf(stderr, "dollyfile: selected image has no ENTRY\n");
    return 1;
  }
  struct stat entry_metadata;
  if (stat(engine->entry[0], &entry_metadata) != 0 ||
      !S_ISREG(entry_metadata.st_mode)) {
    fprintf(stderr, "dollyfile: ENTRY is missing or not a file: %s\n",
            engine->entry[0]);
    return 1;
  }
  int status = mkdir_parents("/etc/dolly/recipes", 1);
  if (status != 0) {
    fprintf(stderr, "dollyfile: could not create recipe directory: %s\n",
            strerror(-status));
    return 1;
  }
  Buffer lock = {.limit = MAX_RECIPE_BYTES};
  if (append_buffer("DOLLY-RECIPES 1\n", 16, &lock) != 16) return 1;
  for (size_t index = 0; index < engine->recipe_count; ++index) {
    RecipeRecord *record = &engine->recipes[index];
    const size_t line_length = strlen(record->locator) + strlen(record->digest) + 8;
    char *line = malloc(line_length);
    if (line == NULL) return 1;
    snprintf(line, line_length, "%s %s\n", record->locator, record->digest);
    if (append_buffer(line, strlen(line), &lock) != strlen(line)) {
      free(line);
      return 1;
    }
    free(line);
    const int module = strcmp(record->kind, "MODULE") == 0;
    const size_t recipe_path_length = strlen(record->name) + 48;
    char *recipe_path = malloc(recipe_path_length);
    if (recipe_path == NULL) return 1;
    snprintf(recipe_path, recipe_path_length,
             module ? "/etc/dolly/recipes/modules/%s.dm"
                    : "/etc/dolly/recipes/%s.Dollyfile",
             record->name);
    status = mkdir_parents(recipe_path, 0);
    if (status != 0) {
      free(recipe_path);
      return 1;
    }
    status = dolly_write_file(recipe_path, record->source, strlen(record->source));
    if (status != 0 || append_string(&engine->keep, &engine->keep_count,
                                     &engine->keep_capacity, recipe_path) != 0) {
      fprintf(stderr, "dollyfile: could not retain recipe %s: %s\n", recipe_path,
              status == 0 ? "out of memory" : strerror(-status));
      free(recipe_path);
      return 1;
    }
    if (!module &&
        (status = dolly_write_file("/etc/dolly/Dollyfile", record->source,
                                   strlen(record->source))) != 0) {
      fprintf(stderr, "dollyfile: could not write canonical recipe: %s\n",
              strerror(-status));
      free(recipe_path);
      return 1;
    }
    free(recipe_path);
  }
  if (append_string(&engine->keep, &engine->keep_count,
                    &engine->keep_capacity, "/etc/dolly/Dollyfile") != 0) {
    free(lock.data);
    return 1;
  }
  status = dolly_write_file("/etc/dolly/recipes.lock", lock.data, lock.length);
  if (status != 0 ||
      append_string(&engine->keep, &engine->keep_count,
                    &engine->keep_capacity, "/etc/dolly/recipes.lock") != 0 ||
      (status = dolly_write_file("/etc/dolly/image", engine->selected_image,
                                 strlen(engine->selected_image))) != 0 ||
      append_string(&engine->keep, &engine->keep_count,
                    &engine->keep_capacity, "/etc/dolly/image") != 0) {
    fprintf(stderr, "dollyfile: could not write image identity: %s\n",
            status == 0 ? "out of memory" : strerror(-status));
    free(lock.data);
    return 1;
  }
  free(lock.data);

  size_t entry_size = 16;
  for (size_t index = 0; index < engine->entry_count; ++index) {
    if (strlen(engine->entry[index]) > UINT32_MAX ||
        entry_size > SIZE_MAX - 4 - strlen(engine->entry[index])) return 1;
    entry_size += 4 + strlen(engine->entry[index]);
  }
  unsigned char *entry = malloc(entry_size);
  if (entry == NULL) return 1;
  unsigned char *entry_cursor = entry;
  memcpy(entry_cursor, "DOLLYENT", 8);
  entry_cursor += 8;
  put_u32(&entry_cursor, 1);
  put_u32(&entry_cursor, (uint32_t)engine->entry_count);
  for (size_t index = 0; index < engine->entry_count; ++index) {
    const uint32_t length = (uint32_t)strlen(engine->entry[index]);
    put_u32(&entry_cursor, length);
    memcpy(entry_cursor, engine->entry[index], length);
    entry_cursor += length;
  }
  const int entry_status = dolly_write_file("/etc/dolly/entry", entry, entry_size);
  free(entry);
  if (entry_status != 0 || append_string(&engine->keep, &engine->keep_count,
                                         &engine->keep_capacity,
                                         "/etc/dolly/entry") != 0) {
    fprintf(stderr, "dollyfile: could not write image entry: %s\n",
            entry_status == 0 ? "out of memory" : strerror(-entry_status));
    return 1;
  }
  const int environment_status = write_environment_file(engine);
  if (environment_status != 0) {
    fprintf(stderr, "dollyfile: could not write image environment: %s\n",
            strerror(-environment_status));
    return 1;
  }
  return 0;
}

static int seal_manifest(Engine *engine) {
  if (write_control_files(engine) != 0) return 1;
  qsort(engine->keep, engine->keep_count, sizeof(*engine->keep), compare_strings);
  Buffer manifest = {.limit = 8 * 1024 * 1024};
  for (size_t index = 0; index < engine->keep_count; ++index) {
    struct stat metadata;
    if (stat(engine->keep[index], &metadata) != 0 || !S_ISREG(metadata.st_mode)) {
      fprintf(stderr, "dollyfile: KEEP input is missing or not a file: %s\n",
              engine->keep[index]);
      free(manifest.data);
      return 1;
    }
    if (index != 0 && strcmp(engine->keep[index - 1], engine->keep[index]) == 0) continue;
    if (append_buffer(engine->keep[index], strlen(engine->keep[index]), &manifest) !=
            strlen(engine->keep[index]) ||
        append_buffer("\n", 1, &manifest) != 1) {
      free(manifest.data);
      return 1;
    }
  }
  const int status = dolly_write_file("/etc/dolly/image.manifest",
                                      manifest.data, manifest.length);
  free(manifest.data);
  if (status != 0) return 1;
  printf("dollyfile: image %s complete; retained %zu files\n",
         engine->selected_image, engine->keep_count);
  return 0;
}

static void dispose_engine(Engine *engine) {
  free(engine->host_base);
  free(engine->selected_image);
  for (size_t index = 0; index < engine->keep_count; ++index) free(engine->keep[index]);
  free(engine->keep);
  for (size_t index = 0; index < engine->entry_count; ++index) free(engine->entry[index]);
  free(engine->entry);
  for (size_t index = 0; index < engine->recipe_count; ++index) {
    free(engine->recipes[index].kind);
    free(engine->recipes[index].name);
    free(engine->recipes[index].locator);
    free(engine->recipes[index].source);
  }
  free(engine->recipes);
  for (size_t index = 0; index < engine->stack_count; ++index) free(engine->stack[index]);
  free(engine->stack);
  for (size_t index = 0; index < engine->selected_module_count; ++index) {
    free(engine->selected_modules[index]);
  }
  free(engine->selected_modules);
  for (size_t index = 0; index < engine->selected_name_count; ++index) {
    free(engine->selected_names[index]);
  }
  free(engine->selected_names);
  for (size_t index = 0; index < engine->environment_name_count; ++index) {
    free(engine->environment_names[index]);
  }
  free(engine->environment_names);
}

static void usage(FILE *stream) {
  fputs("usage: dollyfile RECIPE-LOCATOR HOST-BASE [--resume USES]\n", stream);
}

int main(int argc, char **argv) {
  if (argc == 2 && strcmp(argv[1], "--help") == 0) {
    usage(stdout);
    return 0;
  }
  if ((argc != 3 && argc != 5) ||
      !(strncmp(argv[2], "https://", 8) == 0 || strncmp(argv[2], "http://", 7) == 0)) {
    usage(stderr);
    return 2;
  }
  size_t resume_uses = 0;
  if (argc == 5) {
    char *end = NULL;
    errno = 0;
    const unsigned long parsed = strtoul(argv[4], &end, 10);
    if (strcmp(argv[3], "--resume") != 0 || errno != 0 || end == argv[4] ||
        *end != '\0' || parsed == 0 || parsed > 256) {
      usage(stderr);
      return 2;
    }
    resume_uses = (size_t)parsed;
  }
  Engine engine = {.host_base = strdup(argv[2]), .resume_uses = resume_uses};
  if (engine.host_base == NULL) return 1;
  Scope available = {0};
  Scope exports = {0};
  int status = execute_recipe(&engine, argv[1], NULL, 0,
                              &available, 1, 1, &exports);
  dispose_scope(&exports);
  if (status == 0) status = seal_manifest(&engine);
  dispose_engine(&engine);
  return status;
}
