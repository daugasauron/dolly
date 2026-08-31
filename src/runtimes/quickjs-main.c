#include <errno.h>
#include <dirent.h>
#include <fcntl.h>
#include <limits.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#include <dolly/download.h>
#include <dolly/http.h>
#include <dolly/runtime.h>

#include "quickjs.h"
#include "quickjs-runner.h"

enum {
  DOLLY_JS_USAGE = 64,
  DOLLY_JS_MAX_HTTP_BYTES = 16 * 1024 * 1024,
  DOLLY_JS_MAX_RANDOM_BYTES = 1024 * 1024,
  DOLLY_JS_MAX_STACK_BYTES = 8 * 1024 * 1024,
};

typedef struct {
  unsigned char *data;
  size_t length;
} byte_buffer;

static int janis_exit_requested;
static int janis_exit_status;
static int janis_interrupted;

static void print_exception(JSContext *context);

static int quickjs_interrupt_handler(JSRuntime *runtime, void *opaque) {
  (void)runtime;
  (void)opaque;
  if (dolly_interrupt_poll() != SIGINT) return 0;
  janis_interrupted = 1;
  return 1;
}

static void print_usage(FILE *stream) {
  fputs("usage: qjs [-m] [-e CODE | FILE [ARG...]]\n"
        "       qjs --help\n"
        "       qjs --version\n",
        stream);
}

static char *read_stream(FILE *stream, size_t *length) {
  size_t capacity = 4096;
  size_t used = 0;
  char *buffer = malloc(capacity + 1);
  if (buffer == NULL) return NULL;

  for (;;) {
    if (used == capacity) {
      if (capacity > SIZE_MAX / 2) {
        free(buffer);
        errno = EOVERFLOW;
        return NULL;
      }
      capacity *= 2;
      char *grown = realloc(buffer, capacity + 1);
      if (grown == NULL) {
        free(buffer);
        return NULL;
      }
      buffer = grown;
    }
    const size_t count = fread(buffer + used, 1, capacity - used, stream);
    used += count;
    if (count == 0) {
      if (ferror(stream)) {
        free(buffer);
        return NULL;
      }
      break;
    }
  }
  buffer[used] = '\0';
  *length = used;
  return buffer;
}

static char *read_file(const char *path, size_t *length) {
  if (strcmp(path, "-") == 0) return read_stream(stdin, length);
  FILE *file = fopen(path, "rb");
  if (file == NULL) return NULL;
  char *source = read_stream(file, length);
  if (source == NULL) {
    const int saved_errno = errno;
    fclose(file);
    errno = saved_errno;
    return NULL;
  }
  if (fclose(file) != 0) {
    free(source);
    return NULL;
  }
  return source;
}

static char *js_string_copy(JSContext *context, const char *text) {
  const size_t length = strlen(text);
  char *copy = js_malloc(context, length + 1);
  if (copy == NULL) return NULL;
  memcpy(copy, text, length + 1);
  return copy;
}

static char *normalize_absolute_path(JSContext *context, const char *path) {
  const size_t length = strlen(path);
  char *normalized = js_malloc(context, length + 2);
  if (normalized == NULL) return NULL;

  size_t output = 0;
  normalized[output++] = '/';
  for (size_t input = 0; input < length;) {
    while (path[input] == '/') input++;
    const size_t start = input;
    while (path[input] != '\0' && path[input] != '/') input++;
    const size_t component_length = input - start;
    if (component_length == 0 ||
        (component_length == 1 && path[start] == '.')) {
      continue;
    }
    if (component_length == 2 && path[start] == '.' && path[start + 1] == '.') {
      if (output > 1) {
        output--;
        while (output > 1 && normalized[output - 1] != '/') output--;
      }
      continue;
    }
    if (output > 1 && normalized[output - 1] != '/') normalized[output++] = '/';
    memcpy(normalized + output, path + start, component_length);
    output += component_length;
  }
  normalized[output] = '\0';
  return normalized;
}

static char *module_normalize(JSContext *context, const char *base_name,
                              const char *module_name, void *opaque) {
  (void)opaque;
  if (module_name[0] == '/') {
    return normalize_absolute_path(context, module_name);
  }
  if (module_name[0] != '.' ||
      (module_name[1] != '/' &&
       !(module_name[1] == '.' && module_name[2] == '/'))) {
    JS_ThrowReferenceError(context,
                           "unsupported bare module specifier: %s",
                           module_name);
    return NULL;
  }

  const char *slash = strrchr(base_name, '/');
  const size_t directory_length = slash == NULL ? 0 : (size_t)(slash - base_name);
  const size_t module_length = strlen(module_name);
  if (directory_length > SIZE_MAX - module_length - 2) {
    JS_ThrowOutOfMemory(context);
    return NULL;
  }
  char *joined = malloc(directory_length + module_length + 2);
  if (joined == NULL) {
    JS_ThrowOutOfMemory(context);
    return NULL;
  }
  if (directory_length == 0) {
    joined[0] = '/';
    memcpy(joined + 1, module_name, module_length + 1);
  } else {
    memcpy(joined, base_name, directory_length);
    joined[directory_length] = '/';
    memcpy(joined + directory_length + 1, module_name, module_length + 1);
  }
  char *normalized = normalize_absolute_path(context, joined);
  free(joined);
  return normalized;
}

static int set_import_meta(JSContext *context, JSValueConst module,
                           int is_main) {
  JSModuleDef *definition = JS_VALUE_GET_PTR(module);
  JSAtom name_atom = JS_GetModuleName(context, definition);
  const char *name = JS_AtomToCString(context, name_atom);
  JS_FreeAtom(context, name_atom);
  if (name == NULL) return -1;

  const size_t length = strlen(name);
  char *url = malloc(length + sizeof("file://"));
  if (url == NULL) {
    JS_FreeCString(context, name);
    JS_ThrowOutOfMemory(context);
    return -1;
  }
  memcpy(url, "file://", sizeof("file://") - 1);
  memcpy(url + sizeof("file://") - 1, name, length + 1);
  JS_FreeCString(context, name);

  JSValue meta = JS_GetImportMeta(context, definition);
  if (JS_IsException(meta)) {
    free(url);
    return -1;
  }
  const int url_status = JS_DefinePropertyValueStr(
      context, meta, "url", JS_NewString(context, url), JS_PROP_C_W_E);
  const int main_status = JS_DefinePropertyValueStr(
      context, meta, "main", JS_NewBool(context, is_main), JS_PROP_C_W_E);
  JS_FreeValue(context, meta);
  free(url);
  return url_status < 0 || main_status < 0 ? -1 : 0;
}

static JSModuleDef *module_loader(JSContext *context, const char *module_name,
                                  void *opaque) {
  (void)opaque;
  size_t length = 0;
  char *source = read_file(module_name, &length);
  if (source == NULL) {
    JS_ThrowReferenceError(context, "could not load module '%s': %s",
                           module_name, strerror(errno));
    return NULL;
  }
  JSValue module = JS_Eval(context, source, length, module_name,
                           JS_EVAL_TYPE_MODULE | JS_EVAL_FLAG_COMPILE_ONLY);
  free(source);
  if (JS_IsException(module)) return NULL;
  if (set_import_meta(context, module, 0) < 0) {
    JS_FreeValue(context, module);
    return NULL;
  }
  JSModuleDef *definition = JS_VALUE_GET_PTR(module);
  JS_FreeValue(context, module);
  return definition;
}

