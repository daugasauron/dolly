#define _POSIX_C_SOURCE 200809L
#define _XOPEN_SOURCE 700

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
#include "sha256.h"
#include "fs-record.h"

enum {
  MAX_RECIPE_BYTES = 128 * 1024,
  MAX_LOGICAL_LINE_BYTES = 64 * 1024,
  MAX_SOURCE_BYTES = 512 * 1024 * 1024,
  MAX_RECIPE_DEPTH = 16,
  MAX_MANIFEST_FILES = 100000,
};


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
  int append_environment;
  ObjectMembers *members;
} Object;

typedef struct {
  Object *items;
  size_t count;
  size_t capacity;
} Scope;

typedef struct {
  Buffer bytes;
  dolly_fs_record *records;
  uint32_t count;
  char recipe_sha256[65];
} Artifact;

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
  char **environment_names;
  size_t environment_name_count;
  size_t environment_name_capacity;
  char *selected_image;
  Scope exports;
  Artifact artifact;
} Engine;

typedef struct {
  int descriptor;
  Sha256 sha;
  size_t length;
} Download;


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
  return path != NULL && dolly_fs_valid_path(path) &&
         strpbrk(path, "\\\r\n") == NULL;
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
  unsigned char bytes[64 * 1024];
  struct stat metadata;
  int result = 0;
  if (fstat(descriptor, &metadata) == 0 && S_ISREG(metadata.st_mode)) {
    result = (uint64_t)metadata.st_size > buffer->limit ? -EFBIG
        : buffer_reserve(buffer, (size_t)metadata.st_size);
  }
  while (result == 0) {
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

// Decode one recipe word in place. The read cursor also identifies the raw
// shell tail, which must keep its quoting when SLOP passes it to the shell.
static int next_word(char **input, char **output, char **word) {
  while (isspace((unsigned char)**input)) ++*input;
  *word = **input == '\0' ? NULL : *output;
  if (*word == NULL) return 0;
  int quote = 0, escaped = 0;
  while (**input != '\0') {
    const unsigned char character = (unsigned char)*(*input)++;
    if (escaped) {
      if (quote == '"' && character != '$' && character != '`' &&
          character != '"' && character != '\\') *(*output)++ = '\\';
      *(*output)++ = (char)character;
      escaped = 0;
    }
    else if (character == '\\' && quote != '\'') escaped = 1;
    else if (quote != 0) {
      if (character == quote) quote = 0;
      else *(*output)++ = (char)character;
    } else if (character == '\'' || character == '"') quote = character;
    else if (isspace(character)) break;
    else *(*output)++ = (char)character;
  }
  if (escaped || quote != 0) return -EINVAL;
  *(*output)++ = '\0';
  return 0;
}

static int split_words(char *value, char ***words_out, size_t *count_out) {
  size_t capacity = 8;
  size_t count = 0;
  char **words = calloc(capacity, sizeof(*words));
  if (words == NULL) return -ENOMEM;
  char *read_cursor = value;
  char *write_cursor = value;
  for (;;) {
    char *word = NULL;
    const int result = next_word(&read_cursor, &write_cursor, &word);
    if (result != 0) { free(words); return result; }
    if (word == NULL) break;
    if (count == capacity) {
      capacity *= 2;
      char **replacement = realloc(words, capacity * sizeof(*words));
      if (replacement == NULL) {
        free(words);
        return -ENOMEM;
      }
      words = replacement;
    }
    words[count++] = word;
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

static void dispose_object(Object *object) {
  free(object->type);
  free(object->name);
  free(object->detail);
  free(object->sha256);
  ObjectMembers *members = object->members;
  if (members != NULL && --members->references == 0) {
    for (size_t index = 0; index < members->count; ++index) free(members->items[index]);
    free(members->items);
    free(members);
  }
  memset(object, 0, sizeof(*object));
}

static int scope_add_object(Scope *scope, const Object *source) {
  Object object = {
      .type = strdup(source->type), .name = strdup(source->name),
      .detail = source->detail == NULL ? NULL : strdup(source->detail),
      .sha256 = source->sha256 == NULL ? NULL : strdup(source->sha256),
      .append_environment = source->append_environment, .members = source->members,
  };
  if (object.members != NULL) ++object.members->references;
  if (object.type == NULL || object.name == NULL ||
      (source->detail != NULL && object.detail == NULL) ||
      (source->sha256 != NULL && object.sha256 == NULL)) {
    dispose_object(&object);
    return -ENOMEM;
  }
  const Object *previous = scope_find(scope, object.type, object.name);
  if (previous != NULL) {
    const size_t index = (size_t)(previous - scope->items);
    dispose_object(&scope->items[index]);
    memmove(&scope->items[index], &scope->items[index + 1],
            (--scope->count - index) * sizeof(*scope->items));
  }
  if (scope->count == scope->capacity) {
    const size_t next = scope->capacity == 0 ? 16 : scope->capacity * 2;
    Object *replacement = realloc(scope->items, next * sizeof(*replacement));
    if (replacement == NULL) { dispose_object(&object); return -ENOMEM; }
    scope->items = replacement;
    scope->capacity = next;
  }
  scope->items[scope->count++] = object;
  return 0;
}

static int scope_add(Scope *scope, const char *type, const char *name,
                     const char *detail, const char *sha256) {
  const Object object = {.type = (char *)type, .name = (char *)name,
                          .detail = (char *)detail, .sha256 = (char *)sha256};
  return scope_add_object(scope, &object);
}

static int scope_copy(Scope *destination, const Scope *source) {
  for (size_t index = 0; index < source->count; ++index) {
    const int result = scope_add_object(destination, &source->items[index]);
    if (result != 0) return result;
  }
  return 0;
}

static void dispose_scope(Scope *scope) {
  for (size_t index = 0; index < scope->count; ++index) dispose_object(&scope->items[index]);
  free(scope->items);
  memset(scope, 0, sizeof(*scope));
}

static int resolve_tool(const char *name, char **path_out) {
  const char *environment = getenv("PATH");
  char *directories = strdup(environment == NULL ? "/bin:/usr/bin" : environment);
  if (directories == NULL) return -ENOMEM;
  int result = -ENOENT;
  char *directory = directories;
  for (;;) {
    char *end = strchr(directory, ':');
    if (end != NULL) *end = '\0';
    const size_t length = strlen(directory) + strlen(name) + 3;
    char *path = malloc(length);
    if (path == NULL) { result = -ENOMEM; break; }
    snprintf(path, length, "%s/%s", *directory == '\0' ? "." : directory, name);
    struct stat metadata;
    if (stat(path, &metadata) == 0 && S_ISREG(metadata.st_mode)) {
      *path_out = path[0] == '/' ? strdup(path) : realpath(path, NULL);
      result = *path_out == NULL ? -errno : 0;
      free(path);
      break;
    }
    free(path);
    if (end == NULL) break;
    directory = end + 1;
  }
  free(directories);
  return result;
}

static int compare_strings(const void *left, const void *right);

static int collect_paths(char ***paths, size_t *count, size_t *capacity,
                         const char *path) {
  if (forbidden_keep(path)) return -EPERM;
  struct stat metadata;
  if (lstat(path, &metadata) != 0) return -errno;
  if (!S_ISREG(metadata.st_mode) && !S_ISDIR(metadata.st_mode) &&
      !S_ISLNK(metadata.st_mode)) return -EINVAL;
  if (*count >= MAX_MANIFEST_FILES) return -E2BIG;
  const int retained = append_string(paths, count, capacity, path);
  if (retained != 0 || !S_ISDIR(metadata.st_mode)) return retained;
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

static int apply_environment(const char *name, const char *detail, int append) {
  if (!append) {
    return setenv(name, detail, 1) == 0 ? 0 : -errno;
  }
  const char *value = detail;
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
    if (detail != NULL) {
      path = strdup(detail);
      if (path == NULL) result = -ENOMEM;
    } else result = resolve_tool(name, &path);
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
    if (detail == NULL) return -ENOENT;
    path = strdup(detail);
    if (path == NULL) result = -ENOMEM;
  }
  if (result == 0) {
    struct stat metadata;
    if (stat(path, &metadata) != 0) result = -errno;
    else if (strcmp(type, "FOLDER") == 0 && !S_ISDIR(metadata.st_mode)) result = -ENOTDIR;
    else if ((strcmp(type, "LIB") == 0 || strcmp(type, "FILE") == 0 ||
              strcmp(type, "TOOL") == 0) && !S_ISREG(metadata.st_mode)) result = -EINVAL;
    else if (!S_ISREG(metadata.st_mode) && !S_ISDIR(metadata.st_mode)) result = -EINVAL;
  }
  if (result == 0) *path_out = path;
  else free(path);
  return result;
}

static int validate_export(const char *type, const char *name,
                           const char *detail, const char *expected, int append) {
  if (strcmp(type, "ENV") == 0) return apply_environment(name, detail, append);
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
    if (result == 0 && strcmp(object->type, "TOOL") == 0) {
      free(object->detail);
      object->detail = path;
      path = NULL;
    }
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

static size_t append_u32(Buffer *buffer, uint32_t value) {
  unsigned char bytes[4] = {
      (unsigned char)value,
      (unsigned char)(value >> 8),
      (unsigned char)(value >> 16),
      (unsigned char)(value >> 24),
  };
  return append_buffer(bytes, sizeof(bytes), buffer);
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

static int run_slop(const char *cwd, const char *command) {
  const int input = open("/dev/null", O_RDONLY);
  if (input < 0) return -errno;
  if (chdir(cwd) != 0) {
    const int error = -errno;
    close(input);
    return error;
  }
  printf("+ SLOP CWD %s %s\n", cwd, command);
  fflush(stdout);
  char *arguments[] = {"slop", "-e", "-c", (char *)command, NULL};
  const int pid = dolly_spawn("/bin/slop", 4, arguments,
                              input, STDOUT_FILENO, STDERR_FILENO);
  close(input);
  int status = pid;
  if (pid >= 0) {
    status = 126;
    const int waited = dolly_wait(pid, &status);
    if (waited != 0) status = waited;
  }
  if (chdir("/") != 0 && status == 0) status = -errno;
  return status;
}

static int execute_slop(char *arguments, int execute) {
  char *command = trim(arguments);
  char *copy = strdup(command);
  if (copy == NULL) return -ENOMEM;
  char *input = copy, *output = copy, *word = NULL, *cwd = "/";
  int result = next_word(&input, &output, &word);
  if (result == 0 && word != NULL && strcmp(word, "CWD") == 0) {
    result = next_word(&input, &output, &cwd);
    if (result == 0 && (cwd == NULL ||
        (strcmp(cwd, "/") != 0 && !valid_absolute_path(cwd)))) result = 2;
    command = trim(command + (input - copy));
    if (result == 0) result = next_word(&input, &output, &word);
  }
  if (result == 0 && (word == NULL || *word == '\0')) result = 2;
  while (result == 0 && word != NULL) result = next_word(&input, &output, &word);
  if (result == 0 && execute) result = run_slop(cwd, command);
  free(copy);
  return result;
}

static int write_inline_file(const char *path, const unsigned char *body,
                             size_t body_length) {
  const int parent_status = mkdir_parents(path, 0);
  if (parent_status != 0) return parent_status;
  return dolly_write_file(path, body, body_length);
}

static int set_entry(Engine *engine, char **words, size_t count) {
  size_t size = 16;
  if (count == 0 || count > 256) return 2;
  for (size_t index = 0; index < count; ++index) {
    const size_t length = strlen(words[index]);
    if (length > 4096 || size + 4 + length > 64 * 1024) return 2;
    size += 4 + length;
  }
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

static int append_recipe(Engine *engine, const char *kind, const char *name,
                         const char *locator, const char digest[65],
                         const char *source);

static int append_text(Buffer *buffer, const char *text) {
  const size_t length = text == NULL ? 0 : strlen(text);
  return length <= UINT32_MAX && append_u32(buffer, (uint32_t)length) == 4 &&
         append_buffer(text, length, buffer) == length ? 0 : -EFBIG;
}

static int take_text(const unsigned char **cursor, const unsigned char *end,
                      char **output) {
  uint32_t length;
  const unsigned char *bytes;
  if (take_layer_u32(cursor, end, &length) != 0 ||
      take_layer_bytes(cursor, end, length, &bytes) != 0 ||
      memchr(bytes, 0, length) != NULL) return -EINVAL;
  *output = strndup((const char *)bytes, length);
  return *output == NULL ? -ENOMEM : 0;
}

// The artifact carries exact completed exports and source provenance. Importing
// it never replays a recipe or recaptures a directory from a later filesystem.
static int write_artifact_receipt(Engine *engine) {
  Buffer receipt = {.limit = MAX_SOURCE_BYTES};
  int result = append_buffer("DOLLYART", 8, &receipt) == 8 &&
               append_u32(&receipt, 3) == 4 &&
               append_u32(&receipt, (uint32_t)engine->recipe_count) == 4 ? 0 : -EFBIG;
  for (size_t index = 0; result == 0 && index < engine->recipe_count; ++index) {
    const RecipeRecord *record = &engine->recipes[index];
    if (append_text(&receipt, record->kind) != 0 ||
        append_text(&receipt, record->name) != 0 ||
        append_text(&receipt, record->locator) != 0 ||
        append_text(&receipt, record->digest) != 0 ||
        append_text(&receipt, record->source) != 0) result = -EFBIG;
  }
  if (result == 0 && append_u32(&receipt, (uint32_t)engine->exports.count) != 4) result = -EFBIG;
  for (size_t index = 0; result == 0 && index < engine->exports.count; ++index) {
    const Object *object = &engine->exports.items[index];
    const char *detail = strcmp(object->type, "ENV") == 0 ? getenv(object->name) : object->detail;
    const size_t count = object->members == NULL ? 0 : object->members->count;
    if (append_text(&receipt, object->type) != 0 ||
        append_text(&receipt, object->name) != 0 ||
        append_text(&receipt, detail) != 0 ||
        append_text(&receipt, object->sha256) != 0 ||
        append_u32(&receipt, (uint32_t)count) != 4) result = -EFBIG;
    for (size_t member = 0; result == 0 && member < count; ++member) {
      result = append_text(&receipt, object->members->items[member]);
    }
  }
  if (result == 0) result = dolly_write_file("/etc/dolly/artifact", receipt.data, receipt.length);
  free(receipt.data);
  if (result == 0) result = append_string(&engine->keep, &engine->keep_count,
                                         &engine->keep_capacity, "/etc/dolly/artifact");
  return result;
}

static int read_artifact_receipt(Engine *engine, const unsigned char *bytes,
                                 size_t length, const char *locator,
                                 const char *expected, Scope *exports) {
  const unsigned char *cursor = bytes, *end = bytes + length, *magic;
  uint32_t version, count;
  if (take_layer_bytes(&cursor, end, 8, &magic) != 0 || memcmp(magic, "DOLLYART", 8) != 0 ||
      take_layer_u32(&cursor, end, &version) != 0 || version != 3 ||
      take_layer_u32(&cursor, end, &count) != 0 || count == 0 || count > 4096) return -EINVAL;
  int result = 0;
  for (uint32_t index = 0; result == 0 && index < count; ++index) {
    char *kind = NULL, *name = NULL, *location = NULL, *digest = NULL, *source = NULL;
    if (take_text(&cursor, end, &kind) != 0 || take_text(&cursor, end, &name) != 0 ||
        take_text(&cursor, end, &location) != 0 || take_text(&cursor, end, &digest) != 0 ||
        take_text(&cursor, end, &source) != 0) result = -EINVAL;
    char actual[65];
    if (result == 0) {
      sha256_bytes(source, strlen(source), actual);
      if ((strcmp(kind, "IMAGE") != 0 && strcmp(kind, "MODULE") != 0) ||
          !valid_module_name(name) || !valid_absolute_path(location) ||
          !valid_sha256(digest) || strcmp(actual, digest) != 0 ||
          strlen(source) > MAX_RECIPE_BYTES) result = -EBADMSG;
    }
    if (result == 0 && index + 1 == count &&
        (strcmp(kind, "IMAGE") != 0 || strcmp(location, locator) != 0 ||
         strcmp(digest, expected) != 0)) result = -EBADMSG;
    if (result == 0) result = append_recipe(engine, kind, name, location, digest, source);
    free(kind); free(name); free(location); free(digest); free(source);
  }
  if (result == 0 && (take_layer_u32(&cursor, end, &count) != 0 || count > 10000)) result = -EINVAL;
  for (uint32_t index = 0; result == 0 && index < count; ++index) {
    Object object = {0};
    uint32_t members = 0;
    if (take_text(&cursor, end, &object.type) != 0 || take_text(&cursor, end, &object.name) != 0 ||
        take_text(&cursor, end, &object.detail) != 0 || take_text(&cursor, end, &object.sha256) != 0 ||
        take_layer_u32(&cursor, end, &members) != 0 || members > MAX_MANIFEST_FILES) result = -EINVAL;
    if (result == 0 && (!valid_object_type(object.type) ||
        (strcmp(object.type, "ENV") == 0 ? !valid_environment_name(object.name) : !valid_object_name(object.name)) ||
        (*object.sha256 != '\0' && !valid_sha256(object.sha256)))) result = -EINVAL;
    if (result == 0) {
      if (*object.sha256 == '\0') { free(object.sha256); object.sha256 = NULL; }
      if (*object.detail == '\0' && strcmp(object.type, "ENV") != 0) {
        free(object.detail); object.detail = NULL;
      }
      object.members = calloc(1, sizeof(*object.members));
      if (object.members == NULL) result = -ENOMEM;
      else object.members->references = 1;
    }
    for (uint32_t member = 0; result == 0 && member < members; ++member) {
      char *path = NULL;
      result = take_text(&cursor, end, &path);
      if (result == 0 && (!valid_absolute_path(path) || forbidden_keep(path))) result = -EINVAL;
      if (result == 0) result = append_string(&object.members->items, &object.members->count,
                                             &object.members->capacity, path);
      free(path);
    }
    if (result == 0 && exports != NULL) result = scope_add_object(exports, &object);
    dispose_object(&object);
  }
  return result == 0 && cursor != end ? -EINVAL : result;
}

static void dispose_artifact(Artifact *artifact) {
  if (artifact->records != NULL) {
    for (uint32_t index = 0; index < artifact->count; ++index) free(artifact->records[index].path);
  }
  free(artifact->records);
  free(artifact->bytes.data);
  memset(artifact, 0, sizeof(*artifact));
}

static const dolly_fs_record *artifact_file(const Artifact *artifact, const char *path) {
  for (uint32_t index = 0; index < artifact->count; ++index) {
    if (strcmp(artifact->records[index].path, path) == 0) return &artifact->records[index];
  }
  return NULL;
}

static int read_artifact(Artifact *artifact, const char *expected) {
  if (strcmp(artifact->recipe_sha256, expected) == 0) return 0;
  dispose_artifact(artifact);
  char path[128];
  snprintf(path, sizeof(path), "/etc/dolly/artifacts/%s.snapshot", expected);
  artifact->bytes.limit = MAX_SOURCE_BYTES;
  int result = read_file_buffer(path, &artifact->bytes);
  if (result != 0) return result;
  const unsigned char *cursor = artifact->bytes.data;
  const unsigned char *end = cursor + artifact->bytes.length, *magic;
  uint32_t version;
  if (take_layer_bytes(&cursor, end, 8, &magic) != 0 || memcmp(magic, "DOLLYSNP", 8) != 0 ||
      take_layer_u32(&cursor, end, &version) != 0 || version != 2 ||
      take_layer_u32(&cursor, end, &artifact->count) != 0 ||
      artifact->count == 0 || artifact->count > MAX_MANIFEST_FILES) return -EINVAL;
  artifact->records = calloc(artifact->count, sizeof(*artifact->records));
  if (artifact->records == NULL) return -ENOMEM;
  for (uint32_t index = 0; index < artifact->count; ++index) {
    dolly_fs_record *record = &artifact->records[index];
    uint32_t path_length;
    uint64_t size;
    const unsigned char *path_bytes;
    if (take_layer_u32(&cursor, end, &record->kind) != 0 ||
        record->kind < DOLLY_FS_DIRECTORY || record->kind > DOLLY_FS_SYMLINK ||
        take_layer_u32(&cursor, end, &path_length) != 0 || path_length == 0 || path_length >= PATH_MAX ||
        take_layer_u64(&cursor, end, &size) != 0 || size > MAX_SOURCE_BYTES ||
        take_layer_bytes(&cursor, end, path_length, &path_bytes) != 0 ||
        take_layer_bytes(&cursor, end, (size_t)size, &record->data) != 0 ||
        memchr(path_bytes, 0, path_length) != NULL) return -EINVAL;
    record->path = strndup((const char *)path_bytes, path_length);
    record->size = (uintptr_t)size;
    if (record->path == NULL) return -ENOMEM;
    if (!valid_absolute_path(record->path) || forbidden_keep(record->path) ||
        (index != 0 && strcmp(artifact->records[index - 1].path, record->path) >= 0) ||
        (record->kind == DOLLY_FS_DIRECTORY && record->size != 0) ||
        (record->kind == DOLLY_FS_SYMLINK && (record->size == 0 || record->size >= PATH_MAX ||
          memchr(record->data, 0, record->size) != NULL))) return -EINVAL;
  }
  const dolly_fs_record *recipe = artifact_file(artifact, "/etc/dolly/Dollyfile");
  if (cursor != end || recipe == NULL || recipe->kind != DOLLY_FS_FILE) return -EINVAL;
  char actual[65];
  sha256_bytes(recipe->data, recipe->size, actual);
  if (strcmp(actual, expected) != 0) return -EBADMSG;
  memcpy(artifact->recipe_sha256, expected, sizeof(artifact->recipe_sha256));
  return 0;
}

static int artifact_has_path(const Artifact *artifact, const char *path) {
  if (strcmp(path, "/") == 0) return artifact->count != 0;
  const size_t length = strlen(path);
  for (uint32_t index = 0; index < artifact->count; ++index) {
    const char *candidate = artifact->records[index].path;
    if (strncmp(candidate, path, length) == 0 &&
        (candidate[length] == '\0' || candidate[length] == '/')) return 1;
  }
  return 0;
}

static int load_artifact(Engine *engine, const char *locator, const char *expected,
                         const char *source, const char *destination, Scope *visible) {
  Artifact *artifact = &engine->artifact;
  int result = read_artifact(artifact, expected);
  const dolly_fs_record *receipt = result == 0 ? artifact_file(artifact, "/etc/dolly/artifact") : NULL;
  if (result == 0 && (receipt == NULL || receipt->kind != DOLLY_FS_FILE)) result = -EINVAL;
  if (result == 0) result = read_artifact_receipt(engine, receipt->data, receipt->size,
                                                 locator, expected, source == NULL ? visible : NULL);
  if (result == 0 && source != NULL && !artifact_has_path(artifact, source)) {
    result = -ENOENT;
  }
  size_t count = 0;
  dolly_fs_record *selected = result == 0 ? calloc(artifact->count, sizeof(*selected)) : NULL;
  if (result == 0 && selected == NULL) result = -ENOMEM;
  for (uint32_t index = 0; result == 0 && index < artifact->count; ++index) {
    const dolly_fs_record *record = &artifact->records[index];
    const char *suffix = record->path;
    if (source != NULL && strcmp(source, "/") != 0) {
      const size_t length = strlen(source);
      if (strncmp(record->path, source, length) != 0 ||
          (record->path[length] != '\0' && record->path[length] != '/')) continue;
      suffix += length;
    }
    const char *prefix = source == NULL || strcmp(destination, "/") == 0 ? "" : destination;
    const size_t length = strlen(prefix) + strlen(suffix) + 1;
    char *path = malloc(length);
    if (path == NULL) { result = -ENOMEM; break; }
    snprintf(path, length, "%s%s", prefix, suffix);
    if (*path == '\0' && record->kind == DOLLY_FS_DIRECTORY) { free(path); continue; }
    if (!valid_absolute_path(path) || forbidden_keep(path)) { free(path); result = -EINVAL; break; }
    selected[count] = *record;
    selected[count++].path = path;
  }
  if (result == 0 && dolly_fs_restore(selected, count, 1) != 0) result = -errno;
  for (size_t index = 0; result == 0 && index < count; ++index) {
    result = append_string(&engine->keep, &engine->keep_count, &engine->keep_capacity, selected[index].path);
  }
  if (result == 0 && source == NULL) {
    for (size_t index = 0; result == 0 && index < visible->count; ++index) {
      const Object *object = &visible->items[index];
      if (strcmp(object->type, "ENV") == 0) {
        result = apply_environment(object->name, object->detail, 0);
        if (result == 0) result = append_string(&engine->environment_names,
            &engine->environment_name_count, &engine->environment_name_capacity, object->name);
      }
    }
    if (result == 0) result = scope_copy(&engine->exports, visible);
  }
  if (result == 0) printf("dollyfile: %s %s (%zu paths)\n", source == NULL ? "FROM" : "COPY FROM", locator, count);
  else fprintf(stderr, "dollyfile: artifact %s: %s\n", locator, strerror(-result));
  for (size_t index = 0; index < count; ++index) free(selected[index].path);
  free(selected);
  return result;
}

static int execute_recipe(Engine *engine, const char *locator,
                          const char *expected_sha256, size_t depth,
                          const Scope *available, int root, int execute,
                          Scope *exports_out);

static int valid_image_locator(const char *value) {
  return strcmp(value, "/Dollyfile") == 0 ||
         (strncmp(value, "/Dollyfile-", 11) == 0 && valid_name(value + 11));
}

static int process_line(Engine *engine, const char *locator, size_t depth,
                        size_t line_number, char *line,
                        const unsigned char *body, size_t body_length,
                        Scope *visible, Scope *exports, char **kind, char **name,
                        int *header_seen, size_t *operations, int execute) {
  strip_comment(line);
  char *text = trim(line);
  if (*text == '\0') return 0;
  char *separator = text;
  while (*separator != '\0' && !isspace((unsigned char)*separator)) ++separator;
  char *arguments = separator;
  if (*separator != '\0') { *separator++ = '\0'; arguments = trim(separator); }
  // Consecutive COPY rows share one decoded input, released before any other
  // operation can mutate files or start a memory-intensive compiler process.
  if (strcmp(text, "COPY") != 0) dispose_artifact(&engine->artifact);
  if (!*header_seen) {
    if (strcmp(text, "DOLLY") != 0 || strcmp(arguments, "3") != 0) {
      fprintf(stderr, "dollyfile: %s:%zu: first declaration must be DOLLY 3\n", locator, line_number);
      return 2;
    }
    *header_seen = 1;
    return 0;
  }
  if (*kind == NULL) {
    char **identity = NULL;
    size_t count = 0;
    const int parsed = split_words(arguments, &identity, &count);
    const char *value = parsed == 0 && count == 1 ? identity[0] : "";
    free(identity);
    if ((strcmp(text, "IMAGE") != 0 && strcmp(text, "MODULE") != 0) ||
        (strcmp(text, "IMAGE") == 0 ? !valid_name(value) : !valid_module_name(value))) return 2;
    *kind = strdup(text);
    *name = strdup(value);
    return *kind == NULL || *name == NULL ? -ENOMEM : 0;
  }
  int result = 0;
  char **words = NULL;
  size_t count = 0;
  const int image = strcmp(*kind, "IMAGE") == 0;
  if (image && engine->entry_count != 0) result = 2;
  else if (strcmp(text, "USE") == 0) {
    result = split_words(arguments, &words, &count);
    if (result == 0 && (count != 3 || strcmp(words[0], "HOST") != 0 ||
        !valid_module_locator(words[1]) || !valid_sha256(words[2]))) result = 2;
    if (result == 0) {
      Scope child = {0}, child_available = {0};
      result = scope_copy(&child_available, visible);
      if (result == 0) result = scope_copy(&child_available, exports);
      if (result == 0) result = execute_recipe(engine, words[1], words[2], depth + 1,
                                               &child_available, 0, execute, &child);
      dispose_scope(&child_available);
      if (result == 0) result = scope_copy(visible, &child);
      if (result == 0 && image) {
        result = scope_copy(&engine->exports, &child);
        for (size_t index = 0; result == 0 && execute && index < child.count; ++index) {
          result = retain_export(engine, &child.items[index]);
        }
      }
      dispose_scope(&child);
    }
  } else if (strcmp(text, "FROM") == 0 || strcmp(text, "COPY") == 0) {
    const int copy = strcmp(text, "COPY") == 0;
    result = split_words(arguments, &words, &count);
    const size_t offset = copy ? 1 : 0;
    if (result == 0 && (count != (copy ? 6 : 3) ||
        (copy && strcmp(words[0], "FROM") != 0) || (!copy && (!image || *operations != 0)) ||
        strcmp(words[offset], "HOST") != 0 || !valid_image_locator(words[offset + 1]) ||
        !valid_sha256(words[offset + 2]))) result = 2;
    if (result == 0 && copy &&
        ((strcmp(words[4], "/") != 0 && !valid_absolute_path(words[4])) ||
         (strcmp(words[5], "/") != 0 && !valid_absolute_path(words[5])))) result = 2;
    if (result == 0 && execute) result = load_artifact(engine, words[offset + 1], words[offset + 2],
                                                       copy ? words[4] : NULL, copy ? words[5] : NULL, visible);
  } else if (strcmp(text, "REQUIRES") == 0) {
    result = split_words(arguments, &words, &count);
    if (result == 0 && (count != 2 || !valid_object_type(words[0]) ||
        (strcmp(words[0], "ENV") == 0 ? !valid_environment_name(words[1]) : !valid_object_name(words[1])))) result = 2;
    if (result == 0 && execute) {
      if (strcmp(words[0], "ENV") == 0) result = getenv(words[1]) == NULL ? -ENOENT : 0;
      else if (strcmp(words[0], "TOOL") == 0) {
        char *path = NULL;
        result = resolve_tool(words[1], &path);
        free(path);
      } else {
        const Object *provider = scope_find(exports, words[0], words[1]);
        if (provider == NULL) provider = scope_find(visible, words[0], words[1]);
        result = provider == NULL ? -ENOENT :
            validate_export(provider->type, provider->name, provider->detail, provider->sha256, 0);
      }
      if (result != 0) fprintf(stderr, "dollyfile: required %s %s is unavailable\n", words[0], words[1]);
    }
  } else if (strcmp(text, "EXPORTS") == 0) {
    result = split_words(arguments, &words, &count);
    if (result == 0 && (count < 2 || !valid_object_type(words[0]) ||
        (strcmp(words[0], "ENV") == 0 ? !valid_environment_name(words[1]) : !valid_object_name(words[1])))) result = 2;
    const char *detail = NULL, *sha256 = NULL;
    int append = 0;
    if (result == 0) {
      if (strcmp(words[0], "TOOL") == 0) {
        if (count != 2 && (count != 3 || !valid_sha256(words[2]))) result = 2;
        else if (count == 3) sha256 = words[2];
      } else if (strcmp(words[0], "ENV") == 0) {
        if (count == 3) detail = words[2];
        else if (count == 4 && strcmp(words[2], "APPEND") == 0) { detail = words[3]; append = 1; }
        else if (count != 2) result = 2;
      } else {
        if (count != 3 || !valid_absolute_path(words[2]) || forbidden_keep(words[2])) result = 2;
        else detail = words[2];
      }
    }
    if (result == 0 && strcmp(words[0], "ENV") == 0) {
      if (detail != NULL) result = apply_environment(words[1], detail, append);
      if (result == 0) result = append_string(&engine->environment_names, &engine->environment_name_count,
                                               &engine->environment_name_capacity, words[1]);
      detail = getenv(words[1]);
    }
    if (result == 0) result = scope_add(exports, words[0], words[1], detail, sha256);
  } else if (strcmp(text, "SOURCE") == 0) {
    result = split_words(arguments, &words, &count);
    if (result == 0 && (count != 4 || (strcmp(words[0], "HOST") != 0 && strcmp(words[0], "URL") != 0) ||
        (strcmp(words[0], "HOST") == 0 && !valid_absolute_path(words[1])) ||
        (strcmp(words[0], "URL") == 0 && ((strncmp(words[1], "https://", 8) != 0 &&
          strncmp(words[1], "http://", 7) != 0) || strchr(words[1], '#') != NULL)) ||
        !valid_absolute_path(words[2]) || !valid_sha256(words[3]))) result = 2;
    if (result == 0 && execute) result = fetch_source(engine, words[0], words[1], words[2], words[3]);
  } else if (strcmp(text, "SLOP") == 0) {
    result = execute_slop(arguments, execute);
  } else if (strcmp(text, "FILE") == 0) {
    result = split_words(arguments, &words, &count);
    if (result == 0 && (count != 1 || !valid_absolute_path(words[0]) ||
        (forbidden_keep(words[0]) && strncmp(words[0], "/tmp/", 5) != 0))) result = 2;
    if (result == 0 && execute && body != NULL) result = write_inline_file(words[0], body, body_length);
    if (result == 0 && execute) result = validate_export("FILE", "FILE", words[0], NULL, 0);
    if (result == 0 && !forbidden_keep(words[0])) result = append_string(&engine->keep,
        &engine->keep_count, &engine->keep_capacity, words[0]);
  } else if (strcmp(text, "FOLDER") == 0) {
    result = split_words(arguments, &words, &count);
    if (result == 0 && (count != 1 || !valid_absolute_path(words[0]) || forbidden_keep(words[0]))) result = 2;
    if (result == 0 && execute) result = validate_export("FOLDER", "FOLDER", words[0], NULL, 0);
    if (result == 0 && execute) result = collect_tree(engine, words[0]);
  } else if (strcmp(text, "ENTRY") == 0) {
    result = split_words(arguments, &words, &count);
    if (result == 0 && (!image || count == 0 || !valid_absolute_path(words[0]))) result = 2;
    if (result == 0) result = set_entry(engine, words, count);
  } else result = 2;
  ++*operations;
  free(words);
  if (result != 0) fprintf(stderr, "dollyfile: %s:%zu: %s failed (%d)\n", locator, line_number, text, result);
  return result;
}

static int finish_exports(Scope *exports, int execute) {
  for (size_t index = 0; index < exports->count; ++index) {
    Object *object = &exports->items[index];
    if (strcmp(object->type, "ENV") == 0) {
      const char *value = getenv(object->name);
      free(object->detail);
      object->detail = value == NULL ? NULL : strdup(value);
      if (execute && object->detail == NULL) return -ENOENT;
      continue;
    }
    if (execute && object->members == NULL) {
      const int result = capture_export_members(object);
      if (result != 0) {
        fprintf(stderr, "dollyfile: missing exported %s %s: %s\n", object->type, object->name, strerror(-result));
        return result;
      }
    }
  }
  return 0;
}

static int append_recipe(Engine *engine, const char *kind, const char *name,
                         const char *locator, const char digest[65],
                         const char *source) {
  for (size_t index = 0; index < engine->recipe_count; ++index) {
    const RecipeRecord *record = &engine->recipes[index];
    if (strcmp(record->locator, locator) == 0) {
      return strcmp(record->digest, digest) == 0 ? 0 : -EBADMSG;
    }
  }
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
  size_t operations = 0;
  Scope visible = {0};
  result = scope_copy(&visible, available);
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
      char *physical = strndup((char *)recipe.data + cursor, end - cursor);
      if (physical == NULL) { result = -ENOMEM; break; }
      strip_comment(physical);
      size_t length = strlen(physical);
      while (length != 0 && (physical[length - 1] == ' ' || physical[length - 1] == '\t')) --length;
      continued = length != 0 && physical[length - 1] == '\\';
      if (continued) --length;
      if (logical.length != 0 && append_buffer(" ", 1, &logical) != 1) result = -ENOMEM;
      if (result == 0 && append_buffer(physical, length, &logical) != length) result = -EFBIG;
      free(physical);
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
                            body.data, body.length, &visible, exports_out,
                            &kind, &name, &header_seen, &operations, execute);
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
  if (result == 0) result = finish_exports(exports_out, execute);
  if (result == 0 && root) {
    result = scope_copy(&engine->exports, exports_out);
    for (size_t index = 0; result == 0 && execute && index < exports_out->count; ++index) {
      result = retain_export(engine, &exports_out->items[index]);
    }
    for (size_t index = 0; result == 0 && index < engine->environment_name_count; ++index) {
      const char *variable = engine->environment_names[index];
      result = scope_add(&engine->exports, "ENV", variable, getenv(variable), NULL);
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
  dispose_scope(&visible);
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
  if (engine->entry_count == 0 || engine->selected_image == NULL) {
    fprintf(stderr, "dollyfile: selected image has no ENTRY\n");
    return 1;
  }
  struct stat entry_metadata;
  if (stat(engine->entry[0], &entry_metadata) != 0 || !S_ISREG(entry_metadata.st_mode)) {
    fprintf(stderr, "dollyfile: ENTRY is missing or not a file: %s\n", engine->entry[0]);
    return 1;
  }
  qsort(engine->keep, engine->keep_count, sizeof(*engine->keep), compare_strings);
  const char *entry = engine->entry[0];
  char *resolved_entry = realpath(entry, NULL);
  const int retained = resolved_entry != NULL &&
      bsearch(&entry, engine->keep, engine->keep_count, sizeof(*engine->keep), compare_strings) != NULL &&
      bsearch(&resolved_entry, engine->keep, engine->keep_count, sizeof(*engine->keep), compare_strings) != NULL;
  free(resolved_entry);
  if (!retained) {
    fprintf(stderr, "dollyfile: ENTRY and its target must be retained by module exports: %s\n", entry);
    return 1;
  }
  if (write_control_files(engine) != 0 || write_artifact_receipt(engine) != 0) return 1;
  qsort(engine->keep, engine->keep_count, sizeof(*engine->keep), compare_strings);
  Buffer manifest = {.limit = 8 * 1024 * 1024};
  for (size_t index = 0; index < engine->keep_count; ++index) {
    struct stat metadata;
    if (lstat(engine->keep[index], &metadata) != 0 && (errno == ENOENT || errno == ENOTDIR)) continue;
    if (!dolly_fs_valid_path(engine->keep[index]) || strpbrk(engine->keep[index], "\\\r\n") != NULL ||
        lstat(engine->keep[index], &metadata) != 0 ||
        (!S_ISREG(metadata.st_mode) && !S_ISDIR(metadata.st_mode) && !S_ISLNK(metadata.st_mode))) {
      fprintf(stderr, "dollyfile: retained input is missing or has an unsupported path kind: %s\n",
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
  printf("dollyfile: image %s complete; retained %zu paths\n",
         engine->selected_image, engine->keep_count);
  return 0;
}

static void dispose_engine(Engine *engine) {
  dispose_artifact(&engine->artifact);
  dispose_scope(&engine->exports);
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
  for (size_t index = 0; index < engine->environment_name_count; ++index) {
    free(engine->environment_names[index]);
  }
  free(engine->environment_names);
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
  Scope available = {0};
  Scope exports = {0};
  int status = execute_recipe(&engine, argv[1], NULL, 0,
                              &available, 1, 1, &exports);
  dispose_scope(&exports);
  if (status == 0) status = seal_manifest(&engine);
  dispose_engine(&engine);
  if (status < 0) {
    fprintf(stderr, "dollyfile: execution failed: %s (%d)\n",
            strerror(-status), status);
    return 1;
  }
  return status;
}
