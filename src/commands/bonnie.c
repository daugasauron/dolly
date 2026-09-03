#define _POSIX_C_SOURCE 200809L
#define CURL_DISABLE_TYPECHECK
#include <curl/curl.h>

#include <dolly/runtime.h>

#include <ctype.h>
#include <errno.h>
#include <fcntl.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

enum {
  BONNIE_MAX_INDEX_BYTES = 32 * 1024 * 1024,
  BONNIE_MAX_REQUIREMENTS = 128,
  BONNIE_MAX_LINE = 8192,
  BONNIE_FETCH_ATTEMPTS = 3,
};

static const char helper_path[] = "/usr/lib/bonnie/bonnie.py";

typedef struct {
  char *bytes;
  size_t length;
  size_t capacity;
} Buffer;

typedef struct {
  char *name;
  char *module;
  char *function;
  char *staged_path;
  char *published_path;
} EntryPoint;

typedef struct {
  char *name;
  char *version;
  char *kind;
  char *url;
  char *filename;
  char *sha256;
  char *wheel_path;
  char *constraint;
  char **requirements;
  size_t requirement_count;
  char **build_requirements;
  size_t build_requirement_count;
  EntryPoint *entry_points;
  size_t entry_point_count;
  int already_installed;
} Plan;

typedef struct {
  char **items;
  size_t count;
  size_t position;
} RequirementQueue;

static void usage(FILE *stream) {
  fputs(
      "usage: bonnie install [--target DIRECTORY] [--no-deps] [-r FILE] PACKAGE...\n"
      "       bonnie install [--target DIRECTORY] [--no-deps] HTTPS-WHEEL-URL...\n"
      "       bonnie list\n"
      "       bonnie freeze\n"
      "       bonnie show PACKAGE...\n"
      "       bonnie check\n"
      "       bonnie --version\n\n"
      "Install compatible wheels or build verified source distributions inside Dolly.\n"
      "Runtime and PEP 517 build dependencies, constraints, extras, markers, hashes,\n"
      "standard wheel data, and Python console scripts are supported.\n",
      stream);
}

static size_t append_memory(char *bytes, size_t size, size_t count,
                            void *context) {
  Buffer *buffer = context;
  if (size != 0 && count > SIZE_MAX / size) return 0;
  const size_t length = size * count;
  if (length > BONNIE_MAX_INDEX_BYTES - buffer->length) return 0;
  const size_t needed = buffer->length + length + 1;
  if (needed > buffer->capacity) {
    size_t capacity = buffer->capacity == 0 ? 4096 : buffer->capacity;
    while (capacity < needed) {
      if (capacity > (BONNIE_MAX_INDEX_BYTES + 1) / 2) {
        capacity = BONNIE_MAX_INDEX_BYTES + 1;
        break;
      }
      capacity *= 2;
    }
    char *replacement = realloc(buffer->bytes, capacity);
    if (replacement == NULL) return 0;
    buffer->bytes = replacement;
    buffer->capacity = capacity;
  }
  memcpy(buffer->bytes + buffer->length, bytes, length);
  buffer->length += length;
  buffer->bytes[buffer->length] = '\0';
  return length;
}

static int fetch_metadata(const char *url, Buffer *response) {
  CURL *curl = curl_easy_init();
  struct curl_slist *headers = NULL;
  if (curl == NULL) return -1;
  headers = curl_slist_append(headers, "Accept: application/json");
  curl_easy_setopt(curl, CURLOPT_URL, url);
  curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
  curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 1L);
  curl_easy_setopt(curl, CURLOPT_FAILONERROR, 1L);
  curl_easy_setopt(curl, CURLOPT_USERAGENT, "bonnie/0.6 (Dolly wasm64)");
  curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, append_memory);
  curl_easy_setopt(curl, CURLOPT_WRITEDATA, response);
  CURLcode result = CURLE_FAILED_INIT;
  for (unsigned attempt = 1; attempt <= BONNIE_FETCH_ATTEMPTS; ++attempt) {
    response->length = 0;
    if (response->bytes != NULL) response->bytes[0] = '\0';
    result = curl_easy_perform(curl);
    if (result == CURLE_OK) break;
    if (attempt != BONNIE_FETCH_ATTEMPTS) {
      fprintf(stderr,
              "bonnie: PyPI lookup failed (%s); retrying %u/%u\n",
              curl_easy_strerror(result), attempt + 1, BONNIE_FETCH_ATTEMPTS);
      dolly_sleep(1);
    }
  }
  curl_slist_free_all(headers);
  curl_easy_cleanup(curl);
  if (result != CURLE_OK) {
    fprintf(stderr, "bonnie: PyPI lookup failed: %s\n",
            curl_easy_strerror(result));
    return -1;
  }
  return 0;
}

static int download_wheel_once(const char *url, const char *path,
                               CURLcode *curl_result) {
  FILE *output = fopen(path, "wb");
  if (output == NULL) return -1;
  CURL *curl = curl_easy_init();
  if (curl == NULL) {
    fclose(output);
    errno = ENOMEM;
    return -1;
  }
  curl_easy_setopt(curl, CURLOPT_URL, url);
  curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 1L);
  curl_easy_setopt(curl, CURLOPT_FAILONERROR, 1L);
  curl_easy_setopt(curl, CURLOPT_USERAGENT, "bonnie/0.6 (Dolly wasm64)");
  curl_easy_setopt(curl, CURLOPT_WRITEDATA, output);
  *curl_result = curl_easy_perform(curl);
  curl_easy_cleanup(curl);
  const int close_result = fclose(output);
  if (*curl_result != CURLE_OK || close_result != 0) {
    remove(path);
    if (*curl_result == CURLE_OK) errno = EIO;
    return -1;
  }
  return 0;
}

static int download_wheel(const char *url, const char *path) {
  CURLcode result = CURLE_FAILED_INIT;
  for (unsigned attempt = 1; attempt <= BONNIE_FETCH_ATTEMPTS; ++attempt) {
    if (download_wheel_once(url, path, &result) == 0) return 0;
    if (attempt != BONNIE_FETCH_ATTEMPTS) {
      fprintf(stderr, "bonnie: wheel download failed (%s); retrying %u/%u\n",
              curl_easy_strerror(result), attempt + 1, BONNIE_FETCH_ATTEMPTS);
      dolly_sleep(1);
    }
  }
  fprintf(stderr, "bonnie: wheel download failed: %s\n",
          curl_easy_strerror(result));
  return -1;
}

static int write_buffer(const char *path, const Buffer *buffer) {
  FILE *output = fopen(path, "wb");
  if (output == NULL) return -1;
  int result = fwrite(buffer->bytes, 1, buffer->length, output) == buffer->length
                   ? 0
                   : -1;
  if (fclose(output) != 0) result = -1;
  if (result != 0) remove(path);
  return result;
}