static char *absolute_entry_name(JSContext *context, const char *name) {
  if (name[0] == '<' || strcmp(name, "-") == 0) return js_string_copy(context, name);
  if (name[0] == '/') return normalize_absolute_path(context, name);

  char cwd[PATH_MAX];
  if (getcwd(cwd, sizeof(cwd)) == NULL) {
    JS_ThrowReferenceError(context, "could not resolve module '%s': %s",
                           name, strerror(errno));
    return NULL;
  }
  const size_t cwd_length = strlen(cwd);
  const size_t name_length = strlen(name);
  if (cwd_length > SIZE_MAX - name_length - 2) {
    JS_ThrowOutOfMemory(context);
    return NULL;
  }
  char *joined = malloc(cwd_length + name_length + 2);
  if (joined == NULL) {
    JS_ThrowOutOfMemory(context);
    return NULL;
  }
  memcpy(joined, cwd, cwd_length);
  joined[cwd_length] = '/';
  memcpy(joined + cwd_length + 1, name, name_length + 1);
  char *normalized = normalize_absolute_path(context, joined);
  free(joined);
  return normalized;
}

static JSValue write_arguments(JSContext *context, FILE *stream,
                               int argc, JSValueConst *argv) {
  for (int index = 0; index < argc; index++) {
    const char *text = JS_ToCString(context, argv[index]);
    if (text == NULL) return JS_EXCEPTION;
    if (index != 0) fputc(' ', stream);
    fputs(text, stream);
    JS_FreeCString(context, text);
  }
  fputc('\n', stream);
  return JS_UNDEFINED;
}

static JSValue js_print(JSContext *context, JSValueConst this_value,
                        int argc, JSValueConst *argv) {
  (void)this_value;
  return write_arguments(context, stdout, argc, argv);
}

static JSValue js_print_error(JSContext *context, JSValueConst this_value,
                              int argc, JSValueConst *argv) {
  (void)this_value;
  return write_arguments(context, stderr, argc, argv);
}

static JSValue js_dolly_write(JSContext *context, JSValueConst this_value,
                              int argc, JSValueConst *argv, int magic) {
  (void)this_value;
  FILE *stream = magic == 0 ? stdout : stderr;
  if (argc == 0) return JS_UNDEFINED;
  size_t length = 0;
  const char *text = JS_ToCStringLen(context, &length, argv[0]);
  if (text == NULL) return JS_EXCEPTION;
  const size_t written = fwrite(text, 1, length, stream);
  JS_FreeCString(context, text);
  if (written != length || fflush(stream) != 0) {
    return JS_ThrowInternalError(context, "terminal write failed: %s",
                                 strerror(errno));
  }
  return JS_NewInt32(context, 1);
}

static JSValue js_dolly_getenv(JSContext *context, JSValueConst this_value,
                               int argc, JSValueConst *argv) {
  (void)this_value;
  if (argc < 1) return JS_ThrowTypeError(context, "getenv requires a name");
  const char *name = JS_ToCString(context, argv[0]);
  if (name == NULL) return JS_EXCEPTION;
  const char *value = getenv(name);
  JSValue result = value == NULL ? JS_UNDEFINED : JS_NewString(context, value);
  JS_FreeCString(context, name);
  return result;
}

static JSValue js_dolly_setenv(JSContext *context, JSValueConst this_value,
                               int argc, JSValueConst *argv) {
  (void)this_value;
  if (argc < 1) return JS_ThrowTypeError(context, "setenv requires a name");
  const char *name = JS_ToCString(context, argv[0]);
  if (name == NULL) return JS_EXCEPTION;
  int status;
  if (argc < 2 || JS_IsUndefined(argv[1]) || JS_IsNull(argv[1])) {
    status = unsetenv(name);
  } else {
    const char *value = JS_ToCString(context, argv[1]);
    if (value == NULL) {
      JS_FreeCString(context, name);
      return JS_EXCEPTION;
    }
    status = setenv(name, value, 1);
    JS_FreeCString(context, value);
  }
  JS_FreeCString(context, name);
  if (status != 0) {
    return JS_ThrowInternalError(context, "could not update environment: %s",
                                 strerror(errno));
  }
  return JS_UNDEFINED;
}

static JSValue js_dolly_cwd(JSContext *context, JSValueConst this_value,
                            int argc, JSValueConst *argv) {
  (void)this_value;
  (void)argc;
  (void)argv;
  char buffer[PATH_MAX];
  if (getcwd(buffer, sizeof(buffer)) == NULL) {
    return JS_ThrowInternalError(context, "getcwd failed: %s", strerror(errno));
  }
  return JS_NewString(context, buffer);
}

static JSValue js_dolly_chdir(JSContext *context, JSValueConst this_value,
                              int argc, JSValueConst *argv) {
  (void)this_value;
  if (argc < 1) return JS_ThrowTypeError(context, "chdir requires a path");
  const char *path = JS_ToCString(context, argv[0]);
  if (path == NULL) return JS_EXCEPTION;
  const int status = chdir(path);
  JS_FreeCString(context, path);
  if (status != 0) {
    return JS_ThrowInternalError(context, "chdir failed: %s", strerror(errno));
  }
  return JS_UNDEFINED;
}

static JSValue js_dolly_read_file(JSContext *context,
                                  JSValueConst this_value,
                                  int argc, JSValueConst *argv) {
  (void)this_value;
  if (argc < 1) return JS_ThrowTypeError(context, "readFile requires a path");
  const char *path = JS_ToCString(context, argv[0]);
  if (path == NULL) return JS_EXCEPTION;
  size_t length = 0;
  char *contents = read_file(path, &length);
  const int saved_errno = errno;
  JS_FreeCString(context, path);
  if (contents == NULL) {
    return JS_ThrowInternalError(context, "readFile failed: %s",
                                 strerror(saved_errno));
  }
  JSValue result = JS_NewStringLen(context, contents, length);
  free(contents);
  return result;
}

static JSValue js_dolly_write_file(JSContext *context,
                                   JSValueConst this_value,
                                   int argc, JSValueConst *argv) {
  (void)this_value;
  if (argc < 2) {
    return JS_ThrowTypeError(context, "writeFile requires a path and contents");
  }
  const char *path = JS_ToCString(context, argv[0]);
  if (path == NULL) return JS_EXCEPTION;
  size_t length = 0;
  const char *contents = JS_ToCStringLen(context, &length, argv[1]);
  if (contents == NULL) {
    JS_FreeCString(context, path);
    return JS_EXCEPTION;
  }
  const int status = dolly_write_file(path, contents, length);
  JS_FreeCString(context, contents);
  JS_FreeCString(context, path);
  if (status != 0) {
    return JS_ThrowInternalError(context, "writeFile failed: %s",
                                 strerror(-status));
  }
  return JS_UNDEFINED;
}

