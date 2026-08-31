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
  char *image;
  char *locator;
  char digest[65];
  char *source;
} RecipeRecord;

typedef struct {
  char *host_base;
  char **keep;
  size_t keep_count;
  size_t keep_capacity;
  char **keep_trees;
  size_t keep_tree_count;
  size_t keep_tree_capacity;
  char **entry;
  size_t entry_count;
  RecipeRecord *recipes;
  size_t recipe_count;
  size_t recipe_capacity;
  char **stack;
  size_t stack_count;
  char *selected_image;
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

static int run_slop(const char *kind, const char *command) {
  printf("+ %s %s\n", kind, command);
  fflush(stdout);
  char *arguments[] = {"slop", "-e", "-c", (char *)command, NULL};
  const int pid = dolly_spawn("/bin/slop", 4, arguments,
                              STDIN_FILENO, STDOUT_FILENO, STDERR_FILENO);
  if (pid < 0) return pid;
  int status = 126;
  const int waited = dolly_wait(pid, &status);
  return waited == 0 ? status : waited;
}

static int execute_recipe(Engine *engine, const char *locator, size_t depth);

static int process_line(Engine *engine, const char *locator, size_t depth,
                        size_t line_number, char *line, char **image,
                        int *header_seen, int *extends_seen, int *action_seen) {
  strip_comment(line);
  char *text = trim(line);
  if (*text == '\0') return 0;
  char *separator = text;
  while (*separator != '\0' && !isspace((unsigned char)*separator)) ++separator;
  char *arguments = separator;
  if (*separator != '\0') {
    *separator++ = '\0';
    arguments = trim(separator);
  } else {
    arguments = separator;
  }
  if (!*header_seen) {
    if (strcmp(text, "DOLLY") != 0 || strcmp(arguments, "1") != 0) {
      fprintf(stderr, "dollyfile: %s:%zu: first declaration must be DOLLY 1\n",
              locator, line_number);
      return 2;
    }
    *header_seen = 1;
    return 0;
  }
  int result = 0;
  if (strcmp(text, "IMAGE") == 0) {
    if (*image != NULL || !valid_name(arguments) || *action_seen) result = 2;
    else *image = strdup(arguments);
  } else if (strcmp(text, "EXTENDS") == 0) {
    if (*image == NULL || *extends_seen || *action_seen || !valid_name(arguments)) {
      result = 2;
    } else {
      *extends_seen = 1;
      const size_t length = strlen(arguments) + 12;
      char *parent = malloc(length);
      if (parent == NULL) result = 1;
      else {
        snprintf(parent, length, "%s", strcmp(arguments, "default") == 0
                                      ? "/Dollyfile" : "");
        if (strcmp(arguments, "default") != 0) {
          snprintf(parent, length, "/Dollyfile-%s", arguments);
        }
        result = execute_recipe(engine, parent, depth + 1);
        free(parent);
      }
    }
  } else if (strcmp(text, "SOURCE") == 0) {
    *action_seen = 1;
    char **words = NULL;
    size_t count = 0;
    result = split_words(arguments, &words, &count);
    if (result == 0 &&
        (count != 6 || (strcmp(words[0], "HOST") != 0 && strcmp(words[0], "URL") != 0) ||
         (strcmp(words[1], "BIN") != 0 && strcmp(words[1], "TXT") != 0) ||
         strcmp(words[4], "SHA256") != 0)) result = 2;
    if (result == 0) {
      result = fetch_source(engine, words[0], words[2], words[3], words[5]);
      if (result != 0) result = 1;
    }
    free(words);
  } else if (strcmp(text, "ENV") == 0) {
    *action_seen = 1;
    char *equals = strchr(arguments, '=');
    if (equals == NULL) result = 2;
    else {
      *equals = '\0';
      if (!(isalpha((unsigned char)arguments[0]) || arguments[0] == '_')) result = 2;
      for (const char *cursor = arguments + 1; result == 0 && *cursor; ++cursor) {
        if (!(isalnum((unsigned char)*cursor) || *cursor == '_')) result = 2;
      }
      if (result == 0 && setenv(arguments, equals + 1, 1) != 0) result = 1;
    }
  } else if (strcmp(text, "WORKDIR") == 0) {
    *action_seen = 1;
    if ((strcmp(arguments, "/") != 0 && !valid_absolute_path(arguments)) ||
        chdir(arguments) != 0) result = 1;
  } else if (strcmp(text, "RUN") == 0 || strcmp(text, "CHECK") == 0) {
    *action_seen = 1;
    if (*arguments == '\0') result = 2;
    else {
      result = run_slop(text, arguments);
      if (result != 0) {
        fprintf(stderr, "dollyfile: %s:%zu: %s failed with status %d\n",
                locator, line_number, text, result);
        result = 1;
      }
    }
  } else if (strcmp(text, "KEEP") == 0 || strcmp(text, "KEEP-TREE") == 0) {
    *action_seen = 1;
    if (!valid_absolute_path(arguments) || forbidden_keep(arguments)) result = 2;
    else if (strcmp(text, "KEEP") == 0) {
      result = append_string(&engine->keep, &engine->keep_count,
                             &engine->keep_capacity, arguments);
    } else {
      result = append_string(&engine->keep_trees, &engine->keep_tree_count,
                             &engine->keep_tree_capacity, arguments);
    }
  } else if (strcmp(text, "ENTRY") == 0) {
    *action_seen = 1;
    char **words = NULL;
    size_t count = 0;
    result = split_words(arguments, &words, &count);
    if (result == 0 && (count == 0 || !valid_absolute_path(words[0]))) result = 2;
    if (result == 0) {
      for (size_t index = 0; index < engine->entry_count; ++index) free(engine->entry[index]);
      free(engine->entry);
      engine->entry = calloc(count, sizeof(*engine->entry));
      if (engine->entry == NULL) result = 1;
      else {
        engine->entry_count = count;
        for (size_t index = 0; index < count; ++index) {
          engine->entry[index] = strdup(words[index]);
          if (engine->entry[index] == NULL) result = 1;
        }
      }
    }
    free(words);
  } else {
    result = 2;
  }
  if (result != 0) {
    fprintf(stderr, "dollyfile: %s:%zu: invalid %s declaration\n",
            locator, line_number, text);
  }
  return result;
}

static int append_recipe(Engine *engine, const char *image, const char *locator,
                         const char digest[65], const char *source) {
  if (engine->recipe_count == engine->recipe_capacity) {
    const size_t next = engine->recipe_capacity == 0 ? 4 : engine->recipe_capacity * 2;
    RecipeRecord *replacement = realloc(engine->recipes, next * sizeof(*replacement));
    if (replacement == NULL) return -ENOMEM;
    engine->recipes = replacement;
    engine->recipe_capacity = next;
  }
  RecipeRecord *record = &engine->recipes[engine->recipe_count++];
  memset(record, 0, sizeof(*record));
  record->image = strdup(image);
  record->locator = strdup(locator);
  record->source = strdup(source);
  memcpy(record->digest, digest, 65);
  return record->image != NULL && record->locator != NULL && record->source != NULL ? 0 : -ENOMEM;
}

static int execute_recipe(Engine *engine, const char *locator, size_t depth) {
  if (depth >= MAX_RECIPE_DEPTH) {
    fprintf(stderr, "dollyfile: recipe inheritance exceeds %d layers\n", MAX_RECIPE_DEPTH);
    return 2;
  }
  for (size_t index = 0; index < engine->stack_count; ++index) {
    if (strcmp(engine->stack[index], locator) == 0) {
      fprintf(stderr, "dollyfile: inheritance cycle at %s\n", locator);
      return 2;
    }
  }
  Buffer recipe = {.limit = MAX_RECIPE_BYTES};
  char digest[65];
  int result = fetch_recipe(engine, locator, &recipe, digest);
  if (result != 0) {
    fprintf(stderr, "dollyfile: could not load recipe %s: %d\n", locator, result);
    free(recipe.data);
    return 1;
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

  char *image = NULL;
  int header_seen = 0;
  int extends_seen = 0;
  int action_seen = 0;
  Buffer logical = {.limit = MAX_LOGICAL_LINE_BYTES};
  size_t logical_line = 1;
  size_t physical_line = 1;
  size_t cursor = 0;
  while (result == 0 && cursor <= recipe.length) {
    size_t end = cursor;
    while (end < recipe.length && recipe.data[end] != '\n' && recipe.data[end] != '\r') ++end;
    size_t line_end = end;
    while (line_end > cursor && isspace(recipe.data[line_end - 1]) &&
           recipe.data[line_end - 1] != '\\') --line_end;
    int continued = line_end > cursor && recipe.data[line_end - 1] == '\\';
    if (continued) --line_end;
    if (logical.length == 0) logical_line = physical_line;
    if (logical.length != 0 && append_buffer(" ", 1, &logical) != 1) result = 1;
    if (result == 0 && append_buffer(recipe.data + cursor, line_end - cursor, &logical) !=
                       line_end - cursor) result = 1;
    if (!continued && result == 0) {
      if (logical.data == NULL) {
        logical.data = calloc(1, 1);
        logical.capacity = logical.data == NULL ? 0 : 1;
        if (logical.data == NULL) result = 1;
      }
    }
    if (!continued && result == 0) {
      result = process_line(engine, locator, depth, logical_line,
                            (char *)logical.data, &image, &header_seen,
                            &extends_seen, &action_seen);
      logical.length = 0;
      if (logical.data != NULL) logical.data[0] = '\0';
    }
    if (end == recipe.length) break;
    if (recipe.data[end] == '\r' && end + 1 < recipe.length && recipe.data[end + 1] == '\n') ++end;
    cursor = end + 1;
    ++physical_line;
  }
  if (result == 0 && logical.length != 0) {
    fprintf(stderr, "dollyfile: %s:%zu: unterminated continuation\n", locator, logical_line);
    result = 2;
  }
  if (result == 0 && (!header_seen || image == NULL)) {
    fprintf(stderr, "dollyfile: %s: missing IMAGE\n", locator);
    result = 2;
  }
  if (result == 0) result = append_recipe(engine, image, locator, digest, (char *)recipe.data);
  if (result == 0 && depth == 0) {
    free(engine->selected_image);
    engine->selected_image = strdup(image);
    if (engine->selected_image == NULL) result = 1;
  }
  free(image);
  free(logical.data);
  free(recipe.data);
  free(engine->stack[--engine->stack_count]);
  return result;
}

static int compare_strings(const void *left, const void *right) {
  return strcmp(*(const char *const *)left, *(const char *const *)right);
}

static int collect_tree(Engine *engine, const char *path) {
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
    struct stat metadata;
    if (stat(child, &metadata) != 0) result = -errno;
    else if (S_ISDIR(metadata.st_mode)) result = collect_tree(engine, child);
    else if (S_ISREG(metadata.st_mode)) {
      if (engine->keep_count >= MAX_MANIFEST_FILES) result = -E2BIG;
      else result = append_string(&engine->keep, &engine->keep_count,
                                  &engine->keep_capacity, child);
    } else {
      result = -EINVAL;
    }
    free(child);
  }
  if (closedir(directory) != 0 && result == 0) result = -errno;
  return result;
}

static void put_u32(unsigned char **cursor, uint32_t value) {
  (*cursor)[0] = (unsigned char)value;
  (*cursor)[1] = (unsigned char)(value >> 8);
  (*cursor)[2] = (unsigned char)(value >> 16);
  (*cursor)[3] = (unsigned char)(value >> 24);
  *cursor += 4;
}

static int write_control_files(Engine *engine) {
  if (engine->entry_count == 0 || engine->selected_image == NULL) {
    fprintf(stderr, "dollyfile: selected image has no ENTRY\n");
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
    const size_t recipe_path_length = strlen(record->image) + 31;
    char *recipe_path = malloc(recipe_path_length);
    if (recipe_path == NULL) return 1;
    snprintf(recipe_path, recipe_path_length, "/etc/dolly/recipes/%s.Dollyfile", record->image);
    status = dolly_write_file(recipe_path, record->source, strlen(record->source));
    if (status != 0 || append_string(&engine->keep, &engine->keep_count,
                                     &engine->keep_capacity, recipe_path) != 0) {
      fprintf(stderr, "dollyfile: could not retain recipe %s: %s\n", recipe_path,
              status == 0 ? "out of memory" : strerror(-status));
      free(recipe_path);
      return 1;
    }
    if (index + 1 == engine->recipe_count &&
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
  return 0;
}

static int seal_manifest(Engine *engine) {
  if (write_control_files(engine) != 0) return 1;
  for (size_t index = 0; index < engine->keep_tree_count; ++index) {
    struct stat metadata;
    if (stat(engine->keep_trees[index], &metadata) != 0 || !S_ISDIR(metadata.st_mode) ||
        collect_tree(engine, engine->keep_trees[index]) != 0) {
      fprintf(stderr, "dollyfile: KEEP-TREE is missing or invalid: %s\n",
              engine->keep_trees[index]);
      return 1;
    }
  }
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
  for (size_t index = 0; index < engine->keep_tree_count; ++index) free(engine->keep_trees[index]);
  free(engine->keep_trees);
  for (size_t index = 0; index < engine->entry_count; ++index) free(engine->entry[index]);
  free(engine->entry);
  for (size_t index = 0; index < engine->recipe_count; ++index) {
    free(engine->recipes[index].image);
    free(engine->recipes[index].locator);
    free(engine->recipes[index].source);
  }
  free(engine->recipes);
  for (size_t index = 0; index < engine->stack_count; ++index) free(engine->stack[index]);
  free(engine->stack);
}

static void usage(FILE *stream) {
  fputs("usage: dollyfile RECIPE-LOCATOR HOST-BASE\n", stream);
}

int main(int argc, char **argv) {
  if (argc == 2 && strcmp(argv[1], "--help") == 0) {
    usage(stdout);
    return 0;
  }
  if (argc != 3 ||
      !(strncmp(argv[2], "https://", 8) == 0 || strncmp(argv[2], "http://", 7) == 0)) {
    usage(stderr);
    return 2;
  }
  Engine engine = {.host_base = strdup(argv[2])};
  if (engine.host_base == NULL) return 1;
  int status = execute_recipe(&engine, argv[1], 0);
  if (status == 0) status = seal_manifest(&engine);
  dispose_engine(&engine);
  return status;
}
