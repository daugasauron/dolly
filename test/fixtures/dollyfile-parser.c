// Isolated diagnostic of the actual C parser. These test-only hooks supply a
// recipe from a fixture and capture shell arguments; they never run host tools.
#define main dollyfile_main
#include "../../src/dollyfile.c"
#undef main

static Buffer source;
static int capture_shell;

int dolly_http_perform(const dolly_http_request *request, dolly_http_response *response) {
  if (strcmp(request->url, "http://fixture.invalid/modules/probe.dm") != 0) abort();
  response->status = 200;
  return request->write(source.data, source.length, request->write_context) == source.length ? 0 : -EIO;
}
void dolly_http_response_dispose(dolly_http_response *response) { (void)response; }
int dolly_write_file(const char *path, const void *bytes, size_t length) {
  (void)path; (void)bytes; (void)length; abort();
}
int dolly_spawn(const char *path, int argc, char **argv, int input, int output, int error) {
  (void)input; (void)output; (void)error;
  if (!capture_shell || strcmp(path, "/bin/slop") != 0 || argc != 4) abort();
  char cwd[PATH_MAX];
  if (getcwd(cwd, sizeof(cwd)) == NULL) abort();
  printf("RAW-CWD:%s\nRAW-COMMAND:%s\n", cwd, argv[3]);
  return 1;
}
int dolly_wait(int pid, int *status) {
  if (!capture_shell || pid != 1) abort();
  *status = 0;
  return 0;
}

int main(int argc, char **argv) {
  if (argc < 3) return 2;
  int result = 2;
  Scope tools = {0}, exports = {0};
  Engine engine = {.host_base = strdup("http://fixture.invalid")};

  if (strcmp(argv[1], "parse") == 0) {
    source.limit = MAX_RECIPE_BYTES;
    unsetenv("DOLLY_TEST_VALUE");
    result = read_file_buffer(argv[2], &source);
    if (result == 0) result = execute_recipe(&engine, "/modules/probe.dm", NULL,
                                             2, &tools, 0, 0, &exports);
    const char *value = getenv("DOLLY_TEST_VALUE");
    if (value != NULL) printf("ENV-VALUE:%s\n", value);
    free(source.data);
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
  } else if (strcmp(argv[1], "image-locator") == 0) {
    result = valid_image_locator(argv[2]) ? 0 : 2;
  } else if (strcmp(argv[1], "path") == 0) {
    result = valid_absolute_path(argv[2]) ? 0 : 2;
  } else if (strcmp(argv[1], "kind") == 0 && argc == 4) {
    result = validate_export(argv[2], "probe", argv[3], NULL, 0);
  }
  dispose_scope(&tools);
  dispose_scope(&exports);
  dispose_engine(&engine);
  return result == 0 ? 0 : 1;
}