static JSValue js_dolly_read_file_bytes(JSContext *context,
                                        JSValueConst this_value,
                                        int argc, JSValueConst *argv) {
  (void)this_value;
  if (argc < 1) return JS_ThrowTypeError(context, "readFileBytes requires a path");
  const char *path = JS_ToCString(context, argv[0]);
  if (path == NULL) return JS_EXCEPTION;
  size_t length = 0;
  char *contents = read_file(path, &length);
  const int saved_errno = errno;
  JS_FreeCString(context, path);
  if (contents == NULL) {
    return JS_ThrowInternalError(context, "readFileBytes failed: %s",
                                 strerror(saved_errno));
  }
  JSValue result = JS_NewUint8ArrayCopy(
      context, (const uint8_t *)contents, length);
  free(contents);
  return result;
}

static JSValue js_dolly_write_file_bytes(JSContext *context,
                                         JSValueConst this_value,
                                         int argc, JSValueConst *argv) {
  (void)this_value;
  if (argc < 2) {
    return JS_ThrowTypeError(context, "writeFileBytes requires path and bytes");
  }
  const char *path = JS_ToCString(context, argv[0]);
  if (path == NULL) return JS_EXCEPTION;
  size_t length = 0;
  uint8_t *bytes = JS_GetUint8Array(context, &length, argv[1]);
  if (bytes == NULL) {
    JS_FreeCString(context, path);
    return JS_ThrowTypeError(context, "writeFileBytes requires Uint8Array");
  }
  const int status = dolly_write_file(path, bytes, length);
  JS_FreeCString(context, path);
  if (status != 0) {
    return JS_ThrowInternalError(context, "writeFileBytes failed: %s",
                                 strerror(-status));
  }
  return JS_UNDEFINED;
}

static JSValue js_dolly_download(JSContext *context, JSValueConst this_value,
                                 int argc, JSValueConst *argv) {
  (void)this_value;
  if (argc < 1) return JS_ThrowTypeError(context, "download requires a path");
  const char *path = JS_ToCString(context, argv[0]);
  if (path == NULL) return JS_EXCEPTION;
  const int status = dolly_download_file(path);
  JS_FreeCString(context, path);
  if (status != 0) {
    return JS_ThrowInternalError(context, "download failed: %s", strerror(-status));
  }
  return JS_UNDEFINED;
}

static JSValue js_dolly_append_file(JSContext *context,
                                    JSValueConst this_value,
                                    int argc, JSValueConst *argv) {
  (void)this_value;
  if (argc < 2) return JS_ThrowTypeError(context, "appendFile requires path and data");
  const char *path = JS_ToCString(context, argv[0]);
  if (path == NULL) return JS_EXCEPTION;
  size_t length = 0;
  const unsigned char *bytes = NULL;
  const char *text = NULL;
  if (JS_IsString(argv[1])) {
    text = JS_ToCStringLen(context, &length, argv[1]);
    if (text == NULL) {
      JS_FreeCString(context, path);
      return JS_EXCEPTION;
    }
    bytes = (const unsigned char *)text;
  } else {
    bytes = JS_GetUint8Array(context, &length, argv[1]);
    if (bytes == NULL) {
      JS_FreeCString(context, path);
      return JS_ThrowTypeError(context, "appendFile requires string or Uint8Array");
    }
  }
  int descriptor = open(path, O_WRONLY | O_CREAT | O_APPEND, 0666);
  int status = 0;
  if (descriptor < 0) status = errno;
  size_t offset = 0;
  while (status == 0 && offset < length) {
    ssize_t count = write(descriptor, bytes + offset, length - offset);
    if (count < 0 && errno == EINTR) continue;
    if (count <= 0) status = errno == 0 ? EIO : errno;
    else offset += (size_t)count;
  }
  if (descriptor >= 0 && close(descriptor) != 0 && status == 0) status = errno;
  if (text != NULL) JS_FreeCString(context, text);
  JS_FreeCString(context, path);
  if (status != 0) {
    return JS_ThrowInternalError(context, "appendFile failed: %s", strerror(status));
  }
  return JS_UNDEFINED;
}

static JSValue js_dolly_fs_stat(JSContext *context, JSValueConst this_value,
                                int argc, JSValueConst *argv) {
  (void)this_value;
  if (argc < 1) return JS_ThrowTypeError(context, "fsStat requires a path");
  const char *path = JS_ToCString(context, argv[0]);
  if (path == NULL) return JS_EXCEPTION;
  struct stat metadata;
  const int status = lstat(path, &metadata);
  const int saved_errno = errno;
  JS_FreeCString(context, path);
  if (status != 0) {
    return JS_ThrowInternalError(context, "fsStat failed: %s", strerror(saved_errno));
  }
  JSValue result = JS_NewObject(context);
  JS_SetPropertyStr(context, result, "size",
                    JS_NewInt64(context, (int64_t)metadata.st_size));
  JS_SetPropertyStr(context, result, "mode",
                    JS_NewUint32(context, (uint32_t)metadata.st_mode));
  JS_SetPropertyStr(context, result, "mtimeMs",
                    JS_NewInt64(context, (int64_t)metadata.st_mtime * 1000));
  JS_SetPropertyStr(context, result, "kind",
                    JS_NewString(context, S_ISDIR(metadata.st_mode) ? "directory" :
                                          S_ISREG(metadata.st_mode) ? "file" :
                                          S_ISLNK(metadata.st_mode) ? "symlink" : "other"));
  return result;
}

static JSValue js_dolly_fs_readdir(JSContext *context,
                                   JSValueConst this_value,
                                   int argc, JSValueConst *argv) {
  (void)this_value;
  if (argc < 1) return JS_ThrowTypeError(context, "fsReaddir requires a path");
  const char *path = JS_ToCString(context, argv[0]);
  if (path == NULL) return JS_EXCEPTION;
  DIR *directory = opendir(path);
  const int saved_errno = errno;
  JS_FreeCString(context, path);
  if (directory == NULL) {
    return JS_ThrowInternalError(context, "fsReaddir failed: %s",
                                 strerror(saved_errno));
  }
  JSValue result = JS_NewArray(context);
  uint32_t index = 0;
  struct dirent *entry;
  while ((entry = readdir(directory)) != NULL) {
    if (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0) continue;
    JS_SetPropertyUint32(context, result, index++,
                         JS_NewString(context, entry->d_name));
  }
  closedir(directory);
  return result;
}

static JSValue js_dolly_fs_operation(JSContext *context,
                                     JSValueConst this_value,
                                     int argc, JSValueConst *argv, int magic) {
  (void)this_value;
  if (argc < 1) return JS_ThrowTypeError(context, "filesystem operation requires a path");
  const char *first = JS_ToCString(context, argv[0]);
  if (first == NULL) return JS_EXCEPTION;
  const char *second = NULL;
  int status = 0;
  if (magic == 0) status = access(first, F_OK);
  else if (magic == 1) status = mkdir(first, 0755);
  else if (magic == 2) status = unlink(first);
  else if (magic == 3) status = rmdir(first);
  else if (magic == 4 || magic == 5) {
    if (argc < 2 || (second = JS_ToCString(context, argv[1])) == NULL) {
      JS_FreeCString(context, first);
      return JS_ThrowTypeError(context, "filesystem operation requires two paths");
    }
    if (magic == 4) status = rename(first, second);
    else {
      size_t length = 0;
      char *contents = read_file(first, &length);
      status = contents == NULL ? -1 : dolly_write_file(second, contents, length);
      free(contents);
      if (status < 0) errno = -status;
    }
  }
  const int saved_errno = errno;
  if (second != NULL) JS_FreeCString(context, second);
  JS_FreeCString(context, first);
  if (status != 0) {
    return JS_ThrowInternalError(context, "filesystem operation failed: %s",
                                 strerror(saved_errno));
  }
  return JS_UNDEFINED;
}

