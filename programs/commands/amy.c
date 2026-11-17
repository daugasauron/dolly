// amy installs the packages an image directory publishes into the running session.
// The server is the directory /etc/dolly/packages-server names (amy server URL),
// else the one the page loads its images from, which packages@0 names. Its index
// is its public amy-index.txt, "NAME PATH SHA256 DESCRIPTION" per package.
// packages@0 hands over the index and each verified package snapshot over its
// own channel (dolly-packages-0.wat); of another server than the page's, each
// file only where the page's HTTP policy admits it. An install is the Dollyfile row
// INSTALL PATH SHA256, executed against the live filesystem by /bin/dollyfile
// and recorded in /etc/dolly/installed. A package's
// snapshot records the INSTALL rows of its own recipe: those come first. In an
// image that declares nena@0, amy has nena enable the host modules a package
// needs that the session lacks; elsewhere the engine refuses the row.
#define _POSIX_C_SOURCE 200809L

#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#include <dolly/host-abi.h>
#include <dolly/packages.h>
#include <dolly/runtime.h>

static const char server_path[] = "/etc/dolly/packages-server";
static const char installed_path[] = "/etc/dolly/installed";
// The engine's receipt of an image, which names its host modules, and the
// modules the session enabled since, one name@version a line.
static const char receipt_path[] = "/etc/dolly/artifact";
static const char enabled_path[] = "/etc/dolly/enabled";
static const char artifacts_dir[] = "/etc/dolly/artifacts";
static const char files_dir[] = "/etc/dolly/files";
enum { MAX_INDEX_BYTES = 64 * 1024, MAX_RECEIPT_BYTES = 16 * 1024 * 1024, MAX_SERVER_BYTES = 2048 };
static char server[MAX_SERVER_BYTES + 1];

typedef struct { char *name, *recipe, *sha256, *description; } Package;
typedef struct { Package *items; size_t count; char *text; } Packages;

