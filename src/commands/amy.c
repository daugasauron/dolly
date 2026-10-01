// amy installs the packages this release publishes into the running session.
// An install is the Dollyfile row INSTALL URL SHA256, executed against the
// live filesystem by /bin/dollyfile and recorded in /etc/dolly/installed. The
// page's packages@0 service hands over the index and verified package
// snapshots; nothing else is fetched.
#define _POSIX_C_SOURCE 200809L

#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#include <dolly/http.h>
#include <dolly/runtime.h>

static const char service[] = "https://packages.dolly.invalid/v1/";
static const char installed_path[] = "/etc/dolly/installed";
static const char artifacts_dir[] = "/etc/dolly/artifacts";
enum { MAX_INDEX_BYTES = 64 * 1024 };

typedef struct { char *name, *url, *sha256; } Package;
typedef struct { Package *items; size_t count; char *text; } Packages;

static void usage(FILE *stream) {
  fputs("usage: amy install NAME...   install packages this release publishes\n"
        "       amy list              the package index; installed ones are marked\n"
        "       amy installed         the installed rows: NAME URL SHA256\n", stream);
}

static size_t append_text(const void *bytes, size_t length, void *context) {
  Packages *packages = context;
  const size_t current = packages->text == NULL ? 0 : strlen(packages->text);
  if (length > MAX_INDEX_BYTES - current) return 0;
  char *grown = realloc(packages->text, current + length + 1);
  if (grown == NULL) return 0;
  memcpy(grown + current, bytes, length);
  grown[current + length] = '\0';
  packages->text = grown;
  return length;
}

static size_t write_descriptor(const void *bytes, size_t length, void *context) {
  const unsigned char *cursor = bytes;
  for (size_t remaining = length; remaining != 0;) {
    const ssize_t written = write(*(int *)context, cursor, remaining);
    if (written <= 0) return 0;
    cursor += (size_t)written;
    remaining -= (size_t)written;
  }
  return length;
}

static int fetch(const char *path, dolly_http_write_callback write, void *context) {
  char url[sizeof(service) + 128];
  snprintf(url, sizeof(url), "%s%s", service, path);
  dolly_http_response response = {0};
  dolly_http_request request = {.method = "GET", .url = url, .headers = "",
                                .flags = DOLLY_HTTP_FAIL_STATUS, .write = write, .write_context = context};
  const int status = dolly_http_perform(&request, &response);
  const unsigned code = response.status;
  dolly_http_response_dispose(&response);
  if (status == -EACCES) {
    fputs("amy: the package service is unavailable: the image must declare REQUIRES HOST packages@0\n", stderr);
  } else if (status < 0) {
    fprintf(stderr, "amy: %s: %s\n", url, dolly_http_error_message(-status));
  } else if (status > 0 || code < 200 || code >= 300) {
    fprintf(stderr, "amy: %s: HTTP %u\n", url, code);
  } else return 0;
  return -1;
}

// The image a recipe URL names: Dollyfile-NAME, or default for Dollyfile.
static const char *package_name(const char *url) {
  const char *file = strrchr(url, '/');
  file = file == NULL ? url : file + 1;
  return strncmp(file, "Dollyfile-", 10) == 0 ? file + 10 : "default";
}

// Rows of three words: NAME URL SHA256 in the index, INSTALL URL SHA256 in
// the record, where the name is the one the URL names.
static int parse_rows(Packages *packages, const char *source) {
  for (char *line = packages->text, *next; line != NULL && *line != '\0'; line = next) {
    next = strchr(line, '\n');
    if (next != NULL) *next++ = '\0';
    char *words[3];
    size_t count = 0;
    for (char *word = strtok(line, " "); word != NULL && count < 3; word = strtok(NULL, " ")) words[count++] = word;
    if (count != 3 || strlen(words[2]) != 64) {
      fprintf(stderr, "amy: %s: malformed row\n", source);
      return -1;
    }
    Package *grown = realloc(packages->items, (packages->count + 1) * sizeof(*grown));
    if (grown == NULL) return -1;
    packages->items = grown;
    const int recorded = strcmp(words[0], "INSTALL") == 0;
    packages->items[packages->count++] = (Package){
        .name = (char *)(recorded ? package_name(words[1]) : words[0]), .url = words[1], .sha256 = words[2]};
  }
  return 0;
}

static int read_installed(Packages *installed) {
  FILE *stream = fopen(installed_path, "r");
  if (stream == NULL) return errno == ENOENT ? 0 : -1;
  char bytes[4096];
  size_t length;
  int result = 0;
  while (result == 0 && (length = fread(bytes, 1, sizeof(bytes), stream)) != 0) {
    if (append_text(bytes, length, installed) != length) result = -1;
  }
  fclose(stream);
  return result != 0 ? result : parse_rows(installed, installed_path);
}