static JSValue js_dolly_realpath(JSContext *context, JSValueConst this_value,
                                 int argc, JSValueConst *argv) {
  (void)this_value;
  if (argc < 1) return JS_ThrowTypeError(context, "realpath requires a path");
  const char *path = JS_ToCString(context, argv[0]);
  if (path == NULL) return JS_EXCEPTION;
  char resolved[PATH_MAX];
  char *status = realpath(path, resolved);
  const int saved_errno = errno;
  JS_FreeCString(context, path);
  if (status == NULL) {
    return JS_ThrowInternalError(context, "realpath failed: %s", strerror(saved_errno));
  }
  return JS_NewString(context, resolved);
}

static JSValue js_dolly_read_raw(JSContext *context, JSValueConst this_value,
                                 int argc, JSValueConst *argv) {
  (void)this_value;
  int32_t timeout = 1000;
  if (argc >= 1 && JS_ToInt32(context, &timeout, argv[0]) < 0) return JS_EXCEPTION;
  if (timeout < 0) timeout = -1;
  unsigned char bytes[256];
  size_t length = 0;
  int byte = dolly_terminal_read_raw_timeout(timeout);
  if (byte >= 0) {
    bytes[length++] = (unsigned char)byte;
    while (length < sizeof(bytes) &&
           (byte = dolly_terminal_read_raw_timeout(0)) >= 0) {
      bytes[length++] = (unsigned char)byte;
    }
  }
  return JS_NewUint8ArrayCopy(context, bytes, length);
}

static JSValue js_dolly_isatty(JSContext *context, JSValueConst this_value,
                               int argc, JSValueConst *argv) {
  (void)this_value;
  int32_t descriptor = -1;
  if (argc < 1 || JS_ToInt32(context, &descriptor, argv[0]) < 0) {
    return JS_ThrowTypeError(context, "isatty requires a descriptor");
  }
  return JS_NewBool(context, dolly_isatty(descriptor));
}

static JSValue js_dolly_read_stdin(JSContext *context,
                                   JSValueConst this_value,
                                   int argc, JSValueConst *argv) {
  (void)this_value;
  int32_t capacity = 4096;
  if (argc >= 1 && JS_ToInt32(context, &capacity, argv[0]) < 0) {
    return JS_EXCEPTION;
  }
  if (capacity <= 0 || capacity > 65536) {
    return JS_ThrowRangeError(context, "stdin read size is out of range");
  }
  unsigned char *bytes = malloc((size_t)capacity);
  if (bytes == NULL) return JS_ThrowOutOfMemory(context);
  const ssize_t count = read(STDIN_FILENO, bytes, (size_t)capacity);
  if (count < 0) {
    const int saved_errno = errno;
    free(bytes);
    return JS_ThrowInternalError(context, "stdin read failed: %s",
                                 strerror(saved_errno));
  }
  JSValue result = JS_NewUint8ArrayCopy(context, bytes, (size_t)count);
  free(bytes);
  return result;
}

static JSValue js_dolly_terminal_size(JSContext *context,
                                      JSValueConst this_value,
                                      int argc, JSValueConst *argv) {
  (void)this_value;
  (void)argc;
  (void)argv;
  JSValue result = JS_NewObject(context);
  JS_SetPropertyStr(context, result, "columns",
                    JS_NewUint32(context, dolly_terminal_columns()));
  JS_SetPropertyStr(context, result, "rows",
                    JS_NewUint32(context, dolly_terminal_rows()));
  return result;
}

static JSValue js_dolly_exit(JSContext *context, JSValueConst this_value,
                             int argc, JSValueConst *argv) {
  (void)this_value;
  int32_t status = 0;
  if (argc >= 1 && JS_ToInt32(context, &status, argv[0]) < 0) return JS_EXCEPTION;
  janis_exit_requested = 1;
  janis_exit_status = status & 255;
  return JS_ThrowInternalError(context, "Janis process exited");
}

static int byte_buffer_append(byte_buffer *buffer, const void *bytes,
                              size_t length) {
  if (length > DOLLY_JS_MAX_HTTP_BYTES - buffer->length) return -1;
  unsigned char *grown = realloc(buffer->data, buffer->length + length + 1);
  if (grown == NULL) return -1;
  memcpy(grown + buffer->length, bytes, length);
  buffer->length += length;
  grown[buffer->length] = '\0';
  buffer->data = grown;
  return 0;
}

static size_t http_collect(const void *bytes, size_t length, void *opaque) {
  return byte_buffer_append(opaque, bytes, length) == 0 ? length : 0;
}

static JSValue js_dolly_http(JSContext *context, JSValueConst this_value,
                             int argc, JSValueConst *argv) {
  (void)this_value;
  if (argc < 2) {
    return JS_ThrowTypeError(context, "http requires method and URL");
  }
  const char *method = JS_ToCString(context, argv[0]);
  const char *url = JS_ToCString(context, argv[1]);
  const char *headers = argc >= 3 ? JS_ToCString(context, argv[2]) : NULL;
  size_t body_length = 0;
  const char *body = NULL;
  if (argc >= 4 && !JS_IsNull(argv[3]) && !JS_IsUndefined(argv[3])) {
    body = JS_ToCStringLen(context, &body_length, argv[3]);
  }
  if (method == NULL || url == NULL || (argc >= 3 && headers == NULL) ||
      (argc >= 4 && !JS_IsNull(argv[3]) && !JS_IsUndefined(argv[3]) &&
       body == NULL)) {
    if (method != NULL) JS_FreeCString(context, method);
    if (url != NULL) JS_FreeCString(context, url);
    if (headers != NULL) JS_FreeCString(context, headers);
    if (body != NULL) JS_FreeCString(context, body);
    return JS_EXCEPTION;
  }

  byte_buffer response_headers = {0};
  byte_buffer response_body = {0};
  dolly_http_request request = {
      .method = method,
      .url = url,
      .headers = headers == NULL ? "" : headers,
      .body = body,
      .body_size = body_length,
      .flags = DOLLY_HTTP_FOLLOW_REDIRECTS,
      .write = http_collect,
      .write_context = &response_body,
      .header = http_collect,
      .header_context = &response_headers,
  };
  dolly_http_response response = {0};
  const int status = dolly_http_perform(&request, &response);
  JS_FreeCString(context, method);
  JS_FreeCString(context, url);
  if (headers != NULL) JS_FreeCString(context, headers);
  if (body != NULL) JS_FreeCString(context, body);
  if (status != 0) {
    free(response_headers.data);
    free(response_body.data);
    return JS_ThrowInternalError(context, "HTTP request failed: %d", status);
  }

  JSValue result = JS_NewObject(context);
  JS_SetPropertyStr(context, result, "status",
                    JS_NewUint32(context, response.status));
  JS_SetPropertyStr(
      context, result, "url",
      JS_NewString(context,
                   response.effective_url == NULL ? "" : response.effective_url));
  JS_SetPropertyStr(context, result, "headers",
                    JS_NewStringLen(context,
                                    (const char *)response_headers.data,
                                    response_headers.length));
  JS_SetPropertyStr(context, result, "body",
                    JS_NewUint8ArrayCopy(context, response_body.data,
                                         response_body.length));
  dolly_http_response_dispose(&response);
  free(response_headers.data);
  free(response_body.data);
  return result;
}