static void usage(FILE *stream) {
  fputs("usage: amy list              the site's packages: NAME, installed, description\n"
        "       amy info NAME         its description and INSTALL row\n"
        "       amy install NAME...   install packages; says what each added\n"
        "       amy files NAME        the files NAME installs outside /etc/dolly: SIZE PATH\n"
        "       amy installed         the installed rows: NAME PATH SHA256\n"
        "       amy server            the image directory packages come from\n"
        "       amy server URL        take them from URL for this session; remove\n"
        "                             /etc/dolly/packages-server for the page's own\n", stream);
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

static char *read_file(const char *path, size_t *size);

// What packages@0 hands over (KIND, from DIRECTORY at PIN) into PATH, which
// must not exist; 0 or a negative errno, said on standard error.
static int channel(uint32_t kind, const char *directory, const char *pin, const char *path, const char *subject) {
  const int status = dolly_packages_fetch(kind, directory, pin, path);
  if (status == -ENOSYS) fputs("amy: the package service is unavailable: the image must declare REQUIRES HOST packages@0\n", stderr);
  else if (status == -EACCES) fprintf(stderr, "amy: %s: this page's HTTP policy does not admit it\n", subject);
  else if (status == -ENOENT && pin != NULL) fprintf(stderr, "amy: %s publishes no package with that recipe pin\n", directory);
  else if (status != 0) fprintf(stderr, "amy: %s: %s\n", subject, strerror(-status));
  return status;
}

// A text packages@0 hands over, at most MAX_INDEX_BYTES, into `packages`.
static int channel_text(uint32_t kind, const char *directory, Packages *packages, const char *subject) {
  char path[] = "/tmp/amy-text-XXXXXX";
  const int descriptor = mkstemp(path);
  if (descriptor < 0 || close(descriptor) != 0 || unlink(path) != 0) return -errno;
  int status = channel(kind, directory, NULL, path, subject);
  size_t size = 0;
  char *text = status == 0 ? read_file(path, &size) : NULL;
  if (status == 0 && (text == NULL || size > MAX_INDEX_BYTES || strlen(text) != size)) status = -EIO;
  if (status == 0) packages->text = text;
  else free(text);
  unlink(path);
  return status;
}

// Whether `url` can name an image directory: http or https, ending in /, and
// nothing a URL reads as a query, a fragment or a separator.
static int valid_server(const char *url) {
  const size_t length = strlen(url);
  if ((strncmp(url, "http://", 7) != 0 && strncmp(url, "https://", 8) != 0) ||
      length > MAX_SERVER_BYTES || url[length - 1] != '/') return 0;
  for (const unsigned char *at = (const unsigned char *)url; *at != '\0'; ++at) {
    if (*at <= ' ' || *at == 0x7f || *at == '?' || *at == '#') return 0;
  }
  return 1;
}

// Sets `server`: the session's choice, else the page's image directory.
static int find_server(void) {
  FILE *stream = fopen(server_path, "r");
  if (stream != NULL) {
    const int line = fgets(server, sizeof(server), stream) != NULL;
    fclose(stream);
    server[strcspn(server, "\n")] = '\0';
    if (line && valid_server(server)) return 0;
    fprintf(stderr, "amy: %s holds no http or https URL of an image directory, ending in /\n", server_path);
    return -1;
  }
  if (errno != ENOENT) {
    fprintf(stderr, "amy: %s: %s\n", server_path, strerror(errno));
    return -1;
  }
  Packages answer = {0};
  int status = channel_text(DOLLY_PACKAGES_KIND_DIRECTORY, NULL, &answer, "the page's image directory");
  if (status == 0 && !valid_server(answer.text)) status = -EIO;
  if (status == 0) strcpy(server, answer.text);
  free(answer.text);
  return status;
}

// amy server URL: the session's server from now on.
static int set_server(const char *url) {
  char named[MAX_SERVER_BYTES + 2];
  snprintf(named, sizeof(named), "%s%s", url, *url != '\0' && url[strlen(url) - 1] != '/' ? "/" : "");
  if (!valid_server(named)) {
    fprintf(stderr, "amy: %s: not an http or https URL of an image directory\n", url);
    return -1;
  }
  FILE *stream = fopen(server_path, "w");
  if (stream == NULL || fprintf(stream, "%s\n", named) < 0 || fclose(stream) != 0) {
    fprintf(stderr, "amy: %s: %s\n", server_path, strerror(errno));
    return -1;
  }
  return 0;
}

// The image a recipe's path names: Dollyfile-NAME, or default for Dollyfile.
static const char *package_name(const char *recipe) {
  const char *file = strrchr(recipe, '/');
  file = file == NULL ? recipe : file + 1;
  return strncmp(file, "Dollyfile-", 10) == 0 ? file + 10 : "default";
}

// Index rows are NAME PATH SHA256 DESCRIPTION. The record's are INSTALL PATH
// SHA256, where the name is the one the path names.
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
        .recipe = words[1], .sha256 = words[2], .description = words[3]};
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

static const Package *find_row(const Packages *packages, const char *recipe, const char *sha256) {
  for (size_t index = 0; index < packages->count; ++index) {
    const Package *package = &packages->items[index];
    if (strcmp(package->recipe, recipe) == 0 && strcmp(package->sha256, sha256) == 0) return package;
  }
  return NULL;
}

// Whether the session's record holds a row. The engine writes the record, so it is read each time.
static int session_holds(const char *recipe, const char *sha256) {
  Packages record = {0};
  const int held = read_installed(&record) == 0 && find_row(&record, recipe, sha256) != NULL;
  free(record.items);
  free(record.text);
  return held;
}

static const Package *find_name(const Packages *index, const char *name) {
  for (size_t position = 0; position < index->count; ++position) {
    if (strcmp(index->items[position].name, name) == 0) return &index->items[position];
  }
  fprintf(stderr, "amy: %s: %s publishes no such package; amy list shows them\n", name, server);
  return NULL;
}

static uint64_t little_endian(const unsigned char *bytes, size_t width) {
  uint64_t value = 0;
  while (width-- != 0) value = value << 8 | bytes[width];
  return value;
}

typedef struct { unsigned long long files, bytes; char commands[1024]; int environment; } Summary;

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
    // An environment record without names is its 16-byte header (programs/dollyfile.c).
    if (strcmp(path, "/etc/dolly/environment") == 0) summary->environment = size > 16;
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