static int run_helper(int argc, char **arguments) {
  const int pid = dolly_spawn("/usr/bin/python", argc, arguments,
                              STDIN_FILENO, STDOUT_FILENO, STDERR_FILENO);
  if (pid < 0) {
    fprintf(stderr, "bonnie: could not start Python helper: %s\n",
            strerror(-pid));
    return 1;
  }
  int status = 1;
  if (dolly_wait(pid, &status) != 0) {
    fputs("bonnie: could not collect Python helper\n", stderr);
    return 1;
  }
  return status;
}

static int helper_metadata(const char *operation, const char *specification,
                           const char *metadata, const char *output) {
  char *arguments[] = {
      "/usr/bin/python", (char *)helper_path, (char *)operation,
      (char *)specification, (char *)metadata, (char *)output, NULL,
  };
  return run_helper(6, arguments);
}

static int helper_verify(const char *specification, const char *artifact,
                         const char *sha256, const char *kind,
                         const char *output) {
  char *arguments[] = {
      "/usr/bin/python", (char *)helper_path, "verify",
      (char *)specification, (char *)artifact,
      (char *)(sha256 == NULL ? "-" : sha256), (char *)kind,
      (char *)output, NULL,
  };
  return run_helper(8, arguments);
}

static int helper_build(const char *source, const char *wheel) {
  char *arguments[] = {
      "/usr/bin/python", (char *)helper_path, "build",
      (char *)source, (char *)wheel, NULL,
  };
  return run_helper(5, arguments);
}

static int helper_install(const char *wheel, const char *target,
                          const char *sha256) {
  char *arguments[] = {
      "/usr/bin/python", (char *)helper_path, "install", (char *)wheel,
      (char *)target, (char *)(sha256 == NULL ? "-" : sha256), NULL,
  };
  return run_helper(6, arguments);
}

static int helper_stage(const char *operation, const char *root) {
  char *arguments[] = {
      "/usr/bin/python", (char *)helper_path, (char *)operation,
      (char *)root, NULL,
  };
  return run_helper(4, arguments);
}

static int helper_satisfies(const char *specification, const char *version) {
  char *arguments[] = {
      "/usr/bin/python", (char *)helper_path, "satisfies",
      (char *)specification, (char *)version, NULL,
  };
  return run_helper(5, arguments);
}

static int helper_installed(const char *specification) {
  char *arguments[] = {
      "/usr/bin/python", (char *)helper_path, "installed",
      (char *)specification, NULL,
  };
  return run_helper(4, arguments);
}

static void dispose_plan(Plan *plan) {
  free(plan->name);
  free(plan->version);
  free(plan->kind);
  free(plan->url);
  free(plan->filename);
  free(plan->sha256);
  if (plan->wheel_path != NULL) remove(plan->wheel_path);
  free(plan->wheel_path);
  free(plan->constraint);
  for (size_t index = 0; index < plan->requirement_count; ++index) {
    free(plan->requirements[index]);
  }
  free(plan->requirements);
  for (size_t index = 0; index < plan->build_requirement_count; ++index) {
    free(plan->build_requirements[index]);
  }
  free(plan->build_requirements);
  for (size_t index = 0; index < plan->entry_point_count; ++index) {
    EntryPoint *entry = &plan->entry_points[index];
    free(entry->name);
    free(entry->module);
    free(entry->function);
    if (entry->staged_path != NULL) remove(entry->staged_path);
    free(entry->staged_path);
    free(entry->published_path);
  }
  free(plan->entry_points);
  memset(plan, 0, sizeof(*plan));
}

static char *copy_string(const char *value) {
  const size_t length = strlen(value);
  char *copy = malloc(length + 1);
  if (copy != NULL) memcpy(copy, value, length + 1);
  return copy;
}

static int set_once(char **target, const char *value) {
  if (*target != NULL || value[0] == '\0') return -1;
  *target = copy_string(value);
  return *target == NULL ? -1 : 0;
}

static int append_requirement(Plan *plan, const char *value) {
  if (value[0] == '\0' || plan->requirement_count == BONNIE_MAX_REQUIREMENTS) {
    return -1;
  }
  char **grown = realloc(plan->requirements,
                         (plan->requirement_count + 1) * sizeof(char *));
  if (grown == NULL) return -1;
  plan->requirements = grown;
  plan->requirements[plan->requirement_count] = copy_string(value);
  if (plan->requirements[plan->requirement_count] == NULL) return -1;
  ++plan->requirement_count;
  return 0;
}

static int append_build_requirement(Plan *plan, const char *value) {
  if (value[0] == '\0' ||
      plan->build_requirement_count == BONNIE_MAX_REQUIREMENTS) return -1;
  char **grown = realloc(
      plan->build_requirements,
      (plan->build_requirement_count + 1) * sizeof(char *));
  if (grown == NULL) return -1;
  plan->build_requirements = grown;
  plan->build_requirements[plan->build_requirement_count] = copy_string(value);
  if (plan->build_requirements[plan->build_requirement_count] == NULL) return -1;
  ++plan->build_requirement_count;
  return 0;
}

static char *combine_requirements(const char *left, const char *right,
                                  unsigned sequence) {
  char output_path[96];
  snprintf(output_path, sizeof(output_path),
           "/tmp/bonnie-%u.constraint", sequence);
  remove(output_path);
  char *arguments[] = {
      "/usr/bin/python", (char *)helper_path, "combine", (char *)left,
      (char *)right, output_path, NULL,
  };
  if (run_helper(6, arguments) != 0) {
    remove(output_path);
    return NULL;
  }
  FILE *input = fopen(output_path, "r");
  if (input == NULL) {
    remove(output_path);
    return NULL;
  }
  char line[BONNIE_MAX_LINE];
  char *combined = NULL;
  if (fgets(line, sizeof(line), input) != NULL) {
    size_t length = strlen(line);
    while (length != 0 && (line[length - 1] == '\n' ||
                           line[length - 1] == '\r')) {
      line[--length] = '\0';
    }
    if (length != 0 && fgetc(input) == EOF && !ferror(input)) {
      combined = copy_string(line);
    }
  }
  if (fclose(input) != 0) {
    free(combined);
    combined = NULL;
  }
  remove(output_path);
  return combined;
}