static JSValue js_dolly_http_start(JSContext *context,
                                    JSValueConst this_value,
                                    int argc, JSValueConst *argv) {
  (void)this_value;
  if (argc < 2) {
    return JS_ThrowTypeError(context, "httpStart requires method and URL");
  }
  const char *method = JS_ToCString(context, argv[0]);
  const char *url = JS_ToCString(context, argv[1]);
  const char *headers = argc >= 3 ? JS_ToCString(context, argv[2]) : NULL;
  size_t body_length = 0;
  const char *body = NULL;
  if (argc >= 4 && !JS_IsNull(argv[3]) && !JS_IsUndefined(argv[3])) {
    body = JS_ToCStringLen(context, &body_length, argv[3]);
  }
  if (method == NULL || url == NULL || (argc >= 3 && headers == NULL) ||
      (argc >= 4 && !JS_IsNull(argv[3]) && !JS_IsUndefined(argv[3]) &&
       body == NULL)) {
    if (method != NULL) JS_FreeCString(context, method);
    if (url != NULL) JS_FreeCString(context, url);
    if (headers != NULL) JS_FreeCString(context, headers);
    if (body != NULL) JS_FreeCString(context, body);
    return JS_EXCEPTION;
  }

  unsigned int sequence = 0;
  const int status = dolly_http_start(
      method, url, headers == NULL ? "" : headers, body, body_length,
      DOLLY_HTTP_FOLLOW_REDIRECTS, &sequence);
  JS_FreeCString(context, method);
  JS_FreeCString(context, url);
  if (headers != NULL) JS_FreeCString(context, headers);
  if (body != NULL) JS_FreeCString(context, body);
  if (status != 0) {
    return JS_ThrowInternalError(context, "HTTP request start failed: %d",
                                 status);
  }
  return JS_NewUint32(context, sequence);
}

static JSValue js_dolly_http_poll(JSContext *context,
                                   JSValueConst this_value,
                                   int argc, JSValueConst *argv) {
  (void)this_value;
  uint32_t sequence = 0;
  if (argc < 1 || JS_ToUint32(context, &sequence, argv[0]) < 0) {
    return JS_ThrowTypeError(context, "httpPoll requires a sequence");
  }
  unsigned char *data = malloc(DOLLY_HTTP_CHUNK_CAPACITY);
  if (data == NULL) return JS_ThrowOutOfMemory(context);
  dolly_http_chunk chunk = {0};
  const int status = dolly_http_poll(
      sequence, &chunk, data, DOLLY_HTTP_CHUNK_CAPACITY);
  if (status == 0) {
    free(data);
    return JS_NULL;
  }
  if (status < 0) {
    free(data);
    return JS_ThrowInternalError(context, "HTTP request poll failed: %d",
                                 status);
  }

  JSValue result = JS_NewObject(context);
  JS_SetPropertyStr(context, result, "status",
                    JS_NewUint32(context, chunk.status));
  JS_SetPropertyStr(context, result, "kind",
                    JS_NewUint32(context, chunk.kind));
  JS_SetPropertyStr(context, result, "error",
                    JS_NewUint32(context, chunk.error));
  JS_SetPropertyStr(context, result, "eof", JS_NewBool(context, chunk.eof));
  JS_SetPropertyStr(context, result, "data",
                    JS_NewUint8ArrayCopy(context, data, chunk.length));
  free(data);
  return result;
}

static JSValue js_dolly_random(JSContext *context, JSValueConst this_value,
                               int argc, JSValueConst *argv) {
  (void)this_value;
  int64_t requested = 0;
  if (argc < 1 || JS_ToInt64(context, &requested, argv[0]) < 0) {
    return JS_ThrowTypeError(context, "random requires a byte count");
  }
  if (requested < 0 || requested > DOLLY_JS_MAX_RANDOM_BYTES) {
    return JS_ThrowRangeError(context, "random byte count is out of range");
  }
  unsigned char *bytes = malloc(requested == 0 ? 1 : (size_t)requested);
  if (bytes == NULL) return JS_ThrowOutOfMemory(context);
  if (dolly_getrandom(bytes, (size_t)requested, 0) != requested) {
    free(bytes);
    return JS_ThrowInternalError(context, "entropy request failed");
  }
  JSValue result = JS_NewUint8ArrayCopy(context, bytes, (size_t)requested);
  free(bytes);
  return result;
}

static JSValue js_dolly_decode(JSContext *context, JSValueConst this_value,
                               int argc, JSValueConst *argv) {
  (void)this_value;
  if (argc < 1) return JS_ThrowTypeError(context, "decode requires bytes");
  size_t length = 0;
  uint8_t *bytes = JS_GetUint8Array(context, &length, argv[0]);
  if (bytes == NULL) return JS_ThrowTypeError(context, "decode requires Uint8Array");
  return JS_NewStringLen(context, (const char *)bytes, length);
}

static JSValue js_dolly_encode(JSContext *context, JSValueConst this_value,
                               int argc, JSValueConst *argv) {
  (void)this_value;
  if (argc < 1) return JS_ThrowTypeError(context, "encode requires text");
  size_t length = 0;
  const char *text = JS_ToCStringLen(context, &length, argv[0]);
  if (text == NULL) return JS_EXCEPTION;
  JSValue result = JS_NewUint8ArrayCopy(context, (const uint8_t *)text, length);
  JS_FreeCString(context, text);
  return result;
}

static FILE *create_command_spool(char *path) {
  const int fd = mkstemp(path);
  if (fd < 0) return NULL;
  FILE *stream = fdopen(fd, "w+b");
  if (stream == NULL) {
    const int saved_errno = errno;
    close(fd);
    unlink(path);
    errno = saved_errno;
  }
  return stream;
}