// One file of a snapshot, read whole and NUL-terminated into `*bytes`, which
// stays NULL when the snapshot holds no such file.
static int snapshot_file(const char *snapshot, const char *member, size_t limit, char **bytes, size_t *size) {
  FILE *stream = fopen(snapshot, "rb");
  unsigned char header[16];
  char path[4096];
  int valid = stream != NULL && fread(header, 1, sizeof(header), stream) == sizeof(header) &&
      memcmp(header, "DOLLYSNP", 8) == 0;
  for (uint64_t records = valid ? little_endian(header + 12, 4) : 0; valid && records != 0; --records) {
    valid = fread(header, 1, sizeof(header), stream) == sizeof(header);
    const uint64_t length = little_endian(header + 4, 4), stored = little_endian(header + 8, 8);
    valid = valid && length < sizeof(path) && fread(path, 1, length, stream) == length;
    if (!valid) break;
    path[length] = '\0';
    if (strcmp(path, member) != 0) {
      valid = fseeko(stream, (off_t)stored, SEEK_CUR) == 0;
      continue;
    }
    *bytes = stored < limit ? calloc(1, stored + 1) : NULL;
    valid = *bytes != NULL && fread(*bytes, 1, stored, stream) == stored;
    *size = stored;
    break;
  }
  if (stream != NULL) fclose(stream);
  return valid ? 0 : -1;
}

// The rows a package's snapshot records: the packages its recipe installs, dependencies first.
static int snapshot_rows(const char *snapshot, Packages *rows) {
  size_t size;
  return snapshot_file(snapshot, installed_path, MAX_INDEX_BYTES, &rows->text, &size) == 0 ? parse_rows(rows, snapshot) : -1;
}

// A file of the session read whole and NUL-terminated; NULL when it cannot be.
static char *read_file(const char *path, size_t *size) {
  struct stat metadata;
  FILE *stream = stat(path, &metadata) == 0 && metadata.st_size < MAX_RECEIPT_BYTES ? fopen(path, "rb") : NULL;
  char *bytes = stream != NULL ? calloc(1, (size_t)metadata.st_size + 1) : NULL;
  const int whole = bytes != NULL && fread(bytes, 1, (size_t)metadata.st_size, stream) == (size_t)metadata.st_size;
  if (stream != NULL) fclose(stream);
  if (!whole) {
    free(bytes);
    return NULL;
  }
  *size = (size_t)metadata.st_size;
  return bytes;
}

// The host modules an engine receipt names, appended to `hosts` one a line.
// A receipt (programs/dollyfile.c, DOLLYART 5) holds the recipe chain, five texts
// a recipe, then the modules; a text is its length and its bytes.
static int receipt_hosts(const char *receipt, size_t size, char *hosts, size_t capacity) {
  const unsigned char *at = (const unsigned char *)receipt, *end = at + size;
  if (size < 16 || memcmp(at, "DOLLYART", 8) != 0 || little_endian(at + 8, 4) != 5) return -1;
  const uint64_t texts = little_endian(at + 12, 4) * 5;
  at += 16;
  for (uint64_t index = 0; index < texts; ++index) {
    if (end - at < 4 || (uint64_t)(end - at - 4) < little_endian(at, 4)) return -1;
    at += 4 + little_endian(at, 4);
  }
  if (end - at < 4 || little_endian(at, 4) > DOLLY_HOST_MAX_RECORDS) return -1;
  const uint64_t count = little_endian(at, 4);
  at += 4;
  for (uint64_t index = 0; index < count; ++index) {
    const size_t used = strlen(hosts);
    if (end - at < 4) return -1;
    const uint64_t length = little_endian(at, 4);
    if ((uint64_t)(end - at - 4) < length || length + 2 > capacity - used) return -1;
    memcpy(hosts + used, at + 4, length);
    memcpy(hosts + used + length, "\n", 2);
    at += 4 + length;
  }
  return 0;
}

// Whether `line` is one of the lines of `lines`.
static int holds_line(const char *lines, const char *line) {
  const size_t length = strlen(line);
  for (const char *at = lines; at != NULL && *at != '\0';) {
    if (strncmp(at, line, length) == 0 && (at[length] == '\n' || at[length] == '\0')) return 1;
    at = strchr(at, '\n');
    if (at != NULL) ++at;
  }
  return 0;
}