static int append_entry_point(Plan *plan, char *value) {
  char *module = strchr(value, '\t');
  if (module == NULL) return -1;
  *module++ = '\0';
  char *function = strchr(module, '\t');
  if (function == NULL || strchr(function + 1, '\t') != NULL) return -1;
  *function++ = '\0';
  if (value[0] == '\0' || module[0] == '\0' || function[0] == '\0' ||
      plan->entry_point_count == BONNIE_MAX_REQUIREMENTS) return -1;
  for (const char *cursor = value; *cursor != '\0'; ++cursor) {
    if (!(isalnum((unsigned char)*cursor) || *cursor == '.' ||
          *cursor == '_' || *cursor == '-')) return -1;
  }
  const char *identifiers[] = {module, function};
  for (size_t field = 0; field < 2; ++field) {
    int segment_start = 1;
    for (const char *cursor = identifiers[field]; *cursor != '\0'; ++cursor) {
      if (*cursor == '.') {
        if (segment_start) return -1;
        segment_start = 1;
      } else if ((segment_start &&
                  !(isalpha((unsigned char)*cursor) || *cursor == '_')) ||
                 (!segment_start &&
                  !(isalnum((unsigned char)*cursor) || *cursor == '_'))) {
        return -1;
      } else {
        segment_start = 0;
      }
    }
    if (segment_start) return -1;
  }
  EntryPoint *grown = realloc(
      plan->entry_points,
      (plan->entry_point_count + 1) * sizeof(EntryPoint));
  if (grown == NULL) return -1;
  plan->entry_points = grown;
  EntryPoint *entry = &plan->entry_points[plan->entry_point_count];
  memset(entry, 0, sizeof(*entry));
  entry->name = copy_string(value);
  entry->module = copy_string(module);
  entry->function = copy_string(function);
  if (entry->name == NULL || entry->module == NULL || entry->function == NULL) {
    free(entry->name);
    free(entry->module);
    free(entry->function);
    memset(entry, 0, sizeof(*entry));
    return -1;
  }
  ++plan->entry_point_count;
  return 0;
}

static int read_plan(const char *path, Plan *plan) {
  FILE *input = fopen(path, "r");
  if (input == NULL) return -1;
  char line[BONNIE_MAX_LINE];
  if (fgets(line, sizeof(line), input) == NULL ||
      strcmp(line, "BONNIE 1\n") != 0) {
    fclose(input);
    errno = EPROTO;
    return -1;
  }
  int result = 0;
  while (fgets(line, sizeof(line), input) != NULL) {
    const size_t length = strlen(line);
    if (length == 0 || line[length - 1] != '\n') {
      result = -1;
      errno = EOVERFLOW;
      break;
    }
    line[length - 1] = '\0';
    if (strncmp(line, "name ", 5) == 0) result = set_once(&plan->name, line + 5);
    else if (strncmp(line, "version ", 8) == 0) {
      result = set_once(&plan->version, line + 8);
    } else if (strncmp(line, "kind ", 5) == 0) {
      result = set_once(&plan->kind, line + 5);
    } else if (strncmp(line, "url ", 4) == 0) {
      result = set_once(&plan->url, line + 4);
    } else if (strncmp(line, "filename ", 9) == 0) {
      result = set_once(&plan->filename, line + 9);
    } else if (strncmp(line, "sha256 ", 7) == 0) {
      result = set_once(&plan->sha256, line + 7);
    } else if (strncmp(line, "requirement ", 12) == 0) {
      result = append_requirement(plan, line + 12);
    } else if (strncmp(line, "build-requirement ", 18) == 0) {
      result = append_build_requirement(plan, line + 18);
    } else if (strncmp(line, "entrypoint ", 11) == 0) {
      result = append_entry_point(plan, line + 11);
    } else {
      result = -1;
      errno = EPROTO;
    }
    if (result != 0) break;
  }
  if (ferror(input)) result = -1;
  if (fclose(input) != 0) result = -1;
  if (result != 0 || plan->name == NULL || plan->version == NULL) {
    dispose_plan(plan);
    if (errno == 0) errno = EPROTO;
    return -1;
  }
  return 0;
}

static char *normalized_package_name(const char *specification) {
  size_t length = 0;
  while (isalnum((unsigned char)specification[length]) ||
         specification[length] == '-' || specification[length] == '_' ||
         specification[length] == '.') {
    ++length;
  }
  if (length == 0) return NULL;
  char *name = malloc(length + 1);
  if (name == NULL) return NULL;
  size_t output = 0;
  int separator = 0;
  for (size_t index = 0; index < length; ++index) {
    const unsigned char byte = (unsigned char)specification[index];
    if (byte == '-' || byte == '_' || byte == '.') {
      separator = output != 0;
    } else {
      if (separator) name[output++] = '-';
      name[output++] = (char)tolower(byte);
      separator = 0;
    }
  }
  name[output] = '\0';
  if (output == 0) {
    free(name);
    return NULL;
  }
  return name;
}

static int portable_wheel_url(const char *url) {
  const char *end = strchr(url, '?');
  if (end == NULL) end = strchr(url, '#');
  if (end == NULL) end = url + strlen(url);
  static const char suffix[] = "-none-any.whl";
  const size_t length = (size_t)(end - url);
  return length >= sizeof(suffix) - 1 &&
         memcmp(end - (sizeof(suffix) - 1), suffix, sizeof(suffix) - 1) == 0;
}

static int wheel_artifact_url(const char *url) {
  const char *end = strchr(url, '?');
  if (end == NULL) end = strchr(url, '#');
  if (end == NULL) end = url + strlen(url);
  static const char suffix[] = ".whl";
  const size_t length = (size_t)(end - url);
  return length >= sizeof(suffix) - 1 &&
         memcmp(end - (sizeof(suffix) - 1), suffix, sizeof(suffix) - 1) == 0;
}

static int source_archive_url(const char *url) {
  const char *end = strchr(url, '?');
  if (end == NULL) end = strchr(url, '#');
  if (end == NULL) end = url + strlen(url);
  const size_t length = (size_t)(end - url);
  static const char tar_suffix[] = ".tar.gz";
  static const char zip_suffix[] = ".zip";
  return (length >= sizeof(tar_suffix) - 1 &&
          memcmp(end - (sizeof(tar_suffix) - 1), tar_suffix,
                 sizeof(tar_suffix) - 1) == 0) ||
         (length >= sizeof(zip_suffix) - 1 &&
          memcmp(end - (sizeof(zip_suffix) - 1), zip_suffix,
                 sizeof(zip_suffix) - 1) == 0);
}

static int valid_sha256(const char *value) {
  if (value == NULL || strlen(value) != 64) return 0;
  for (size_t index = 0; index < 64; ++index) {
    if (!isdigit((unsigned char)value[index]) &&
        !(value[index] >= 'a' && value[index] <= 'f')) return 0;
  }
  return 1;
}

static int approved_pypi_artifact_url(const char *url, const char *kind) {
  static const char prefix[] = "https://files.pythonhosted.org/packages/";
  return strncmp(url, prefix, sizeof(prefix) - 1) == 0 &&
         strchr(url, '?') == NULL && strchr(url, '#') == NULL &&
         ((strcmp(kind, "wheel") == 0 && wheel_artifact_url(url)) ||
          (strcmp(kind, "sdist") == 0 && source_archive_url(url)));
}

static char *wheel_filename(const char *url) {
  const char *end = strchr(url, '?');
  if (end == NULL) end = strchr(url, '#');
  if (end == NULL) end = url + strlen(url);
  const char *start = end;
  while (start != url && start[-1] != '/') --start;
  const size_t length = (size_t)(end - start);
  if (length == 0 || length > 512) return NULL;
  char *filename = malloc(length + 1);
  if (filename == NULL) return NULL;
  for (size_t index = 0; index < length; ++index) {
    const unsigned char byte = (unsigned char)start[index];
    if (!(isalnum(byte) || byte == '-' || byte == '_' || byte == '.' ||
          byte == '+')) {
      free(filename);
      return NULL;
    }
    filename[index] = (char)byte;
  }
  filename[length] = '\0';
  return filename;
}

