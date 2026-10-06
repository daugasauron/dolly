// Isolated diagnostic of the actual C parser. These test-only hooks serve the
// canonical origin from a fixture directory, as an embedding's mirror does, and
// capture shell arguments; they never run host tools.
#define main dollyfile_main
#include "../../src/dollyfile.c"
#undef main
#include <sys/resource.h>

static const char *fixture_directory;
static int capture_shell;
static int captured_input = -1;

int dolly_http_perform(const dolly_http_request *request, dolly_http_response *response) {
  static const char base[] = "https://daugasauron.com/";
  if (fixture_directory == NULL) abort();
  response->status = 404;
  if (strncmp(request->url, base, sizeof(base) - 1) != 0) return 0;
  char path[PATH_MAX];
  snprintf(path, sizeof(path), "%s/%s", fixture_directory, request->url + sizeof(base) - 1);
  Buffer input = {.limit = 1024 * 1024};
  int status = read_file_buffer(path, &input);
  response->status = status == 0 ? 200 : 404;
  if (status == 0 && input.length != 0 &&
      request->write(input.data, input.length, request->write_context) != input.length) status = -EIO;
  free(input.data);
  return status == -ENOENT ? 0 : status;
}
void dolly_http_response_dispose(dolly_http_response *response) { (void)response; }
int dolly_write_file(const char *path, const void *bytes, size_t length) {
  (void)path; (void)bytes; (void)length; abort();
}
int dolly_spawn(const char *path, int argc, char **argv, int input, int output, int error) {
  (void)output; (void)error;
  if (!capture_shell || strcmp(path, "/bin/slop") != 0 || argc != 4) abort();
  char byte;
  if (isatty(input) || read(input, &byte, 1) != 0 || read(input, &byte, 1) != 0) return -EIO;
  captured_input = input;
  char cwd[PATH_MAX];
  if (getcwd(cwd, sizeof(cwd)) == NULL) abort();
  printf("RAW-CWD:%s\nRAW-COMMAND:%s\n", cwd, argv[3]);
  return 1;
}
int dolly_wait(int pid, int *status) {
  if (!capture_shell || pid != 1) abort();
  if (fcntl(captured_input, F_GETFD) != -1 || errno != EBADF) return -EBADF;
  *status = 0;
  return 0;
}

int main(int argc, char **argv) {
  if (argc < 3) return 2;
  int result = 2;
  Scope tools = {0}, exports = {0}, own = {0};
  Engine engine = {0};

  if (strcmp(argv[1], "check") == 0) {
    // Parse DIR/Dollyfile as a custom root, fetching its modules from DIR.
    fixture_directory = argv[2];
    char root[PATH_MAX];
    snprintf(root, sizeof(root), "FILE:%s/Dollyfile", argv[2]);
    unsetenv("DOLLY_TEST_VALUE");
    result = execute_recipe(&engine, root, 0, &exports);
    const char *value = getenv("DOLLY_TEST_VALUE");
    if (value != NULL) printf("ENV-VALUE:%s\n", value);
    const Object *exported = scope_find(&engine.exports, "ENV", "DOLLY_TEST_VALUE");
    if (exported != NULL) printf("ENV-EXPORT:%s\n", exported->detail);
  } else if (strcmp(argv[1], "words") == 0) {
    char **words = NULL;
    size_t count = 0;
    result = split_words(argv[2], &words, &count);
    for (size_t index = 0; result == 0 && index < count; ++index) {
      fwrite(words[index], 1, strlen(words[index]) + 1, stdout);
    }
    free(words);
  } else if (strcmp(argv[1], "slop") == 0) {
    capture_shell = 1;
    result = execute_slop(argv[2], 1);
  } else if (strcmp(argv[1], "artifact-path") == 0) {
    dolly_fs_record records[] = {{.path = "/usr/bin/tool"}, {.path = "/explicit"}};
    Artifact artifact = {.records = records, .count = 2};
    result = artifact_has_path(&artifact, argv[2]) ? 0 : 2;
  } else if (strcmp(argv[1], "artifact-reuse") == 0) {
    const char *pin = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    engine.artifact.stream = tmpfile();
    strcpy(engine.artifact.recipe_sha256, pin);
    // There is no corresponding host file: this call must use the decoded input.
    result = read_artifact(&engine.artifact, "unused", pin);
    char *kind = NULL, *name = NULL;
    int header = 0;
    size_t operations = 0;
    char blank[] = "  ", declaration[] = "DOLLY 6";
    if (result == 0) result = process_line(&engine, "probe", 1, blank,
        NULL, 0, &tools, &exports, &own, &kind, &name, &header, &operations, 0);
    if (engine.artifact.stream == NULL) result = 2;
    if (result == 0) result = process_line(&engine, "probe", 2, declaration,
        NULL, 0, &tools, &exports, &own, &kind, &name, &header, &operations, 0);
    if (engine.artifact.stream != NULL || engine.artifact.recipe_sha256[0]) result = 2;
    engine.artifact.stream = tmpfile();
    strcpy(engine.artifact.recipe_sha256, pin);
    if (read_artifact(&engine.artifact, "/absent-dolly-fixture", "different") != -ENOENT ||
        engine.artifact.stream != NULL || engine.artifact.recipe_sha256[0]) result = 2;
  } else if (strcmp(argv[1], "read-artifact") == 0 && (argc == 4 || argc == 6)) {
    const struct rlimit limit = {64 * 1024 * 1024, 64 * 1024 * 1024};
    if (setrlimit(RLIMIT_AS, &limit) != 0) return 2;
    result = read_artifact(&engine.artifact, argv[2], argv[3]);
    if (result == 0 && argc == 6) {
      const dolly_fs_record *record = artifact_file(&engine.artifact, argv[4]);
      if (record == NULL || record->kind != DOLLY_FS_FILE) result = -EINVAL;
      else result = copy_artifact_file(&engine.artifact, record - engine.artifact.records, argv[5]);
    }
  } else if (strcmp(argv[1], "recipe-names") == 0 && argc == 4) {
    // Retained recipe paths derive from kind and name, so two locators cannot share them.
    const char *digest = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    result = append_recipe(&engine, "TOOLCHAIN", "base", "https://daugasauron.com/Dollyfile-base", digest, "base");
    if (result == 0) result = append_recipe(&engine, "APPLICATION", argv[2], argv[3], digest, "root");
  } else if (strcmp(argv[1], "entry") == 0) {
    // Arguments before "--" are the retained paths, those after it the ENTRY words.
    int index = 2;
    for (result = 0; result == 0 && index < argc && strcmp(argv[index], "--") != 0; ++index) {
      result = append_string(&engine.keep, &engine.keep_count, &engine.keep_capacity, argv[index]);
    }
    if (result == 0) result = index < argc ? set_entry(&engine, argv + index + 1, (size_t)(argc - index - 1)) : 2;
    if (result == 0) result = entry_retained(&engine) ? 0 : 2;
  } else if (strcmp(argv[1], "image-url") == 0) {
    result = valid_image_url(argv[2]) ? 0 : 2;
  } else if (strcmp(argv[1], "kind") == 0 && argc == 4) {
    result = validate_export(argv[2], "probe", argv[3]);
  }
  dispose_scope(&tools);
  dispose_scope(&exports);
  dispose_scope(&own);
  dispose_engine(&engine);
  return result == 0 ? 0 : 1;
}