static JSValue js_dolly_shell(JSContext *context, JSValueConst this_value,
                              int argc, JSValueConst *argv) {
  (void)this_value;
  if (argc < 1) return JS_ThrowTypeError(context, "shell requires a command");
  const char *command = JS_ToCString(context, argv[0]);
  if (command == NULL) return JS_EXCEPTION;
  char stdout_path[] = "/tmp/dolly-js-stdout-XXXXXX";
  char stderr_path[] = "/tmp/dolly-js-stderr-XXXXXX";
  char stdin_path[] = "/tmp/dolly-js-stdin-XXXXXX";
  FILE *stdin_file = NULL;
  FILE *stdout_file = create_command_spool(stdout_path);
  FILE *stderr_file = create_command_spool(stderr_path);
  const char *stdin_text = NULL;
  size_t stdin_length = 0;
  const int input_requested = argc >= 2 && !JS_IsUndefined(argv[1]);
  if (input_requested) {
    stdin_text = JS_ToCStringLen(context, &stdin_length, argv[1]);
    if (stdin_text != NULL) stdin_file = create_command_spool(stdin_path);
  }
  if (input_requested && stdin_text == NULL) {
    if (stdout_file != NULL) fclose(stdout_file);
    if (stderr_file != NULL) fclose(stderr_file);
    unlink(stdout_path);
    unlink(stderr_path);
    JS_FreeCString(context, command);
    return JS_EXCEPTION;
  }
  if (stdout_file == NULL || stderr_file == NULL ||
      (input_requested && stdin_file == NULL)) {
    if (stdin_file != NULL) fclose(stdin_file);
    if (stdout_file != NULL) fclose(stdout_file);
    if (stderr_file != NULL) fclose(stderr_file);
    unlink(stdin_path);
    unlink(stdout_path);
    unlink(stderr_path);
    if (stdin_text != NULL) JS_FreeCString(context, stdin_text);
    JS_FreeCString(context, command);
    return JS_ThrowInternalError(context, "could not create command spools");
  }
  if (stdin_file != NULL) {
    if (stdin_length != 0 &&
        fwrite(stdin_text, 1, stdin_length, stdin_file) != stdin_length) {
      fclose(stdin_file);
      fclose(stdout_file);
      fclose(stderr_file);
      unlink(stdin_path);
      unlink(stdout_path);
      unlink(stderr_path);
      JS_FreeCString(context, stdin_text);
      JS_FreeCString(context, command);
      return JS_ThrowInternalError(context, "could not write command input");
    }
    rewind(stdin_file);
    JS_FreeCString(context, stdin_text);
  }
  double timeout_milliseconds = -1;
  if (argc >= 3 && !JS_IsUndefined(argv[2])) {
    if (JS_ToFloat64(context, &timeout_milliseconds, argv[2]) < 0) {
      if (stdin_file != NULL) fclose(stdin_file);
      fclose(stdout_file);
      fclose(stderr_file);
      unlink(stdin_path);
      unlink(stdout_path);
      unlink(stderr_path);
      JS_FreeCString(context, command);
      return JS_EXCEPTION;
    }
    if (timeout_milliseconds < 0 || timeout_milliseconds > 86400000) {
      if (stdin_file != NULL) fclose(stdin_file);
      fclose(stdout_file);
      fclose(stderr_file);
      unlink(stdin_path);
      unlink(stdout_path);
      unlink(stderr_path);
      JS_FreeCString(context, command);
      return JS_ThrowRangeError(context, "shell timeout is out of range");
    }
  }
  char *child_argv[] = {"/bin/slop", "-c", (char *)command, NULL};
  const int input_descriptor = stdin_file == NULL ? 0 : fileno(stdin_file);
  int pid = timeout_milliseconds < 0
      ? dolly_spawn("/bin/slop", 3, child_argv, input_descriptor,
                    fileno(stdout_file), fileno(stderr_file))
      : dolly_spawn_timeout("/bin/slop", 3, child_argv, input_descriptor,
                            fileno(stdout_file), fileno(stderr_file),
                            timeout_milliseconds);
  int status = 1;
  if (pid < 0 || dolly_wait(pid, &status) != 0) {
    if (stdin_file != NULL) fclose(stdin_file);
    fclose(stdout_file);
    fclose(stderr_file);
    unlink(stdin_path);
    unlink(stdout_path);
    unlink(stderr_path);
    JS_FreeCString(context, command);
    return JS_ThrowInternalError(context, "could not execute Slop: %d", pid);
  }
  JS_FreeCString(context, command);
  if (stdin_file != NULL) fclose(stdin_file);
  unlink(stdin_path);
  rewind(stdout_file);
  rewind(stderr_file);
  size_t stdout_length = 0;
  size_t stderr_length = 0;
  char *stdout_text = read_stream(stdout_file, &stdout_length);
  char *stderr_text = read_stream(stderr_file, &stderr_length);
  fclose(stdout_file);
  fclose(stderr_file);
  unlink(stdout_path);
  unlink(stderr_path);
  if (stdout_text == NULL || stderr_text == NULL) {
    free(stdout_text);
    free(stderr_text);
    return JS_ThrowInternalError(context, "could not read command output");
  }
  JSValue result = JS_NewObject(context);
  JS_SetPropertyStr(context, result, "status", JS_NewInt32(context, status));
  JS_SetPropertyStr(context, result, "stdout",
                    JS_NewStringLen(context, stdout_text, stdout_length));
  JS_SetPropertyStr(context, result, "stderr",
                    JS_NewStringLen(context, stderr_text, stderr_length));
  free(stdout_text);
  free(stderr_text);
  return result;
}

static int install_dolly_backend(JSContext *context) {
  JSValue global = JS_GetGlobalObject(context);
  JSValue dolly = JS_NewObject(context);
  if (JS_IsException(dolly)) {
    JS_FreeValue(context, global);
    return -1;
  }
#define DOLLY_JS_FUNCTION(name, function, length)                              \
  do {                                                                         \
    if (JS_SetPropertyStr(context, dolly, name,                                 \
                          JS_NewCFunction(context, function, name, length)) < 0) { \
      JS_FreeValue(context, dolly);                                             \
      JS_FreeValue(context, global);                                            \
      return -1;                                                               \
    }                                                                          \
  } while (0)
  DOLLY_JS_FUNCTION("getenv", js_dolly_getenv, 1);
  DOLLY_JS_FUNCTION("setenv", js_dolly_setenv, 2);
  DOLLY_JS_FUNCTION("cwd", js_dolly_cwd, 0);
  DOLLY_JS_FUNCTION("chdir", js_dolly_chdir, 1);
  DOLLY_JS_FUNCTION("readFile", js_dolly_read_file, 1);
  DOLLY_JS_FUNCTION("writeFile", js_dolly_write_file, 2);
  DOLLY_JS_FUNCTION("readFileBytes", js_dolly_read_file_bytes, 1);
  DOLLY_JS_FUNCTION("writeFileBytes", js_dolly_write_file_bytes, 2);
  DOLLY_JS_FUNCTION("download", js_dolly_download, 1);
  DOLLY_JS_FUNCTION("appendFile", js_dolly_append_file, 2);
  DOLLY_JS_FUNCTION("fsStat", js_dolly_fs_stat, 1);
  DOLLY_JS_FUNCTION("fsReaddir", js_dolly_fs_readdir, 1);
  DOLLY_JS_FUNCTION("realpath", js_dolly_realpath, 1);
  DOLLY_JS_FUNCTION("readRaw", js_dolly_read_raw, 1);
  DOLLY_JS_FUNCTION("readStdin", js_dolly_read_stdin, 1);
  DOLLY_JS_FUNCTION("isatty", js_dolly_isatty, 1);
  DOLLY_JS_FUNCTION("terminalSize", js_dolly_terminal_size, 0);
  DOLLY_JS_FUNCTION("exit", js_dolly_exit, 1);
  DOLLY_JS_FUNCTION("http", js_dolly_http, 4);
  DOLLY_JS_FUNCTION("httpStart", js_dolly_http_start, 4);
  DOLLY_JS_FUNCTION("httpPoll", js_dolly_http_poll, 1);
  DOLLY_JS_FUNCTION("random", js_dolly_random, 1);
  DOLLY_JS_FUNCTION("encode", js_dolly_encode, 1);
  DOLLY_JS_FUNCTION("decode", js_dolly_decode, 1);
  DOLLY_JS_FUNCTION("shell", js_dolly_shell, 3);
#undef DOLLY_JS_FUNCTION
#define DOLLY_FS_FUNCTION(name, magic)                                         \
  JS_SetPropertyStr(context, dolly, name,                                      \
                    JS_NewCFunctionMagic(context, js_dolly_fs_operation, name, \
                                         magic == 4 || magic == 5 ? 2 : 1,     \
                                         JS_CFUNC_generic_magic, magic))
  DOLLY_FS_FUNCTION("fsAccess", 0);
  DOLLY_FS_FUNCTION("fsMkdir", 1);
  DOLLY_FS_FUNCTION("fsUnlink", 2);
  DOLLY_FS_FUNCTION("fsRmdir", 3);
  DOLLY_FS_FUNCTION("fsRename", 4);
  DOLLY_FS_FUNCTION("fsCopy", 5);
#undef DOLLY_FS_FUNCTION
  JS_SetPropertyStr(context, dolly, "stdout",
                    JS_NewCFunctionMagic(context, js_dolly_write, "stdout", 1,
                                         JS_CFUNC_generic_magic, 0));
  JS_SetPropertyStr(context, dolly, "stderr",
                    JS_NewCFunctionMagic(context, js_dolly_write, "stderr", 1,
                                         JS_CFUNC_generic_magic, 1));
  if (JS_SetPropertyStr(context, global, "Dolly", dolly) < 0) {
    JS_FreeValue(context, global);
    return -1;
  }
  JS_FreeValue(context, global);
  return 0;
}