static int queue_append(RequirementQueue *queue, const char *requirement) {
  for (size_t index = 0; index < queue->count; ++index) {
    if (strcmp(queue->items[index], requirement) == 0) return 0;
  }
  if (queue->count == BONNIE_MAX_REQUIREMENTS) {
    fputs("bonnie: dependency graph exceeds 128 requirements\n", stderr);
    return -1;
  }
  char **grown = realloc(queue->items, (queue->count + 1) * sizeof(char *));
  if (grown == NULL) return -1;
  queue->items = grown;
  queue->items[queue->count] = copy_string(requirement);
  if (queue->items[queue->count] == NULL) return -1;
  ++queue->count;
  return 0;
}

static int queue_requirements_file(RequirementQueue *queue, const char *path) {
  FILE *input = fopen(path, "r");
  if (input == NULL) {
    fprintf(stderr, "bonnie: could not read requirements file %s: %s\n",
            path, strerror(errno));
    return -1;
  }
  char line[BONNIE_MAX_LINE];
  unsigned line_number = 0;
  int result = 0;
  while (fgets(line, sizeof(line), input) != NULL) {
    ++line_number;
    size_t length = strlen(line);
    if (length == sizeof(line) - 1 && line[length - 1] != '\n' && !feof(input)) {
      fprintf(stderr, "bonnie: %s:%u: requirement line is too long\n",
              path, line_number);
      result = -1;
      break;
    }
    while (length != 0 && (line[length - 1] == '\n' ||
                           line[length - 1] == '\r')) {
      line[--length] = '\0';
    }
    char *requirement = line;
    while (isspace((unsigned char)*requirement)) ++requirement;
    for (char *cursor = requirement; *cursor != '\0'; ++cursor) {
      if (*cursor == '#' &&
          (cursor == requirement || isspace((unsigned char)cursor[-1]))) {
        *cursor = '\0';
        break;
      }
    }
    char *end = requirement + strlen(requirement);
    while (end != requirement && isspace((unsigned char)end[-1])) --end;
    *end = '\0';
    if (requirement[0] == '\0') continue;
    if (requirement[0] == '-') {
      fprintf(stderr,
              "bonnie: %s:%u: requirements-file options are unsupported: %s\n",
              path, line_number, requirement);
      result = -1;
      break;
    }
    if (queue_append(queue, requirement) != 0) {
      fprintf(stderr, "bonnie: %s:%u: could not queue requirement\n",
              path, line_number);
      result = -1;
      break;
    }
  }
  if (ferror(input)) {
    fprintf(stderr, "bonnie: could not read requirements file %s\n", path);
    result = -1;
  }
  if (fclose(input) != 0) result = -1;
  return result;
}

static void dispose_queue(RequirementQueue *queue) {
  for (size_t index = 0; index < queue->count; ++index) free(queue->items[index]);
  free(queue->items);
}

static ssize_t seen_project(char **names, size_t count, const char *name) {
  for (size_t index = 0; index < count; ++index) {
    if (strcmp(names[index], name) == 0) return (ssize_t)index;
  }
  return -1;
}

static int make_metadata_plan(const char *specification, unsigned sequence,
                              Plan *plan) {
  char *name = normalized_package_name(specification);
  if (name == NULL) {
    fprintf(stderr, "bonnie: unsupported requirement: %s\n", specification);
    return -1;
  }
  char metadata_path[80];
  char selection_path[80];
  char plan_path[80];
  snprintf(metadata_path, sizeof(metadata_path), "/tmp/bonnie-%u.json", sequence);
  snprintf(selection_path, sizeof(selection_path), "/tmp/bonnie-%u.select", sequence);
  snprintf(plan_path, sizeof(plan_path), "/tmp/bonnie-%u.plan", sequence);

  char url[1024];
  snprintf(url, sizeof(url), "https://pypi.org/pypi/%s/json", name);
  Buffer response = {0};
  int result = fetch_metadata(url, &response);
  if (result == 0 && write_buffer(metadata_path, &response) != 0) result = -1;
  free(response.bytes);
  if (result == 0 && helper_metadata("select", specification, metadata_path,
                                     selection_path) != 0) result = -1;
  Plan selection = {0};
  if (result == 0 && read_plan(selection_path, &selection) != 0) result = -1;
  if (result == 0 && strcmp(name, selection.name) != 0) {
    fputs("bonnie: PyPI returned a mismatched project name\n", stderr);
    result = -1;
  }
  remove(metadata_path);
  remove(selection_path);
  if (result != 0) {
    dispose_plan(&selection);
    free(name);
    return -1;
  }

  snprintf(url, sizeof(url), "https://pypi.org/pypi/%s/%s/json", name,
           selection.version);
  response = (Buffer){0};
  result = fetch_metadata(url, &response);
  if (result == 0 && write_buffer(metadata_path, &response) != 0) result = -1;
  free(response.bytes);
  if (result == 0 && helper_metadata("plan", specification, metadata_path,
                                     plan_path) != 0) result = -1;
  if (result == 0 && read_plan(plan_path, plan) != 0) result = -1;
  if (result == 0 && strcmp(name, plan->name) != 0) {
    fputs("bonnie: PyPI returned a mismatched project name\n", stderr);
    result = -1;
  }
  remove(metadata_path);
  remove(plan_path);
  dispose_plan(&selection);
  free(name);
  return result;
}