// Enables the host modules the package in `snapshot` needs that the session
// neither declares nor has enabled, where the image declares nena@0: nena
// asks the page for each switch and says what it enabled. Elsewhere the
// engine refuses the row, naming them. -1 when nena did not enable them all.
static int enable_needed(const char *name, const char *snapshot) {
  char needed[4096] = "", declared[4096] = "", *arguments[DOLLY_HOST_MAX_RECORDS + 3] = {"/bin/nena", "enable"};
  char *receipt = NULL, *cursor = NULL;
  size_t size = 0, own_size = 0, enabled_size = 0;
  char *own = read_file(receipt_path, &own_size), *enabled = read_file(enabled_path, &enabled_size);
  int status = own != NULL && receipt_hosts(own, own_size, declared, sizeof(declared)) == 0 &&
      snapshot_file(snapshot, receipt_path, MAX_RECEIPT_BYTES, &receipt, &size) == 0 && receipt != NULL &&
      receipt_hosts(receipt, size, needed, sizeof(needed)) == 0 ? 0 : -1;
  if (status != 0) fprintf(stderr, "amy: %s: cannot read the host modules it needs\n", name);
  int count = 2;
  for (char *module = status == 0 ? strtok_r(needed, "\n", &cursor) : NULL; module != NULL; module = strtok_r(NULL, "\n", &cursor)) {
    if (!holds_line(declared, module) && !holds_line(enabled, module)) arguments[count++] = module;
  }
  arguments[count] = NULL;
  if (status == 0 && count > 2 && holds_line(declared, "nena@0")) {
    printf("amy: %s needs", name);
    for (int index = 2; index < count; ++index) printf("%s%s", index == 2 ? " " : index + 1 == count ? " and " : ", ", arguments[index]);
    printf(": nena enables %s\n", count == 3 ? "it" : "them");
    fflush(stdout);
    int exit_status = 126;
    const int pid = dolly_spawn(arguments[0], count, arguments, STDIN_FILENO, STDOUT_FILENO, STDERR_FILENO);
    const int waited = pid < 0 ? pid : dolly_wait(pid, &exit_status);
    if (waited < 0) fprintf(stderr, "amy: %s: %s\n", arguments[0], strerror(-waited));
    status = waited >= 0 && exit_status == 0 ? 0 : -1;
  }
  free(receipt);
  free(own);
  free(enabled);
  return status;
}

