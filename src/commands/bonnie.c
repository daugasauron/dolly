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
#include <unistd.h>

enum {
  BONNIE_MAX_INDEX_BYTES = 16 * 1024 * 1024,
};

typedef struct {
  char *bytes;
  size_t length;
  size_t capacity;
} Buffer;

static void usage(FILE *stream) {
  fputs(
      "usage: bonnie install [--target DIRECTORY] [--no-deps] PACKAGE[==VERSION]\n"
      "       bonnie install [--target DIRECTORY] [--no-deps] HTTPS-WHEEL-URL\n"
      "       bonnie --version\n\n"
      "Install one portable Python wheel through Dolly's libcurl Fetch backend.\n"
      "Dependencies and platform-specific wheels must be installed explicitly.\n",
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

static int portable_wheel_url(const char *url, size_t length) {
  static const char suffix[] = "-none-any.whl";
  const char *end = memchr(url, '?', length);
  const char *fragment = memchr(url, '#', length);
  if (end == NULL || (fragment != NULL && fragment < end)) end = fragment;
  if (end == NULL) end = url + length;
  const size_t path_length = (size_t)(end - url);
  return path_length >= sizeof(suffix) - 1 &&
         memcmp(url + path_length - (sizeof(suffix) - 1), suffix,
                sizeof(suffix) - 1) == 0;
}

static char *resolve_wheel_url(const char *specification) {
  const char *version = strstr(specification, "==");
  const size_t name_length = version == NULL
                                 ? strlen(specification)
                                 : (size_t)(version - specification);
  const char *version_value = version == NULL ? NULL : version + 2;
  if (name_length == 0 || (version != NULL && *version_value == '\0')) {
    errno = EINVAL;
    return NULL;
  }
  for (const char *cursor = specification; *cursor != '\0'; ++cursor) {
    if (cursor == version) {
      ++cursor;
      continue;
    }
    if (!(isalnum((unsigned char)*cursor) || *cursor == '-' || *cursor == '_' ||
          *cursor == '.')) {
      errno = EINVAL;
      return NULL;
    }
  }

  const size_t query_size = sizeof("https://pypi.org/pypi//json") +
                            strlen(specification);
  char *query = malloc(query_size);
  if (query == NULL) return NULL;
  if (version_value == NULL) {
    snprintf(query, query_size, "https://pypi.org/pypi/%.*s/json",
             (int)name_length, specification);
  } else {
    snprintf(query, query_size, "https://pypi.org/pypi/%.*s/%s/json",
             (int)name_length, specification, version_value);
  }

  Buffer response = {0};
  CURL *curl = curl_easy_init();
  struct curl_slist *headers = NULL;
  if (curl == NULL) {
    free(query);
    return NULL;
  }
  headers = curl_slist_append(headers, "Accept: application/json");
  curl_easy_setopt(curl, CURLOPT_URL, query);
  curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
  curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 1L);
  curl_easy_setopt(curl, CURLOPT_FAILONERROR, 1L);
  curl_easy_setopt(curl, CURLOPT_USERAGENT, "bonnie/0.1 (Dolly wasm64)");
  curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, append_memory);
  curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response);
  const CURLcode result = curl_easy_perform(curl);
  curl_slist_free_all(headers);
  curl_easy_cleanup(curl);
  free(query);
  if (result != CURLE_OK) {
    fprintf(stderr, "bonnie: PyPI lookup failed: %s\n",
            curl_easy_strerror(result));
    free(response.bytes);
    errno = EIO;
    return NULL;
  }

  static const char marker[] = "\"url\":\"";
  char *selected = NULL;
  for (char *cursor = response.bytes; cursor != NULL && *cursor != '\0';) {
    cursor = strstr(cursor, marker);
    if (cursor == NULL) break;
    cursor += sizeof(marker) - 1;
    char *end = strchr(cursor, '"');
    if (end == NULL) break;
    if (portable_wheel_url(cursor, (size_t)(end - cursor))) {
      const size_t candidate_length = (size_t)(end - cursor);
      char *candidate = malloc(candidate_length + 1);
      if (candidate == NULL) {
        free(selected);
        selected = NULL;
        break;
      }
      memcpy(candidate, cursor, candidate_length);
      candidate[candidate_length] = '\0';
      free(selected);
      selected = candidate;
    }
    cursor = end + 1;
  }
  free(response.bytes);
  if (selected == NULL && errno == 0) errno = ENOENT;
  return selected;
}