static int install_globals(JSContext *context, int argc, char **argv) {
  JSValue global = JS_GetGlobalObject(context);
  JSValue print = JS_NewCFunction(context, js_print, "print", 1);
  if (JS_IsException(print)) {
    JS_FreeValue(context, global);
    return -1;
  }
  if (JS_SetPropertyStr(context, global, "print", print) < 0) {
    JS_FreeValue(context, global);
    return -1;
  }

  JSValue console = JS_NewObject(context);
  if (JS_IsException(console)) {
    JS_FreeValue(context, global);
    return -1;
  }
  JSValue log = JS_NewCFunction(context, js_print, "log", 1);
  if (JS_IsException(log)) {
    JS_FreeValue(context, console);
    JS_FreeValue(context, global);
    return -1;
  }
  if (JS_SetPropertyStr(context, console, "log", log) < 0) {
    JS_FreeValue(context, console);
    JS_FreeValue(context, global);
    return -1;
  }
  JSValue error = JS_NewCFunction(context, js_print_error, "error", 1);
  if (JS_IsException(error)) {
    JS_FreeValue(context, console);
    JS_FreeValue(context, global);
    return -1;
  }
  if (JS_SetPropertyStr(context, console, "error", error) < 0) {
    JS_FreeValue(context, console);
    JS_FreeValue(context, global);
    return -1;
  }
  if (JS_SetPropertyStr(context, global, "console", console) < 0) {
    JS_FreeValue(context, global);
    return -1;
  }

  JSValue script_args = JS_NewArray(context);
  if (JS_IsException(script_args)) {
    JS_FreeValue(context, global);
    return -1;
  }
  for (int index = 0; index < argc; index++) {
    JSValue argument = JS_NewString(context, argv[index]);
    if (JS_IsException(argument) ||
        JS_SetPropertyUint32(context, script_args, (uint32_t)index,
                             argument) < 0) {
      JS_FreeValue(context, script_args);
      JS_FreeValue(context, global);
      return -1;
    }
  }
  if (JS_SetPropertyStr(context, global, "scriptArgs", script_args) < 0) {
    JS_FreeValue(context, global);
    return -1;
  }
  JS_FreeValue(context, global);
  return 0;
}

static int load_dolly_prelude(JSContext *context) {
  static const char *const paths[] = {
      "/usr/lib/dolly/node.js",
      "/usr/lib/janis/runtime.js",
  };
  for (size_t index = 0; index < sizeof(paths) / sizeof(paths[0]); ++index) {
    size_t length = 0;
    char *source = read_file(paths[index], &length);
    if (source == NULL) {
      fprintf(stderr, "janis: %s: %s\n", paths[index], strerror(errno));
      return -1;
    }
    JSValue result = JS_Eval(context, source, length, paths[index],
                             JS_EVAL_TYPE_GLOBAL);
    free(source);
    if (JS_IsException(result)) {
      print_exception(context);
      return -1;
    }
    JS_FreeValue(context, result);
  }
  return 0;
}

static void discard_exception(JSContext *context) {
  JSValue exception = JS_GetException(context);
  JS_FreeValue(context, exception);
}

static int execute_pending_jobs(JSContext *context) {
  JSContext *job_context = NULL;
  int status;
  while ((status = JS_ExecutePendingJob(JS_GetRuntime(context),
                                        &job_context)) > 0) {
  }
  if (status < 0) {
    if (janis_exit_requested) {
      discard_exception(job_context == NULL ? context : job_context);
      return 1;
    }
    print_exception(job_context == NULL ? context : job_context);
    return -1;
  }
  return 0;
}

static int pump_janis(JSContext *context) {
  JSValue global = JS_GetGlobalObject(context);
  JSValue function = JS_GetPropertyStr(context, global, "__janisPump");
  JS_FreeValue(context, global);
  if (JS_IsException(function)) return -1;
  if (!JS_IsFunction(context, function)) {
    JS_FreeValue(context, function);
    return 0;
  }
  JSValue result = JS_Call(context, function, JS_UNDEFINED, 0, NULL);
  JS_FreeValue(context, function);
  if (JS_IsException(result)) {
    if (janis_exit_requested) {
      discard_exception(context);
      return 0;
    }
    print_exception(context);
    return -1;
  }
  const int active = JS_ToBool(context, result);
  JS_FreeValue(context, result);
  return active;
}

static int process_exit_code(JSContext *context) {
  JSValue global = JS_GetGlobalObject(context);
  JSValue process = JS_GetPropertyStr(context, global, "process");
  JS_FreeValue(context, global);
  if (JS_IsException(process)) return 1;
  JSValue exit_code = JS_GetPropertyStr(context, process, "exitCode");
  JS_FreeValue(context, process);
  if (JS_IsException(exit_code) || JS_IsUndefined(exit_code) ||
      JS_IsNull(exit_code)) {
    JS_FreeValue(context, exit_code);
    return 0;
  }
  int32_t status = 0;
  if (JS_ToInt32(context, &status, exit_code) < 0) status = 1;
  JS_FreeValue(context, exit_code);
  return status & 255;
}

static void print_exception(JSContext *context) {
  JSValue exception = JS_GetException(context);
  if (janis_interrupted) {
    JS_FreeValue(context, exception);
    return;
  }
  const char *message = JS_ToCString(context, exception);
  if (message != NULL) {
    fprintf(stderr, "%s\n", message);
    JS_FreeCString(context, message);
  } else {
    fputs("qjs: JavaScript exception\n", stderr);
  }

  if (JS_IsError(exception)) {
    JSValue stack = JS_GetPropertyStr(context, exception, "stack");
    if (!JS_IsUndefined(stack)) {
      const char *text = JS_ToCString(context, stack);
      if (text != NULL) {
        fprintf(stderr, "%s\n", text);
        JS_FreeCString(context, text);
      }
    }
    JS_FreeValue(context, stack);
  }
  JS_FreeValue(context, exception);
}