static int prepare_one(const char *specification, int dependencies,
                       unsigned sequence, Plan *plan) {
  char *direct_filename = NULL;
  char wheel_path[768];
  char verified_path[80];
  const int direct = strncmp(specification, "https://", 8) == 0;
  if (!direct && strncmp(specification, "http://", 7) == 0) {
    fputs("bonnie: package URLs must use HTTPS\n", stderr);
    return -1;
  }
  if (direct) {
    if (!portable_wheel_url(specification) ||
        (direct_filename = wheel_filename(specification)) == NULL) {
      fputs("bonnie: direct URLs must name a portable *-none-any.whl artifact\n",
            stderr);
      return -1;
    }
    plan->kind = copy_string("wheel");
    if (plan->kind == NULL) {
      free(direct_filename);
      return -1;
    }
  } else {
    if (make_metadata_plan(specification, sequence, plan) != 0) return -1;
    if (plan->kind == NULL || plan->url == NULL || plan->filename == NULL ||
        !valid_sha256(plan->sha256) ||
        !approved_pypi_artifact_url(plan->url, plan->kind)) {
      fputs("bonnie: PyPI returned an invalid artifact\n", stderr);
      return -1;
    }
    direct_filename = wheel_filename(plan->url);
    if (direct_filename == NULL || strcmp(direct_filename, plan->filename) != 0) {
      fputs("bonnie: PyPI artifact filename does not match its URL\n", stderr);
      free(direct_filename);
      return -1;
    }
  }

  if (snprintf(wheel_path, sizeof(wheel_path), "/tmp/bonnie-%u-%s",
               sequence, direct_filename) >= (int)sizeof(wheel_path)) {
    fputs("bonnie: artifact filename is too long\n", stderr);
    free(direct_filename);
    return -1;
  }
  snprintf(verified_path, sizeof(verified_path),
           "/tmp/bonnie-%u.verified", sequence);
  remove(wheel_path);
  remove(verified_path);
  if (direct) printf("bonnie: fetching %s\n", specification);
  else printf("bonnie: fetching %s==%s\n", plan->name, plan->version);
  if (download_wheel(direct ? specification : plan->url, wheel_path) != 0) {
    free(direct_filename);
    return -1;
  }

  Plan verified = {0};
  int result = helper_verify(direct ? "-" : specification, wheel_path,
                             direct ? NULL : plan->sha256, plan->kind,
                             verified_path);
  if (result == 0 && read_plan(verified_path, &verified) != 0) result = -1;
  remove(verified_path);
  if (!direct && result == 0 &&
      (strcmp(plan->name, verified.name) != 0 ||
       strcmp(plan->version, verified.version) != 0 ||
       verified.kind == NULL || strcmp(plan->kind, verified.kind) != 0)) {
    fputs("bonnie: artifact metadata does not match PyPI's release metadata\n",
          stderr);
    result = -1;
  }
  if (result != 0) {
    dispose_plan(&verified);
    remove(wheel_path);
    free(direct_filename);
    return -1;
  }

  for (size_t index = 0; index < plan->requirement_count; ++index) {
    free(plan->requirements[index]);
  }
  free(plan->requirements);
  plan->requirements = verified.requirements;
  plan->requirement_count = verified.requirement_count;
  verified.requirements = NULL;
  verified.requirement_count = 0;
  for (size_t index = 0; index < plan->build_requirement_count; ++index) {
    free(plan->build_requirements[index]);
  }
  free(plan->build_requirements);
  plan->build_requirements = verified.build_requirements;
  plan->build_requirement_count = verified.build_requirement_count;
  verified.build_requirements = NULL;
  verified.build_requirement_count = 0;
  for (size_t index = 0; index < plan->entry_point_count; ++index) {
    EntryPoint *entry = &plan->entry_points[index];
    free(entry->name);
    free(entry->module);
    free(entry->function);
    free(entry->staged_path);
    free(entry->published_path);
  }
  free(plan->entry_points);
  plan->entry_points = verified.entry_points;
  plan->entry_point_count = verified.entry_point_count;
  verified.entry_points = NULL;
  verified.entry_point_count = 0;
  if (direct) {
    plan->name = verified.name;
    plan->version = verified.version;
    plan->url = copy_string(specification);
    plan->filename = direct_filename;
    verified.name = NULL;
    verified.version = NULL;
    direct_filename = NULL;
    if (plan->url == NULL) result = -1;
  }
  plan->wheel_path = copy_string(wheel_path);
  if (plan->wheel_path == NULL) result = -1;
  dispose_plan(&verified);
  free(direct_filename);
  if (result != 0) {
    remove(wheel_path);
    return -1;
  }
  if (!dependencies && plan->requirement_count != 0) {
    printf("bonnie: skipped %zu dependencies (--no-deps)\n",
           plan->requirement_count);
  }
  return 0;
}

static char *entry_destination(const char *target, const char *name) {
  const int system_target = strncmp(target, "/usr/lib/python", 15) == 0;
  const char *directory = system_target ? "/usr/bin" : target;
  const char *suffix = system_target ? "" : "/bin";
  const size_t length = strlen(directory) + strlen(suffix) + 1 + strlen(name);
  char *path = malloc(length + 1);
  if (path != NULL) {
    snprintf(path, length + 1, "%s%s/%s", directory, suffix, name);
  }
  return path;
}

static int write_entry_script(const char *path, const EntryPoint *entry) {
  FILE *output = fopen(path, "w");
  if (output == NULL) return -1;
  const int result = fprintf(
      output,
      "#!/usr/bin/python\n"
      "import importlib, operator, sys\n"
      "sys.argv[0] = '%s'\n"
      "module = importlib.import_module('%s')\n"
      "raise SystemExit(operator.attrgetter('%s')(module)())\n",
      entry->name, entry->module, entry->function) < 0 ? -1 : 0;
  int closed = fclose(output);
  if (result != 0 || closed != 0) {
    remove(path);
    return -1;
  }
  return 0;
}

static int prepare_entry_points(Plan *plans, size_t plan_count,
                                const char *target) {
  unsigned sequence = 0;
  for (size_t plan_index = 0; plan_index < plan_count; ++plan_index) {
    Plan *plan = &plans[plan_index];
    for (size_t entry_index = 0; entry_index < plan->entry_point_count;
         ++entry_index) {
      EntryPoint *entry = &plan->entry_points[entry_index];
      entry->published_path = entry_destination(target, entry->name);
      if (entry->published_path == NULL) return -1;
      struct stat metadata;
      if (stat(entry->published_path, &metadata) == 0) {
        fprintf(stderr, "bonnie: console script collides with %s\n",
                entry->published_path);
        return -1;
      }
      if (errno != ENOENT) return -1;
      for (size_t previous_plan = 0; previous_plan <= plan_index;
           ++previous_plan) {
        const size_t limit = previous_plan == plan_index
                                 ? entry_index : plans[previous_plan].entry_point_count;
        for (size_t previous_entry = 0; previous_entry < limit;
             ++previous_entry) {
          if (strcmp(entry->published_path,
                     plans[previous_plan].entry_points[previous_entry].published_path) == 0) {
            fprintf(stderr, "bonnie: duplicate console script %s\n", entry->name);
            return -1;
          }
        }
      }

      char staged[96];
      snprintf(staged, sizeof(staged), "/tmp/bonnie-entry-%u", ++sequence);
      remove(staged);
      if (write_entry_script(staged, entry) != 0) return -1;
      entry->staged_path = copy_string(staged);
      if (entry->staged_path == NULL) {
        remove(staged);
        return -1;
      }
    }
  }
  return 0;
}

static int same_requirements(const Plan *left, const Plan *right) {
  if (left->requirement_count != right->requirement_count) return 0;
  for (size_t index = 0; index < left->requirement_count; ++index) {
    if (strcmp(left->requirements[index], right->requirements[index]) != 0) {
      return 0;
    }
  }
  return 1;
}