static int download_wheel(const char *url, const char *path) {
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
  curl_easy_setopt(curl, CURLOPT_USERAGENT, "bonnie/0.1 (Dolly wasm64)");
  curl_easy_setopt(curl, CURLOPT_WRITEDATA, output);
  const CURLcode result = curl_easy_perform(curl);
  curl_easy_cleanup(curl);
  const int close_result = fclose(output);
  if (result != CURLE_OK || close_result != 0) {
    fprintf(stderr, "bonnie: wheel download failed: %s\n",
            result == CURLE_OK ? strerror(errno) : curl_easy_strerror(result));
    remove(path);
    errno = EIO;
    return -1;
  }
  return 0;
}

static int extract_wheel(const char *path, const char *target) {
  char *arguments[] = {
      "/usr/bin/python", "-m", "zipfile", "-e", (char *)path,
      (char *)target, NULL,
  };
  const int pid = dolly_spawn("/usr/bin/python", 6, arguments,
                              STDIN_FILENO, STDOUT_FILENO, STDERR_FILENO);
  if (pid < 0) {
    fprintf(stderr, "bonnie: could not start Python: %s\n", strerror(-pid));
    return 1;
  }
  int status = 1;
  if (dolly_wait(pid, &status) != 0) {
    fputs("bonnie: could not collect Python extractor\n", stderr);
    return 1;
  }
  return status;
}

int main(int argc, char **argv) {
  if (argc == 2 && strcmp(argv[1], "--version") == 0) {
    puts("bonnie 0.1 (Dolly libcurl wheel installer)");
    return 0;
  }
  if (argc == 2 && strcmp(argv[1], "--help") == 0) {
    usage(stdout);
    return 0;
  }
  if (argc < 3 || strcmp(argv[1], "install") != 0) {
    usage(stderr);
    return 2;
  }

  const char *target = "/usr/lib/python3.14/site-packages";
  const char *specification = NULL;
  for (int index = 2; index < argc; ++index) {
    if (strcmp(argv[index], "--target") == 0) {
      if (++index == argc) {
        fputs("bonnie: --target requires a directory\n", stderr);
        return 2;
      }
      target = argv[index];
    } else if (strcmp(argv[index], "--no-deps") == 0) {
      continue;
    } else if (argv[index][0] == '-') {
      fprintf(stderr, "bonnie: unsupported option: %s\n", argv[index]);
      return 2;
    } else if (specification == NULL) {
      specification = argv[index];
    } else {
      fputs("bonnie: install accepts one package at a time\n", stderr);
      return 2;
    }
  }
  if (specification == NULL) {
    fputs("bonnie: no package specified\n", stderr);
    return 2;
  }

  char *resolved = NULL;
  const char *url = specification;
  if (strncmp(specification, "https://", 8) != 0) {
    if (strncmp(specification, "http://", 7) == 0) {
      fputs("bonnie: package URLs must use HTTPS\n", stderr);
      return 2;
    }
    resolved = resolve_wheel_url(specification);
    if (resolved == NULL) {
      fprintf(stderr,
              "bonnie: no portable wheel found for %s; dependencies and "
              "native builds are explicit\n",
              specification);
      return 1;
    }
    url = resolved;
  }
  if (!portable_wheel_url(url, strlen(url))) {
    fputs("bonnie: only portable *-none-any.whl artifacts are supported\n",
          stderr);
    free(resolved);
    return 2;
  }

  static unsigned sequence;
  char temporary[64];
  snprintf(temporary, sizeof(temporary), "/tmp/bonnie-%u.whl", ++sequence);
  printf("bonnie: fetching %s\n", url);
  if (download_wheel(url, temporary) != 0) {
    free(resolved);
    return 1;
  }
  printf("bonnie: installing into %s\n", target);
  const int status = extract_wheel(temporary, target);
  remove(temporary);
  free(resolved);
  if (status != 0) return status;
  puts("bonnie: installed (dependencies were not resolved)");
  return 0;
}