static int await_value(JSContext *context, JSValue *value) {
  for (;;) {
    const JSPromiseStateEnum state = JS_PromiseState(context, *value);
    if (state == JS_PROMISE_NOT_A_PROMISE) return 0;
    if (state == JS_PROMISE_FULFILLED) {
      JSValue result = JS_PromiseResult(context, *value);
      JS_FreeValue(context, *value);
      *value = result;
      return 0;
    }
    if (state == JS_PROMISE_REJECTED) {
      JSValue reason = JS_PromiseResult(context, *value);
      JS_FreeValue(context, *value);
      *value = JS_EXCEPTION;
      JS_Throw(context, reason);
      return -1;
    }

    JSContext *job_context = NULL;
    const int status = JS_ExecutePendingJob(JS_GetRuntime(context),
                                            &job_context);
    if (status < 0) {
      if (job_context != NULL && job_context != context) {
        print_exception(job_context);
        JS_ThrowInternalError(context, "asynchronous job failed");
      }
      JS_FreeValue(context, *value);
      *value = JS_EXCEPTION;
      return -1;
    }
    if (status == 0) {
      const int active = pump_janis(context);
      if (janis_exit_requested) {
        JS_FreeValue(context, *value);
        *value = JS_UNDEFINED;
        return 0;
      }
      if (active < 0) {
        JS_FreeValue(context, *value);
        *value = JS_EXCEPTION;
        JS_ThrowInternalError(context, "Janis event pump failed");
        return -1;
      }
      if (active > 0) continue;
      JS_FreeValue(context, *value);
      *value = JS_EXCEPTION;
      JS_ThrowInternalError(
          context, "top-level promise is pending without a runnable job");
      return -1;
    }
  }
}

static int evaluate(JSContext *context, const char *source, size_t length,
                    const char *name, int module_mode) {
  JSValue result;
  char *entry_name = NULL;
  if (module_mode) {
    entry_name = absolute_entry_name(context, name);
    if (entry_name == NULL) {
      print_exception(context);
      return 1;
    }
    result = JS_Eval(context, source, length, entry_name,
                     JS_EVAL_TYPE_MODULE | JS_EVAL_FLAG_COMPILE_ONLY);
    if (!JS_IsException(result)) {
      if (set_import_meta(context, result, 1) < 0) {
        JS_FreeValue(context, result);
        result = JS_EXCEPTION;
      } else {
        result = JS_EvalFunction(context, result);
      }
    }
    js_free(context, entry_name);
  } else {
    result = JS_Eval(context, source, length, name, JS_EVAL_TYPE_GLOBAL);
  }
  if (JS_IsException(result)) {
    if (janis_exit_requested) {
      discard_exception(context);
      return janis_exit_status;
    }
    print_exception(context);
    return 1;
  }
  if (await_value(context, &result) < 0) {
    if (janis_exit_requested) {
      discard_exception(context);
      return janis_exit_status;
    }
    print_exception(context);
    return 1;
  }
  JS_FreeValue(context, result);

  for (;;) {
    const int jobs = execute_pending_jobs(context);
    if (janis_exit_requested) return janis_exit_status;
    if (jobs < 0) return 1;
    const int active = pump_janis(context);
    if (janis_exit_requested) return janis_exit_status;
    if (active < 0) return 1;
    if (active == 0) break;
  }
  return process_exit_code(context);
}

int dolly_quickjs_run(int argc, char **argv, const char *default_module) {
  const char *source = NULL;
  const char *name = NULL;
  char *owned_source = NULL;
  size_t length = 0;
  int argument_index = 1;
  int module_mode = 0;
  janis_exit_requested = 0;
  janis_exit_status = 0;
  janis_interrupted = 0;

  if (default_module != NULL) {
    name = default_module;
    module_mode = 1;
  } else {
    if (argument_index < argc &&
        strcmp(argv[argument_index], "--help") == 0) {
      print_usage(stdout);
      return 0;
    }
    if (argument_index < argc &&
        strcmp(argv[argument_index], "--version") == 0) {
      printf("QuickJS-ng %s\n", JS_GetVersion());
      return 0;
    }
    if (argument_index < argc &&
        (strcmp(argv[argument_index], "-m") == 0 ||
         strcmp(argv[argument_index], "--module") == 0)) {
      module_mode = 1;
      argument_index++;
    }

    if (argument_index < argc && strcmp(argv[argument_index], "--") == 0) {
      argument_index++;
    } else if (argument_index < argc &&
               (strcmp(argv[argument_index], "-e") == 0 ||
                strcmp(argv[argument_index], "--eval") == 0)) {
      if (++argument_index >= argc) {
        fputs("qjs: -e requires JavaScript source\n", stderr);
        return DOLLY_JS_USAGE;
      }
      source = argv[argument_index++];
      length = strlen(source);
      name = "<eval>";
    } else if (argument_index < argc && argv[argument_index][0] == '-' &&
               strcmp(argv[argument_index], "-") != 0) {
      fprintf(stderr, "qjs: unsupported option: %s\n", argv[argument_index]);
      return DOLLY_JS_USAGE;
    }
  }

  if (source == NULL) {
    if (name == NULL) {
      if (argument_index >= argc) {
        fputs("qjs: interactive mode is not implemented; use -e, FILE, or -\n",
              stderr);
        return DOLLY_JS_USAGE;
      }
      name = argv[argument_index++];
    }
    owned_source = read_file(name, &length);
    if (owned_source == NULL) {
      fprintf(stderr, "qjs: %s: %s\n", name, strerror(errno));
      return 1;
    }
    source = owned_source;
  }

  JSRuntime *runtime = JS_NewRuntime();
  if (runtime == NULL) {
    fputs("qjs: could not create runtime\n", stderr);
    free(owned_source);
    return 1;
  }
  JS_SetInterruptHandler(runtime, quickjs_interrupt_handler, NULL);
  // Jiti uses Babel to translate ordinary JavaScript/TypeScript extensions.
  // Its recursive AST traversal legitimately exceeds QuickJS-ng's conservative
  // 1 MiB default, while remaining below Dolly's fixed 16 MiB Wasm stack.
  JS_SetMaxStackSize(runtime, DOLLY_JS_MAX_STACK_BYTES);
  JS_SetModuleLoaderFunc(runtime, module_normalize, module_loader, NULL);
  JSContext *context = JS_NewContext(runtime);
  if (context == NULL ||
      install_globals(context, argc - argument_index,
                      argv + argument_index) != 0 ||
      install_dolly_backend(context) != 0 ||
      load_dolly_prelude(context) != 0) {
    fputs("qjs: could not create context\n", stderr);
    if (context != NULL) JS_FreeContext(context);
    JS_FreeRuntime(runtime);
    free(owned_source);
    return 1;
  }

  if (!module_mode && name != NULL) {
    const size_t name_length = strlen(name);
    module_mode = name_length >= 4 && strcmp(name + name_length - 4, ".mjs") == 0;
  }
  int status = evaluate(context, source, length, name, module_mode);
  if (janis_interrupted) status = 128 + SIGINT;
  JS_FreeContext(context);
  JS_FreeRuntime(runtime);
  free(owned_source);
  return status;
}