static int build_source(Plan *plan, unsigned sequence) {
  if (plan->kind == NULL) return -1;
  if (strcmp(plan->kind, "wheel") == 0) return 0;
  if (strcmp(plan->kind, "sdist") != 0) return -1;

  char built_path[96];
  char verified_path[96];
  char exact[1024];
  snprintf(built_path, sizeof(built_path), "/tmp/bonnie-built-%u.whl", sequence);
  snprintf(verified_path, sizeof(verified_path),
           "/tmp/bonnie-built-%u.verified", sequence);
  if (snprintf(exact, sizeof(exact), "%s==%s", plan->name,
               plan->version) >= (int)sizeof(exact)) {
    return -1;
  }
  char *specification = plan->constraint == NULL
      ? copy_string(exact)
      : combine_requirements(plan->constraint, exact, sequence);
  if (specification == NULL) return -1;
  remove(built_path);
  remove(verified_path);
  printf("bonnie: building %s==%s from verified source\n",
         plan->name, plan->version);
  if (helper_build(plan->wheel_path, built_path) != 0 ||
      helper_verify(specification, built_path, NULL, "wheel",
                    verified_path) != 0) {
    free(specification);
    remove(built_path);
    remove(verified_path);
    return -1;
  }
  free(specification);
  Plan verified = {0};
  int result = read_plan(verified_path, &verified);
  remove(verified_path);
  if (result == 0 &&
      (verified.kind == NULL || strcmp(verified.kind, "wheel") != 0 ||
       strcmp(plan->name, verified.name) != 0 ||
       strcmp(plan->version, verified.version) != 0 ||
       !same_requirements(plan, &verified))) {
    fputs("bonnie: built wheel metadata differs from verified source metadata\n",
          stderr);
    result = -1;
  }
  if (result != 0) {
    dispose_plan(&verified);
    remove(built_path);
    return -1;
  }

  for (size_t index = 0; index < plan->entry_point_count; ++index) {
    free(plan->entry_points[index].name);
    free(plan->entry_points[index].module);
    free(plan->entry_points[index].function);
    free(plan->entry_points[index].staged_path);
    free(plan->entry_points[index].published_path);
  }
  free(plan->entry_points);
  plan->entry_points = verified.entry_points;
  plan->entry_point_count = verified.entry_point_count;
  verified.entry_points = NULL;
  verified.entry_point_count = 0;

  remove(plan->wheel_path);
  free(plan->wheel_path);
  plan->wheel_path = copy_string(built_path);
  free(plan->kind);
  plan->kind = copy_string("wheel");
  free(plan->sha256);
  plan->sha256 = NULL;
  dispose_plan(&verified);
  if (plan->wheel_path == NULL || plan->kind == NULL) {
    remove(built_path);
    return -1;
  }
  return 0;
}

static int publish_entry_points(Plan *plans, size_t plan_count) {
  for (size_t plan_index = 0; plan_index < plan_count; ++plan_index) {
    Plan *plan = &plans[plan_index];
    for (size_t entry_index = 0; entry_index < plan->entry_point_count;
         ++entry_index) {
      EntryPoint *entry = &plan->entry_points[entry_index];
      char *directory = copy_string(entry->published_path);
      if (directory == NULL) return -1;
      char *slash = strrchr(directory, '/');
      if (slash == NULL) {
        free(directory);
        return -1;
      }
      *slash = '\0';
      if (mkdir(directory, 0777) != 0 && errno != EEXIST) {
        free(directory);
        return -1;
      }
      free(directory);
      if (rename(entry->staged_path, entry->published_path) != 0) return -1;
      free(entry->staged_path);
      entry->staged_path = NULL;
      printf("bonnie: installed console script %s\n", entry->published_path);
    }
  }
  return 0;
}

static ssize_t find_resolved_plan(Plan *plans, size_t plan_count,
                                  const char *name) {
  for (size_t index = 0; index < plan_count; ++index) {
    if (strcmp(plans[index].name, name) == 0) return (ssize_t)index;
  }
  return -1;
}

static int prepare_resolved_plan(size_t index, Plan *plans, size_t plan_count,
                                 unsigned char *states, int dependencies,
                                 const char *stage_target, unsigned *sequence,
                                 size_t *order, size_t *order_count);

static int prepare_requirements(char *const *requirements, size_t count,
                                Plan *plans, size_t plan_count,
                                unsigned char *states, int dependencies,
                                const char *stage_target, unsigned *sequence,
                                size_t *order, size_t *order_count) {
  for (size_t index = 0; index < count; ++index) {
    char *name = normalized_package_name(requirements[index]);
    if (name == NULL) {
      fprintf(stderr, "bonnie: invalid resolved requirement: %s\n",
              requirements[index]);
      return -1;
    }
    const ssize_t dependency = find_resolved_plan(plans, plan_count, name);
    free(name);
    if (dependency < 0) {
      /* A satisfied package may have been supplied by CPython's base image
       * rather than the current transaction. Every other requirement must be
       * represented in the fully verified plan before mutation begins. */
      if (helper_installed(requirements[index]) == 0) continue;
      fprintf(stderr, "bonnie: resolved graph is missing dependency %s\n",
              requirements[index]);
      return -1;
    }
    if (helper_satisfies(requirements[index], plans[dependency].version) != 0) {
      fprintf(stderr,
              "bonnie: resolved dependency %s does not accept %s==%s\n",
              requirements[index], plans[dependency].name,
              plans[dependency].version);
      return -1;
    }
    if (prepare_resolved_plan((size_t)dependency, plans, plan_count, states,
                              dependencies, stage_target, sequence, order,
                              order_count) != 0) {
      return -1;
    }
  }
  return 0;
}

static int prepare_resolved_plan(size_t index, Plan *plans, size_t plan_count,
                                 unsigned char *states, int dependencies,
                                 const char *stage_target, unsigned *sequence,
                                 size_t *order, size_t *order_count) {
  if (states[index] == 2) return 0;
  if (states[index] == 1) {
    /* Runtime dependency cycles are legal metadata. All members have already
     * been downloaded and verified, so finish the active depth-first branch
     * and publish the other member when recursion unwinds. */
    return 0;
  }
  states[index] = 1;
  Plan *plan = &plans[index];
  if (prepare_requirements(plan->build_requirements,
                           plan->build_requirement_count, plans, plan_count,
                           states, dependencies, stage_target, sequence, order,
                           order_count) != 0 ||
      (dependencies &&
       prepare_requirements(plan->requirements, plan->requirement_count,
                            plans, plan_count, states, dependencies,
                            stage_target, sequence, order, order_count) != 0)) {
    states[index] = 0;
    return -1;
  }

  if (plan->already_installed) {
    printf("bonnie: keeping installed %s==%s\n", plan->name, plan->version);
    states[index] = 2;
    return 0;
  }
  if (build_source(plan, ++*sequence) != 0) {
    fprintf(stderr, "bonnie: could not build %s==%s\n",
            plan->name, plan->version);
    states[index] = 0;
    return -1;
  }
  if (prepare_entry_points(plan, 1, stage_target) != 0) {
    fprintf(stderr, "bonnie: console script preparation failed for %s\n",
            plan->name);
    states[index] = 0;
    return -1;
  }
  printf("bonnie: staging %s==%s for source builds\n", plan->name,
         plan->version);
  if (helper_install(plan->wheel_path, stage_target, plan->sha256) != 0 ||
      publish_entry_points(plan, 1) != 0) {
    fputs("bonnie: could not stage a verified package\n", stderr);
    states[index] = 0;
    return -1;
  }
  if (*order_count == BONNIE_MAX_REQUIREMENTS) return -1;
  order[(*order_count)++] = index;
  states[index] = 2;
  return 0;
}

