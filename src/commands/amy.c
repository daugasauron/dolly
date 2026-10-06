// amy installs the packages this site publishes into the running session.
// The index is the site's public /amy-index.txt, "NAME URL SHA256 DESCRIPTION"
// per package, read like any URL under the page's HTTP policy. An install is
// the Dollyfile row INSTALL URL SHA256, executed against the live filesystem
// by /bin/dollyfile and recorded in /etc/dolly/installed; the page's
// packages@0 service hands over the verified package snapshot.
#define _POSIX_C_SOURCE 200809L

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

// A path names a file of the site that serves this release.
static const char index_url[] = "/amy-index.txt";
static const char service[] = "https://packages.dolly.invalid/v1/packages/";
static const char installed_path[] = "/etc/dolly/installed";
static const char artifacts_dir[] = "/etc/dolly/artifacts";
static const char files_dir[] = "/etc/dolly/files";
enum { MAX_INDEX_BYTES = 64 * 1024 };

typedef struct { char *name, *url, *sha256, *description; } Package;
typedef struct { Package *items; size_t count; char *text; } Packages;

static void usage(FILE *stream) {
  fputs("usage: amy list              the site's packages: NAME, installed, description\n"
        "       amy info NAME         its description and INSTALL row\n"
        "       amy install NAME...   install packages; says what each added\n"
        "       amy files NAME        the files NAME installs outside /etc/dolly: SIZE PATH\n"
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

// Returns 0, a negative errno, or the HTTP status of a refusal.
static int fetch(const char *url, dolly_http_write_callback write, void *context) {
  dolly_http_response response = {0};
  dolly_http_request request = {.method = "GET", .url = url, .headers = "",
                                .flags = DOLLY_HTTP_FAIL_STATUS, .write = write, .write_context = context};
  const int status = dolly_http_perform(&request, &response);
  const int code = (int)response.status;
  dolly_http_response_dispose(&response);
  return status != 0 ? status : code >= 200 && code < 300 ? 0 : code > 0 ? code : -EIO;
}

static void report(const char *subject, int status) {
  if (status < 0) fprintf(stderr, "amy: %s: %s\n", subject, dolly_http_error_message(-status));
  else fprintf(stderr, "amy: %s: HTTP %d\n", subject, status);
}

// The image a recipe URL names: Dollyfile-NAME, or default for Dollyfile.
static const char *package_name(const char *url) {
  const char *file = strrchr(url, '/');
  file = file == NULL ? url : file + 1;
  return strncmp(file, "Dollyfile-", 10) == 0 ? file + 10 : "default";
}

// Index rows are NAME URL SHA256 DESCRIPTION. The record's are INSTALL URL
// SHA256, where the name is the one the URL names.
static int parse_rows(Packages *packages, const char *source) {
  for (char *line = packages->text, *next; line != NULL && *line != '\0'; line = next) {
    next = strchr(line, '\n');
    if (next != NULL) *next++ = '\0';
    char *words[4] = {line, NULL, NULL, ""};
    for (size_t word = 1; word < 4; ++word) {
      char *space = strchr(words[word - 1], ' ');
      if (space == NULL) break;
      *space = '\0';
      words[word] = space + 1;
    }
    if (words[2] == NULL || strlen(words[2]) != 64 || strchr(words[0], '/') != NULL) {
      fprintf(stderr, "amy: %s: malformed row\n", source);
      return -1;
    }
    Package *grown = realloc(packages->items, (packages->count + 1) * sizeof(*grown));
    if (grown == NULL) return -1;
    packages->items = grown;
    const int recorded = strcmp(words[0], "INSTALL") == 0;
    packages->items[packages->count++] = (Package){
        .name = (char *)(recorded ? package_name(words[1]) : words[0]),
        .url = words[1], .sha256 = words[2], .description = words[3]};
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

static const Package *find_name(const Packages *index, const char *name) {
  for (size_t position = 0; position < index->count; ++position) {
    if (strcmp(index->items[position].name, name) == 0) return &index->items[position];
  }
  fprintf(stderr, "amy: %s: this site publishes no such package; amy list shows them\n", name);
  return NULL;
}

static uint64_t little_endian(const unsigned char *bytes, size_t width) {
  uint64_t value = 0;
  while (width-- != 0) value = value << 8 | bytes[width];
  return value;
}

typedef struct { unsigned long long files, bytes; char commands[1024]; } Summary;

// Writes the files a snapshot installs outside /etc/dolly, Dolly's own record
// of an image, as "SIZE PATH" lines, and counts them and the commands in them.
static int list_files(const char *snapshot, FILE *list, Summary *summary) {
  FILE *stream = fopen(snapshot, "rb");
  unsigned char header[16];
  char path[4096];
  int valid = stream != NULL && fread(header, 1, sizeof(header), stream) == sizeof(header) &&
      memcmp(header, "DOLLYSNP", 8) == 0;
  for (uint64_t records = valid ? little_endian(header + 12, 4) : 0; valid && records != 0; --records) {
    valid = fread(header, 1, sizeof(header), stream) == sizeof(header);
    const uint64_t kind = little_endian(header, 4), length = little_endian(header + 4, 4);
    const uint64_t size = little_endian(header + 8, 8);
    valid = valid && length < sizeof(path) && fread(path, 1, length, stream) == length &&
        fseeko(stream, (off_t)size, SEEK_CUR) == 0;
    if (!valid) break;
    path[length] = '\0';
    if (kind == 1 /* a directory */ || strncmp(path, "/etc/dolly/", 11) == 0) continue;
    fprintf(list, "%llu %s\n", (unsigned long long)size, path);
    summary->files++;
    summary->bytes += size;
    const char *command = strncmp(path, "/bin/", 5) == 0 ? path + 5 : strncmp(path, "/usr/bin/", 9) == 0 ? path + 9 : NULL;
    const size_t used = strlen(summary->commands);
    if (command != NULL && strchr(command, '/') == NULL && used + strlen(command) + 2 < sizeof(summary->commands)) {
      snprintf(summary->commands + used, sizeof(summary->commands) - used, " %s", command);
    }
  }
  if (stream != NULL) fclose(stream);
  return valid && fflush(list) == 0 ? 0 : -1;
}

// Fetches a package's verified snapshot to `path`; the caller removes it.
static int fetch_snapshot(const Package *package, const char *path) {
  char url[sizeof(service) + 64];
  snprintf(url, sizeof(url), "%s%s", service, package->sha256);
  int descriptor = mkdir(artifacts_dir, 0755) != 0 && errno != EEXIST ? -1
      : open(path, O_WRONLY | O_CREAT | O_TRUNC, 0644);
  if (descriptor < 0) {
    fprintf(stderr, "amy: %s: %s\n", path, strerror(errno));
    return -1;
  }
  fprintf(stderr, "amy: fetching %s\n", package->name);
  int status = fetch(url, write_descriptor, &descriptor);
  if (close(descriptor) != 0 && status == 0) status = -EIO;
  if (status == -EACCES) {
    fputs("amy: the package service is unavailable: the image must declare REQUIRES HOST packages@0\n", stderr);
  } else if (status == 404) {
    // The service serves the release this tab runs; the index is the site's newest.
    fprintf(stderr, "amy: %s: the site has a newer release than this tab runs; reload the page\n", package->name);
  } else if (status != 0) report(package->name, status);
  return status;
}

static void files_path(char *path, size_t size, const char *name) { snprintf(path, size, "%s/%s", files_dir, name); }

// Lists a package's files into its record when `keep`, else to stdout.
static int snapshot_files(const Package *package, const char *snapshot, int keep, Summary *summary) {
  char record[sizeof(files_dir) + 128];
  files_path(record, sizeof(record), package->name);
  FILE *list = !keep ? stdout : mkdir(files_dir, 0755) != 0 && errno != EEXIST ? NULL : fopen(record, "w");
  int status = list == NULL ? -1 : list_files(snapshot, list, summary);
  if (keep && list != NULL && fclose(list) != 0) status = -1;
  if (status != 0) fprintf(stderr, "amy: %s: cannot list its files\n", package->name);
  return status;
}

static int install(const Packages *index, Packages *installed, const char *name) {
  const Package *package = find_name(index, name);
  if (package == NULL) return -1;
  if (find_row(installed, package->url, package->sha256) != NULL) {
    printf("amy: %s is already installed\n", name);
    return 0;
  }
  char path[sizeof(artifacts_dir) + 80];
  snprintf(path, sizeof(path), "%s/%s.snapshot", artifacts_dir, package->sha256);
  int status = fetch_snapshot(package, path);
  Summary summary = {0};
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
  if (status == 0) status = snapshot_files(package, path, 1, &summary);
  unlink(path);
  rmdir(artifacts_dir);
  if (status != 0) return status;
  printf("amy: %s installed: %llu files, %llu bytes%s%s; amy files %s lists them\n"
         "amy: its environment applies when the session is next loaded\n",
         name, summary.files, summary.bytes, summary.commands[0] != '\0' ? ", commands:" : "", summary.commands, name);
  char row[8192];
  snprintf(row, sizeof(row), "INSTALL %s %s\n", package->url, package->sha256);
  return append_text(row, strlen(row), installed) == strlen(row) ? 0 : -1;
}

// The record an install left; needs no index.
static int print_record(const char *name) {
  char path[sizeof(files_dir) + 128];
  files_path(path, sizeof(path), name);
  FILE *record = strchr(name, '/') == NULL ? fopen(path, "r") : NULL;
  if (record == NULL) return -1;
  for (int byte; (byte = fgetc(record)) != EOF;) putchar(byte);
  fclose(record);
  return 0;
}

// The files of a package no install recorded, from the release's snapshot.
static int files(const Packages *index, const char *name) {
  const Package *package = find_name(index, name);
  if (package == NULL) return -1;
  char path[sizeof(artifacts_dir) + 80];
  snprintf(path, sizeof(path), "%s/%s.snapshot", artifacts_dir, package->sha256);
  Summary summary = {0};
  int status = fetch_snapshot(package, path);
  if (status == 0) status = snapshot_files(package, path, 0, &summary);
  unlink(path);
  rmdir(artifacts_dir);
  return status;
}

int main(int argc, char **argv) {
  if (argc == 2 && strcmp(argv[1], "--help") == 0) {
    usage(stdout);
    return 0;
  }
  const char *command = argc >= 2 ? argv[1] : "";
  const int listing = argc == 2 && strcmp(command, "list") == 0;
  const int recorded = argc == 2 && strcmp(command, "installed") == 0;
  const int describing = argc == 3 && strcmp(command, "info") == 0;
  const int naming = argc == 3 && strcmp(command, "files") == 0;
  const int installing = argc >= 3 && strcmp(command, "install") == 0;
  if (!listing && !recorded && !describing && !naming && !installing) {
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
  const int local = recorded || (naming && status == 0 && print_record(argv[2]) == 0);
  if (status == 0 && !local) {
    status = fetch(index_url, append_text, &index);
    if (status == -EACCES) fprintf(stderr, "amy: %s: this page's HTTP policy does not admit the site's package index\n", index_url);
    else if (status != 0) report(index_url, status);
  }
  if (status == 0 && !local) status = parse_rows(&index, index_url);
  if (status == 0 && listing) {
    for (size_t position = 0; position < index.count; ++position) {
      const Package *package = &index.items[position];
      printf("%-16s %-9s %s\n", package->name,
             find_row(&installed, package->url, package->sha256) ? "installed" : "-", package->description);
    }
  }
  const Package *package = status == 0 && describing ? find_name(&index, argv[2]) : NULL;
  if (describing && package == NULL) status = -1;
  if (package != NULL) {
    printf("%s: %s\nINSTALL %s %s\n%s\n", package->name, package->description, package->url, package->sha256,
           find_row(&installed, package->url, package->sha256) ? "installed" : "not installed");
  }
  if (status == 0 && naming && !local) status = files(&index, argv[2]);
  for (int argument = 2; status == 0 && installing && argument < argc; ++argument) {
    status = install(&index, &installed, argv[argument]);
  }
  free(index.items);
  free(index.text);
  free(installed.items);
  free(installed.text);
  return status == 0 ? 0 : 1;
}