// Fetches a package's verified snapshot, by its pin in the server's catalog,
// to `path`; the caller removes it.
static int fetch_snapshot(const Package *package, const char *path) {
  if ((mkdir(artifacts_dir, 0755) != 0 && errno != EEXIST) || (unlink(path) != 0 && errno != ENOENT)) {
    fprintf(stderr, "amy: %s: %s\n", path, strerror(errno));
    return -1;
  }
  fprintf(stderr, "amy: fetching %s from %s\n", package->name, server);
  return channel(DOLLY_PACKAGES_KIND_SNAPSHOT, server, package->sha256, path, package->name);
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

// Runs the row INSTALL RECIPE SHA256 against the session. The engine's log is
// diagnostics here; amy's stdout reports the result.
static int engine_install(const Package *package) {
  char *arguments[] = {"/bin/dollyfile", "install", package->recipe, package->sha256, NULL};
  int exit_status = 126;
  const int pid = dolly_spawn(arguments[0], 4, arguments, STDIN_FILENO, STDERR_FILENO, STDERR_FILENO);
  const int waited = pid < 0 ? pid : dolly_wait(pid, &exit_status);
  if (waited < 0) fprintf(stderr, "amy: %s: %s\n", arguments[0], strerror(-waited));
  return waited < 0 ? -1 : exit_status;
}

// Installs the row INSTALL RECIPE SHA256. The engine decides first whether
// the package may be installed here; it ends with 3 when a row the package
// records is not installed yet: those are installed, each as an install of
// its own, and the engine is asked again. Its files are listed first: the
// engine moves them out of the snapshot.
static int install_row(const char *name, const char *recipe, const char *sha256) {
  const Package package = {.name = (char *)name, .recipe = (char *)recipe, .sha256 = (char *)sha256};
  char path[sizeof(artifacts_dir) + 80];
  snprintf(path, sizeof(path), "%s/%s.snapshot", artifacts_dir, sha256);
  Summary summary = {0};
  int status = fetch_snapshot(&package, path);
  if (status == 0) status = snapshot_files(&package, path, 1, &summary);
  if (status == 0) status = enable_needed(name, path);
  if (status == 0 && (status = engine_install(&package)) == 3) {
    Packages needs = {0};
    if ((status = snapshot_rows(path, &needs)) != 0) fprintf(stderr, "amy: %s: cannot read its record\n", name);
    for (size_t index = 0; status == 0 && index < needs.count; ++index) {
      const Package *need = &needs.items[index];
      if (!session_holds(need->recipe, need->sha256)) status = install_row(need->name, need->recipe, need->sha256);
    }
    free(needs.items);
    free(needs.text);
    if (status == 0) status = engine_install(&package);
  }
  unlink(path);
  rmdir(artifacts_dir);
  if (status != 0) {
    char record[sizeof(files_dir) + 128];
    files_path(record, sizeof(record), name);
    unlink(record);
    fprintf(stderr, "amy: %s: not installed\n", name);
    return -1;
  }
  printf("amy: %s installed: %llu files, %llu bytes%s%s; amy files %s lists them\n%s",
         name, summary.files, summary.bytes, summary.commands[0] != '\0' ? ", commands:" : "", summary.commands, name,
         summary.environment ? "amy: the environment variables it sets apply when the session is next loaded; the rest works now\n" : "");
  return 0;
}

static int install(const Packages *index, const char *name) {
  const Package *package = find_name(index, name);
  if (package == NULL) return -1;
  if (session_holds(package->recipe, package->sha256)) {
    printf("amy: %s is already installed\n", name);
    return 0;
  }
  return install_row(name, package->recipe, package->sha256);
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
  const int serving = (argc == 2 || argc == 3) && strcmp(command, "server") == 0;
  if (!listing && !recorded && !describing && !naming && !installing && !serving) {
    usage(stderr);
    return 2;
  }
  if (serving && argc == 3) return set_server(argv[2]) == 0 ? 0 : 1;
  if (serving) return find_server() == 0 && printf("%s\n", server) > 0 ? 0 : 1;
  Packages index = {0}, installed = {0};
  int status = read_installed(&installed);
  if (status == 0 && recorded) {
    for (size_t position = 0; position < installed.count; ++position) {
      const Package *package = &installed.items[position];
      printf("%s %s %s\n", package->name, package->recipe, package->sha256);
    }
  }
  const int local = recorded || (naming && status == 0 && print_record(argv[2]) == 0);
  char index_url[MAX_SERVER_BYTES + 16];
  if (status == 0 && !local && (status = find_server()) == 0) {
    snprintf(index_url, sizeof(index_url), "%samy-index.txt", server);
    status = channel_text(DOLLY_PACKAGES_KIND_INDEX, server, &index, index_url);
    if (status == 0) status = parse_rows(&index, index_url);
  }
  if (status == 0 && listing) {
    for (size_t position = 0; position < index.count; ++position) {
      const Package *package = &index.items[position];
      printf("%-16s %-9s %s\n", package->name,
             find_row(&installed, package->recipe, package->sha256) ? "installed" : "-", package->description);
    }
  }
  const Package *package = status == 0 && describing ? find_name(&index, argv[2]) : NULL;
  if (describing && package == NULL) status = -1;
  if (package != NULL) {
    printf("%s: %s\nINSTALL %s %s\n%s\n", package->name, package->description, package->recipe, package->sha256,
           find_row(&installed, package->recipe, package->sha256) ? "installed" : "not installed");
  }
  if (status == 0 && naming && !local) status = files(&index, argv[2]);
  for (int argument = 2; status == 0 && installing && argument < argc; ++argument) {
    status = install(&index, argv[argument]);
  }
  free(index.items);
  free(index.text);
  free(installed.items);
  free(installed.text);
  return status == 0 ? 0 : 1;
}