static int prepare_final_entry_points(Plan *plans, const size_t *order,
                                      size_t order_count,
                                      const char *target) {
  for (size_t order_index = 0; order_index < order_count; ++order_index) {
    Plan *plan = &plans[order[order_index]];
    for (size_t entry_index = 0; entry_index < plan->entry_point_count;
         ++entry_index) {
      EntryPoint *entry = &plan->entry_points[entry_index];
      char *destination = entry_destination(target, entry->name);
      if (destination == NULL) return -1;
      struct stat metadata;
      if (stat(destination, &metadata) == 0) {
        fprintf(stderr, "bonnie: console script collides with %s\n",
                destination);
        free(destination);
        return -1;
      }
      if (errno != ENOENT) {
        free(destination);
        return -1;
      }
      for (size_t previous_order = 0; previous_order <= order_index;
           ++previous_order) {
        Plan *previous = &plans[order[previous_order]];
        const size_t limit = previous_order == order_index
                                 ? entry_index
                                 : previous->entry_point_count;
        for (size_t previous_entry = 0; previous_entry < limit;
             ++previous_entry) {
          if (strcmp(destination,
                     previous->entry_points[previous_entry].published_path) == 0) {
            fprintf(stderr, "bonnie: duplicate console script %s\n",
                    entry->name);
            free(destination);
            return -1;
          }
        }
      }
      entry->staged_path = entry->published_path;
      entry->published_path = destination;
    }
  }
  return 0;
}

static int set_build_environment(const char *stage_target,
                                 char **saved_pythonpath, int *had_pythonpath,
                                 char **saved_path, int *had_path) {
  const char *pythonpath = getenv("PYTHONPATH");
  const char *path = getenv("PATH");
  *had_pythonpath = pythonpath != NULL;
  *had_path = path != NULL;
  *saved_pythonpath = pythonpath == NULL ? NULL : copy_string(pythonpath);
  *saved_path = path == NULL ? NULL : copy_string(path);
  if ((*had_pythonpath && *saved_pythonpath == NULL) ||
      (*had_path && *saved_path == NULL)) {
    free(*saved_pythonpath);
    free(*saved_path);
    *saved_pythonpath = NULL;
    *saved_path = NULL;
    return -1;
  }

  const size_t python_length = strlen(stage_target) +
      (pythonpath == NULL ? 0 : 1 + strlen(pythonpath));
  char *build_pythonpath = malloc(python_length + 1);
  const size_t bin_length = strlen(stage_target) + sizeof("/bin") - 1;
  const size_t path_length = bin_length + (path == NULL ? 0 : 1 + strlen(path));
  char *build_path = malloc(path_length + 1);
  if (build_pythonpath == NULL || build_path == NULL) {
    free(build_pythonpath);
    free(build_path);
    free(*saved_pythonpath);
    free(*saved_path);
    *saved_pythonpath = NULL;
    *saved_path = NULL;
    return -1;
  }
  snprintf(build_pythonpath, python_length + 1, "%s%s%s", stage_target,
           pythonpath == NULL ? "" : ":", pythonpath == NULL ? "" : pythonpath);
  snprintf(build_path, path_length + 1, "%s/bin%s%s", stage_target,
           path == NULL ? "" : ":", path == NULL ? "" : path);
  int result = setenv("PYTHONPATH", build_pythonpath, 1);
  if (result == 0 && setenv("PATH", build_path, 1) != 0) {
    result = -1;
    if (*had_pythonpath) setenv("PYTHONPATH", *saved_pythonpath, 1);
    else unsetenv("PYTHONPATH");
  }
  free(build_pythonpath);
  free(build_path);
  if (result != 0) {
    free(*saved_pythonpath);
    free(*saved_path);
    *saved_pythonpath = NULL;
    *saved_path = NULL;
    return -1;
  }
  return 0;
}

static int restore_build_environment(char *saved_pythonpath,
                                     int had_pythonpath, char *saved_path,
                                     int had_path) {
  const int python_result = had_pythonpath
      ? setenv("PYTHONPATH", saved_pythonpath, 1)
      : unsetenv("PYTHONPATH");
  const int path_result = had_path ? setenv("PATH", saved_path, 1)
                                   : unsetenv("PATH");
  free(saved_pythonpath);
  free(saved_path);
  return python_result == 0 && path_result == 0 ? 0 : -1;
}

static int run_introspection(int argc, char **argv) {
  char *arguments[argc + 2];
  arguments[0] = "/usr/bin/python";
  arguments[1] = (char *)helper_path;
  for (int index = 1; index < argc; ++index) {
    arguments[index + 1] = argv[index];
  }
  arguments[argc + 1] = NULL;
  return run_helper(argc + 1, arguments);
}