static const Package *find_row(const Packages *packages, const char *url, const char *sha256) {
  for (size_t index = 0; index < packages->count; ++index) {
    const Package *package = &packages->items[index];
    if (strcmp(package->url, url) == 0 && strcmp(package->sha256, sha256) == 0) return package;
  }
  return NULL;
}

static int install(const Packages *index, Packages *installed, const char *name) {
  const Package *package = NULL;
  for (size_t position = 0; position < index->count && package == NULL; ++position) {
    if (strcmp(index->items[position].name, name) == 0) package = &index->items[position];
  }
  if (package == NULL) {
    fprintf(stderr, "amy: %s: this release publishes no such package; amy list shows them\n", name);
    return -1;
  }
  if (find_row(installed, package->url, package->sha256) != NULL) {
    printf("amy: %s is already installed\n", name);
    return 0;
  }
  char path[sizeof(artifacts_dir) + 80];
  snprintf(path, sizeof(path), "%s/%s.snapshot", artifacts_dir, package->sha256);
  char route[96];
  snprintf(route, sizeof(route), "packages/%s", package->sha256);
  if (mkdir(artifacts_dir, 0755) != 0 && errno != EEXIST) {
    fprintf(stderr, "amy: %s: %s\n", artifacts_dir, strerror(errno));
    return -1;
  }
  int descriptor = open(path, O_WRONLY | O_CREAT | O_TRUNC, 0644);
  if (descriptor < 0) {
    fprintf(stderr, "amy: %s: %s\n", path, strerror(errno));
    return -1;
  }
  fprintf(stderr, "amy: fetching %s\n", name);
  int status = fetch(route, write_descriptor, &descriptor);
  if (close(descriptor) != 0 && status == 0) status = -1;
  if (status == 0) {
    // The engine's log is diagnostics here; amy's stdout reports the result.
    char *arguments[] = {"/bin/dollyfile", "install", package->url, package->sha256, NULL};
    int exit_status = 126;
    const int pid = dolly_spawn(arguments[0], 4, arguments, STDIN_FILENO, STDERR_FILENO, STDERR_FILENO);
    const int waited = pid < 0 ? pid : dolly_wait(pid, &exit_status);
    if (waited < 0) fprintf(stderr, "amy: %s: %s\n", arguments[0], strerror(-waited));
    if (waited < 0 || exit_status != 0) {
      fprintf(stderr, "amy: %s: not installed\n", name);
      status = -1;
    }
  }
  unlink(path);
  rmdir(artifacts_dir);
  if (status != 0) return status;
  printf("amy: %s installed; its environment applies when the session is next loaded\n", name);
  char row[8192];
  snprintf(row, sizeof(row), "INSTALL %s %s\n", package->url, package->sha256);
  return append_text(row, strlen(row), installed) == strlen(row) ? 0 : -1;
}

int main(int argc, char **argv) {
  if (argc == 2 && strcmp(argv[1], "--help") == 0) {
    usage(stdout);
    return 0;
  }
  const char *command = argc >= 2 ? argv[1] : "";
  const int listing = argc == 2 && strcmp(command, "list") == 0;
  const int recorded = argc == 2 && strcmp(command, "installed") == 0;
  const int installing = argc >= 3 && strcmp(command, "install") == 0;
  if (!listing && !recorded && !installing) {
    usage(stderr);
    return 2;
  }
  Packages index = {0}, installed = {0};
  int status = read_installed(&installed);
  if (status == 0 && recorded) {
    for (size_t position = 0; position < installed.count; ++position) {
      const Package *package = &installed.items[position];
      printf("%s %s %s\n", package->name, package->url, package->sha256);
    }
  }
  if (status == 0 && !recorded) status = fetch("index", append_text, &index);
  if (status == 0 && !recorded) status = parse_rows(&index, "package index");
  if (status == 0 && listing) {
    for (size_t position = 0; position < index.count; ++position) {
      const Package *package = &index.items[position];
      printf("%-24s%s\n", package->name, find_row(&installed, package->url, package->sha256) ? "installed" : "");
    }
  }
  for (int argument = 2; status == 0 && installing && argument < argc; ++argument) {
    status = install(&index, &installed, argv[argument]);
  }
  free(index.items);
  free(index.text);
  free(installed.items);
  free(installed.text);
  return status == 0 ? 0 : 1;
}