int main(int argc, char **argv) {
  if (argc == 2 && strcmp(argv[1], "--version") == 0) {
    puts("bonnie 0.7 (Dolly source package manager)");
    return 0;
  }
  if (argc == 2 && strcmp(argv[1], "--help") == 0) {
    usage(stdout);
    return 0;
  }
  if (argc >= 2 && (strcmp(argv[1], "list") == 0 ||
                    strcmp(argv[1], "freeze") == 0 ||
                    strcmp(argv[1], "show") == 0 ||
                    strcmp(argv[1], "check") == 0)) {
    const int valid = (argc == 2 && strcmp(argv[1], "show") != 0) ||
                      (argc >= 3 && strcmp(argv[1], "show") == 0);
    if (!valid) {
      usage(stderr);
      return 2;
    }
    return run_introspection(argc, argv);
  }
  if (argc < 3 || strcmp(argv[1], "install") != 0) {
    usage(stderr);
    return 2;
  }

  const char *target = "/usr/lib/python3.14/site-packages";
  int dependencies = 1;
  RequirementQueue queue = {0};
  for (int index = 2; index < argc; ++index) {
    if (strcmp(argv[index], "--target") == 0) {
      if (++index == argc) {
        fputs("bonnie: --target requires a directory\n", stderr);
        dispose_queue(&queue);
        return 2;
      }
      target = argv[index];
    } else if (strcmp(argv[index], "--no-deps") == 0) {
      dependencies = 0;
    } else if (strcmp(argv[index], "-r") == 0 ||
               strcmp(argv[index], "--requirement") == 0) {
      if (++index == argc) {
        fputs("bonnie: --requirement requires a file\n", stderr);
        dispose_queue(&queue);
        return 2;
      }
      if (queue_requirements_file(&queue, argv[index]) != 0) {
        dispose_queue(&queue);
        return 2;
      }
    } else if (argv[index][0] == '-') {
      fprintf(stderr, "bonnie: unsupported option: %s\n", argv[index]);
      dispose_queue(&queue);
      return 2;
    } else if (queue_append(&queue, argv[index]) != 0) {
      fputs("bonnie: could not queue requirement\n", stderr);
      dispose_queue(&queue);
      return 1;
    }
  }
  if (queue.count == 0) {
    fputs("bonnie: no package specified\n", stderr);
    dispose_queue(&queue);
    return 2;
  }

  const size_t root_count = queue.count;
  size_t root_indices[BONNIE_MAX_REQUIREMENTS] = {0};
  Plan plans[BONNIE_MAX_REQUIREMENTS] = {0};
  char *seen_names[BONNIE_MAX_REQUIREMENTS] = {0};
  size_t plan_count = 0;
  unsigned sequence = 0;
  int result = 0;
  while (queue.position < queue.count) {
    const size_t request_index = queue.position;
    const char *specification = queue.items[queue.position++];
    const int direct = strncmp(specification, "https://", 8) == 0;
    ssize_t existing = -1;
    char *combined = NULL;
    if (!direct) {
      char *requested_name = normalized_package_name(specification);
      if (requested_name == NULL) {
        fprintf(stderr, "bonnie: unsupported requirement: %s\n", specification);
        result = 1;
        break;
      }
      existing = seen_project(seen_names, plan_count, requested_name);
      free(requested_name);
      if (existing >= 0) {
        if (plans[existing].constraint == NULL) {
          fprintf(stderr,
                  "bonnie: resolved direct URL conflicts with requirement %s\n",
                  specification);
          result = 1;
          break;
        }
        combined = combine_requirements(plans[existing].constraint,
                                        specification, ++sequence);
        if (combined == NULL) {
          fprintf(stderr,
                  "bonnie: dependency constraints are unsatisfiable: %s\n",
                  specification);
          result = 1;
          break;
        }
      }
    }
    const char *effective = combined == NULL ? specification : combined;
    Plan plan = {0};
    if (prepare_one(effective, dependencies, ++sequence, &plan) != 0) {
      if (combined != NULL) {
        fprintf(stderr,
                "bonnie: dependency constraints are unsatisfiable: %s\n",
                specification);
      }
      free(combined);
      dispose_plan(&plan);
      result = 1;
      break;
    }
    if (!direct) {
      plan.constraint = combined == NULL ? copy_string(specification) : combined;
      combined = NULL;
      if (plan.constraint == NULL) {
        dispose_plan(&plan);
        result = 1;
        break;
      }
    }
    if (!direct && helper_installed(plan.constraint) == 0) {
      plan.already_installed = 1;
    }
    if (direct) existing = seen_project(seen_names, plan_count, plan.name);
    size_t resolved_index = 0;
    if (existing >= 0) {
      if (direct) {
        fprintf(stderr, "bonnie: direct URL conflicts with resolved project %s\n",
                plan.name);
        dispose_plan(&plan);
        result = 1;
        break;
      }
      if (strcmp(plan.name, plans[existing].name) != 0) {
        fputs("bonnie: combined requirement changed project identity\n", stderr);
        dispose_plan(&plan);
        result = 1;
        break;
      }
      printf("bonnie: selected %s==%s for combined constraint %s\n",
             plan.name, plan.version, plan.constraint);
      dispose_plan(&plans[existing]);
      plans[existing] = plan;
      memset(&plan, 0, sizeof(plan));
      seen_names[existing] = plans[existing].name;
      resolved_index = (size_t)existing;
    } else {
      plans[plan_count] = plan;
      memset(&plan, 0, sizeof(plan));
      seen_names[plan_count] = plans[plan_count].name;
      resolved_index = plan_count++;
    }
    dispose_plan(&plan);
    if (request_index < root_count) root_indices[request_index] = resolved_index;

    Plan *resolved = &plans[resolved_index];
    if (dependencies) {
      for (size_t index = 0; index < resolved->requirement_count; ++index) {
        if (queue_append(&queue, resolved->requirements[index]) != 0) {
          result = 1;
          break;
        }
      }
    }
    /* --no-deps suppresses runtime dependencies, not the isolated frontend
     * requirements needed to turn an sdist into a wheel. */
    for (size_t index = 0;
         result == 0 && index < resolved->build_requirement_count; ++index) {
      if (queue_append(&queue, resolved->build_requirements[index]) != 0) {
        result = 1;
      }
    }
  }

  if (result == 0) {
    printf("bonnie: resolved and verified %zu package%s; preparing dependency graph\n",
           plan_count, plan_count == 1 ? "" : "s");
    char stage_root[96];
    char stage_target[128];
    snprintf(stage_root, sizeof(stage_root), "/tmp/bonnie-stage-%ld",
             (long)getpid());
    snprintf(stage_target, sizeof(stage_target), "%s/site-packages", stage_root);
    size_t order[BONNIE_MAX_REQUIREMENTS] = {0};
    size_t order_count = 0;
    unsigned char states[BONNIE_MAX_REQUIREMENTS] = {0};
    char *saved_pythonpath = NULL;
    char *saved_path = NULL;
    int had_pythonpath = 0;
    int had_path = 0;
    int environment_set = 0;

    if (helper_stage("stage-reset", stage_root) != 0) {
      fputs("bonnie: could not create the temporary build environment\n", stderr);
      result = 1;
    } else if (set_build_environment(stage_target, &saved_pythonpath,
                                     &had_pythonpath, &saved_path,
                                     &had_path) != 0) {
      fputs("bonnie: could not enter the temporary build environment\n", stderr);
      result = 1;
    } else {
      environment_set = 1;
      for (size_t index = 0; index < root_count; ++index) {
        if (prepare_resolved_plan(root_indices[index], plans, plan_count, states,
                                  dependencies, stage_target, &sequence,
                                  order, &order_count) != 0) {
          result = 1;
          break;
        }
      }
    }

    if (environment_set &&
        restore_build_environment(saved_pythonpath, had_pythonpath,
                                  saved_path, had_path) != 0) {
      fputs("bonnie: could not restore the command environment\n", stderr);
      result = 1;
    }
    if (result == 0 &&
        prepare_final_entry_points(plans, order, order_count, target) != 0) {
      fputs("bonnie: final package publication preflight failed\n", stderr);
      result = 1;
    }
    if (result == 0) {
      printf("bonnie: prepared %zu package%s; publishing into %s\n",
             order_count, order_count == 1 ? "" : "s", target);
      for (size_t order_index = 0; order_index < order_count; ++order_index) {
        Plan *plan = &plans[order[order_index]];
        printf("bonnie: installing %s==%s\n", plan->name, plan->version);
        if (helper_install(plan->wheel_path, target, plan->sha256) != 0 ||
            publish_entry_points(plan, 1) != 0) {
          fputs("bonnie: could not publish a prepared package\n", stderr);
          result = 1;
          break;
        }
      }
    }
    if (helper_stage("stage-remove", stage_root) != 0) {
      fputs("bonnie: could not remove the temporary build environment\n", stderr);
      result = 1;
    }
  }
  for (size_t index = 0; index < plan_count; ++index) dispose_plan(&plans[index]);
  dispose_queue(&queue);
  if (result == 0) puts("bonnie: installation complete");
  return result;
}
