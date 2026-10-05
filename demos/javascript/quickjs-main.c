#include <errno.h>
#include <dirent.h>
#include <fcntl.h>
#include <limits.h>
#include <math.h>
#include <poll.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

#include <dolly/download.h>
#include <dolly/http.h>
#include <dolly/runtime.h>
#include <sys/random.h>

#include "quickjs.h"
#include "quickjs-runner.h"

enum {
  DOLLY_JS_USAGE = 64,
  DOLLY_JS_MAX_RANDOM_BYTES = 1024 * 1024,
  DOLLY_JS_MAX_STACK_BYTES = 8 * 1024 * 1024,
};

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

// Calls a function that the Janis runtime prelude defines on the global object.
static JSValue call_janis(JSContext *context, const char *hook, int argc,
                          JSValueConst *argv) {
  JSValue global = JS_GetGlobalObject(context);
  JSValue function = JS_GetPropertyStr(context, global, hook);
  JS_FreeValue(context, global);
  if (!JS_IsFunction(context, function)) {
    JS_FreeValue(context, function);
    return JS_ThrowReferenceError(context, "Janis runtime hook %s is missing", hook);
  }
  JSValue result = JS_Call(context, function, JS_UNDEFINED, argc, argv);
  JS_FreeValue(context, function);
  return result;
}

// Bare specifiers resolve to a WasmFS path or to a synthetic node: module.
static char *resolve_bare_module(JSContext *context, const char *base_name,
                                 const char *module_name) {
  JSValue arguments[] = {
      JS_NewString(context, module_name),
      JS_NewString(context, base_name),
  };
  JSValue result = call_janis(context, "__janisResolveModule", 2, arguments);
  JS_FreeValue(context, arguments[0]);
  JS_FreeValue(context, arguments[1]);
  if (JS_IsException(result)) return NULL;

  const char *resolved = JS_ToCString(context, result);
  JS_FreeValue(context, result);
  if (resolved == NULL) return NULL;
  char *normalized = NULL;
  if (strncmp(resolved, "node:", 5) == 0) normalized = js_string_copy(context, resolved);
  else if (resolved[0] == '/') normalized = normalize_absolute_path(context, resolved);
  else JS_ThrowReferenceError(context, "module resolver returned '%s'", resolved);
  JS_FreeCString(context, resolved);
  return normalized;
}

static char *module_normalize(JSContext *context, const char *base_name,
                              const char *module_name, void *opaque) {
  (void)opaque;
  if (module_name[0] == '/') return normalize_absolute_path(context, module_name);
  if (module_name[0] != '.' ||
      (module_name[1] != '/' &&
       !(module_name[1] == '.' && module_name[2] == '/'))) {
    return resolve_bare_module(context, base_name, module_name);
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

static JSValue js_import_meta_resolve(JSContext *context,
                                      JSValueConst this_value, int argc,
                                      JSValueConst *argv, int magic,
                                      JSValueConst *function_data) {
  (void)this_value;
  (void)magic;
  if (argc < 1) {
    return JS_ThrowTypeError(context,
                             "import.meta.resolve requires a specifier");
  }
  JSValue global = JS_GetGlobalObject(context);
  JSValue resolver =
      JS_GetPropertyStr(context, global, "__janisImportMetaResolve");
  JS_FreeValue(context, global);
  if (!JS_IsFunction(context, resolver)) {
    JS_FreeValue(context, resolver);
    return JS_ThrowTypeError(context,
                             "import.meta.resolve is unavailable in qjs");
  }
  JSValue arguments[] = {
      JS_DupValue(context, argv[0]),
      JS_DupValue(context, function_data[0]),
  };
  JSValue result = JS_Call(context, resolver, JS_UNDEFINED, 2, arguments);
  JS_FreeValue(context, arguments[0]);
  JS_FreeValue(context, arguments[1]);
  JS_FreeValue(context, resolver);
  return result;
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
  JSValue base_name = JS_NewString(context, name);
  JS_FreeCString(context, name);
  if (JS_IsException(base_name)) {
    free(url);
    return -1;
  }

  JSValue meta = JS_GetImportMeta(context, definition);
  if (JS_IsException(meta)) {
    JS_FreeValue(context, base_name);
    free(url);
    return -1;
  }
  JSValue resolve = JS_NewCFunctionData2(
      context, js_import_meta_resolve, "resolve", 1, 0, 1, &base_name);
  JS_FreeValue(context, base_name);
  const int url_status = JS_DefinePropertyValueStr(
      context, meta, "url", JS_NewString(context, url), JS_PROP_C_W_E);
  const int main_status = JS_DefinePropertyValueStr(
      context, meta, "main", JS_NewBool(context, is_main), JS_PROP_C_W_E);
  const int resolve_status = JS_DefinePropertyValueStr(
      context, meta, "resolve", resolve, JS_PROP_C_W_E);
  JS_FreeValue(context, meta);
  free(url);
  return url_status < 0 || main_status < 0 || resolve_status < 0 ? -1 : 0;
}

static JSModuleDef *compile_module(JSContext *context, const char *module_name,
                                   const char *source, size_t length) {
  JSValue module = JS_Eval(context, source, length, module_name,
                           JS_EVAL_TYPE_MODULE | JS_EVAL_FLAG_COMPILE_ONLY);
  if (JS_IsException(module)) return NULL;
  if (module_name[0] == '/' && set_import_meta(context, module, 0) < 0) {
    JS_FreeValue(context, module);
    return NULL;
  }
  JSModuleDef *definition = JS_VALUE_GET_PTR(module);
  JS_FreeValue(context, module);
  return definition;
}

// Built-in modules and ESM views of CommonJS files are generated in memory by
// the runtime; every other module is a WasmFS file.
static JSModuleDef *module_loader(JSContext *context, const char *module_name,
                                  void *opaque) {
  (void)opaque;
  JSValue name = JS_NewString(context, module_name);
  JSValue generated = call_janis(context, "__janisModuleSource", 1, &name);
  JS_FreeValue(context, name);
  if (JS_IsException(generated)) return NULL;
  if (JS_IsString(generated)) {
    size_t length = 0;
    const char *source = JS_ToCStringLen(context, &length, generated);
    JS_FreeValue(context, generated);
    if (source == NULL) return NULL;
    JSModuleDef *definition = compile_module(context, module_name, source, length);
    JS_FreeCString(context, source);
    return definition;
  }
  JS_FreeValue(context, generated);

  size_t length = 0;
  char *source = read_file(module_name, &length);
  if (source == NULL) {
    JS_ThrowReferenceError(context, "could not load module '%s': %s",
                           module_name, strerror(errno));
    return NULL;
  }

  // QuickJS's module callback receives the resolved WasmFS path after import
  // attributes have been parsed, but it does not compile JSON modules itself.
  // JSON is already a valid JavaScript expression, so expose its value through
  // a tiny synthetic ESM wrapper. This stays entirely inside Dolly's memory and
  // adds no host or browser capability.
  const size_t module_name_length = strlen(module_name);
  if (module_name_length >= sizeof(".json") - 1 &&
      strcmp(module_name + module_name_length - (sizeof(".json") - 1),
             ".json") == 0) {
    static const char prefix[] = "export default (";
    static const char suffix[] = ");\n";
    if (length > SIZE_MAX - (sizeof(prefix) - 1) - sizeof(suffix)) {
      free(source);
      JS_ThrowOutOfMemory(context);
      return NULL;
    }
    const size_t wrapped_length =
        (sizeof(prefix) - 1) + length + (sizeof(suffix) - 1);
    char *wrapped = malloc(wrapped_length + 1);
    if (wrapped == NULL) {
      free(source);
      JS_ThrowOutOfMemory(context);
      return NULL;
    }
    memcpy(wrapped, prefix, sizeof(prefix) - 1);
    memcpy(wrapped + sizeof(prefix) - 1, source, length);
    memcpy(wrapped + sizeof(prefix) - 1 + length, suffix, sizeof(suffix));
    free(source);
    source = wrapped;
    length = wrapped_length;
  }
  JSModuleDef *definition = compile_module(context, module_name, source, length);
  free(source);
  return definition;
}

// Relative names, including [eval] and [stdin], belong to the cwd.
static char *absolute_entry_name(JSContext *context, const char *name) {
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
  const int binary = JS_GetTypedArrayType(argv[0]) == JS_TYPED_ARRAY_UINT8;
  const char *text = binary
      ? (const char *)JS_GetUint8Array(context, &length, argv[0])
      : JS_ToCStringLen(context, &length, argv[0]);
  if (text == NULL) return JS_EXCEPTION;
  const size_t written = fwrite(text, 1, length, stream);
  if (!binary) JS_FreeCString(context, text);
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

static JSValue js_dolly_env_keys(JSContext *context, JSValueConst this_value,
                                 int argc, JSValueConst *argv) {
  (void)this_value; (void)argc; (void)argv;
  extern char **environ;
  JSValue result = JS_NewArray(context);
  if (JS_IsException(result)) return result;
  uint32_t index = 0;
  for (char **entry = environ; entry != NULL && *entry != NULL; ++entry) {
    const char *separator = strchr(*entry, '=');
    if (separator == NULL) continue;
    if (JS_SetPropertyUint32(context, result, index++,
          JS_NewStringLen(context, *entry, (size_t)(separator - *entry))) < 0) {
      JS_FreeValue(context, result);
      return JS_EXCEPTION;
    }
  }
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

static const char *errno_code(int number, const char **description) {
  switch (number) {
// libuv's descriptions, which Node's error messages use.
#define FS_ERRNO(name, text) case name: *description = text; return #name
    FS_ERRNO(EBADF, "bad file descriptor"); FS_ERRNO(ENOENT, "no such file or directory");
    FS_ERRNO(EEXIST, "file already exists"); FS_ERRNO(EINVAL, "invalid argument");
    FS_ERRNO(ENOTDIR, "not a directory"); FS_ERRNO(EISDIR, "illegal operation on a directory");
    FS_ERRNO(ENOTEMPTY, "directory not empty"); FS_ERRNO(EIO, "i/o error");
    FS_ERRNO(ENOMEM, "not enough memory"); FS_ERRNO(ENOSPC, "no space left on device");
    FS_ERRNO(EOVERFLOW, "value too large for defined data type"); FS_ERRNO(ESPIPE, "invalid seek");
    FS_ERRNO(ENOSYS, "function not implemented"); FS_ERRNO(ENOTSUP, "operation not supported on socket");
    FS_ERRNO(ELOOP, "too many symbolic links encountered"); FS_ERRNO(EMFILE, "too many open files");
    FS_ERRNO(EINTR, "interrupted system call"); FS_ERRNO(EAGAIN, "resource temporarily unavailable");
    FS_ERRNO(ENAMETOOLONG, "name too long"); FS_ERRNO(EPIPE, "broken pipe");
    FS_ERRNO(ESRCH, "no such process"); FS_ERRNO(ECHILD, "no child processes");
    FS_ERRNO(ESTALE, "stale file handle"); FS_ERRNO(EBUSY, "resource busy or locked");
    FS_ERRNO(EACCES, "permission denied"); FS_ERRNO(EDQUOT, "disk quota exceeded");
    FS_ERRNO(E2BIG, "argument list too long"); FS_ERRNO(ETIMEDOUT, "connection timed out");
    FS_ERRNO(ECANCELED, "operation canceled"); FS_ERRNO(EPROTONOSUPPORT, "protocol not supported");
    FS_ERRNO(EFAULT, "bad address in system call argument");
#undef FS_ERRNO
  }
  *description = strerror(number);
  return "UNKNOWN";
}

// Built through the Error constructor so the stack's first line is the message.
static JSValue throw_errno(JSContext *context, const char *operation, int number,
                           const char *message, const char *path, const char *destination) {
  const char *description;
  const char *code = errno_code(number, &description);
  char text[2 * PATH_MAX + 256];
  if (message == NULL) {
    int used = snprintf(text, sizeof(text), "%s: %s, %s", code, description, operation);
    if (path != NULL) used += snprintf(text + used, sizeof(text) - (size_t)used, " '%s'", path);
    if (destination != NULL) snprintf(text + used, sizeof(text) - (size_t)used, " -> '%s'", destination);
    message = text;
  }
  JSValue global = JS_GetGlobalObject(context);
  JSValue constructor = JS_GetPropertyStr(context, global, "Error");
  JS_FreeValue(context, global);
  JSValue argument = JS_NewString(context, message);
  JSValue error = JS_CallConstructor(context, constructor, 1, &argument);
  JS_FreeValue(context, argument);
  JS_FreeValue(context, constructor);
  if (JS_IsException(error)) return error;
  JS_SetPropertyStr(context, error, "code", JS_NewString(context, code));
  JS_SetPropertyStr(context, error, "errno", JS_NewInt32(context, -number));
  JS_SetPropertyStr(context, error, "syscall", JS_NewString(context, operation));
  if (path != NULL) JS_SetPropertyStr(context, error, "path", JS_NewString(context, path));
  if (destination != NULL) JS_SetPropertyStr(context, error, "dest", JS_NewString(context, destination));
  return JS_Throw(context, error);
}

static JSValue fs_error(JSContext *context, const char *operation, int number) {
  return throw_errno(context, operation, number, NULL, NULL, NULL);
}

static JSValue fs_path_error(JSContext *context, const char *operation, int number,
                             const char *path, const char *destination) {
  return throw_errno(context, operation, number, NULL, path, destination);
}

static JSValue http_error(JSContext *context, const char *operation,
                          int number, uint32_t sequence) {
  throw_errno(context, operation, number, dolly_http_error_message(number), NULL, NULL);
  JSValue error = JS_GetException(context);
  JS_SetPropertyStr(context, error, "requestId", JS_NewUint32(context, sequence));
  return JS_Throw(context, error);
}

static int fs_descriptor(JSContext *context, JSValueConst value, int *descriptor) {
  int64_t number;
  if (JS_ToInt64(context, &number, value) < 0) return -1;
  if (number < 0 || number > INT_MAX) {
    fs_error(context, "descriptor", EBADF);
    return -1;
  }
  *descriptor = (int)number;
  return 0;
}

static JSValue js_dolly_fs_open(JSContext *context, JSValueConst this_value,
                                 int argc, JSValueConst *argv) {
  (void)this_value;
  int32_t flags;
  if (argc < 2) return JS_ThrowTypeError(context, "fsOpen requires path and flags");
  if (JS_ToInt32(context, &flags, argv[1]) < 0) return JS_EXCEPTION;
  const char *path = JS_ToCString(context, argv[0]);
  if (path == NULL) return JS_EXCEPTION;
  const int descriptor = open(path, flags, 0666);
  JSValue result = descriptor < 0 ? fs_path_error(context, "open", errno, path, NULL)
                                  : JS_NewInt32(context, descriptor);
  JS_FreeCString(context, path);
  return result;
}

static JSValue js_dolly_fs_close(JSContext *context, JSValueConst this_value,
                                  int argc, JSValueConst *argv) {
  (void)this_value;
  int descriptor;
  if (argc < 1) return JS_ThrowTypeError(context, "fsClose requires a descriptor");
  if (fs_descriptor(context, argv[0], &descriptor) < 0) return JS_EXCEPTION;
  if (close(descriptor) != 0) return fs_error(context, "close", errno);
  return JS_UNDEFINED;
}

static JSValue js_dolly_fs_io(JSContext *context, JSValueConst this_value,
                               int argc, JSValueConst *argv, int writing) {
  (void)this_value;
  int descriptor;
  uint64_t offset, length, position = 0;
  if (argc < 4) return JS_ThrowTypeError(context, "file I/O requires descriptor, buffer, offset and length");
  if (fs_descriptor(context, argv[0], &descriptor) < 0 ||
      JS_ToIndex(context, &offset, argv[2]) < 0 ||
      JS_ToIndex(context, &length, argv[3]) < 0) return JS_EXCEPTION;
  size_t capacity;
  unsigned char *bytes = JS_GetUint8Array(context, &capacity, argv[1]);
  if (bytes == NULL) return JS_EXCEPTION;
  if (offset > capacity || length > capacity - offset) {
    return JS_ThrowRangeError(context, "file I/O exceeds buffer bounds");
  }
  const int positioned = argc > 4 && !JS_IsNull(argv[4]) && !JS_IsUndefined(argv[4]);
  if (positioned && JS_ToIndex(context, &position, argv[4]) < 0) return JS_EXCEPTION;
  if (position > INT64_MAX) return JS_ThrowRangeError(context, "file position is out of range");
  const ssize_t count = writing
      ? (positioned ? pwrite(descriptor, bytes + offset, (size_t)length, (off_t)position)
                    : write(descriptor, bytes + offset, (size_t)length))
      : (positioned ? pread(descriptor, bytes + offset, (size_t)length, (off_t)position)
                    : read(descriptor, bytes + offset, (size_t)length));
  return count < 0 ? fs_error(context, writing ? "write" : "read", errno)
                    : JS_NewInt64(context, count);
}

static JSValue js_dolly_fs_stat(JSContext *context, JSValueConst this_value,
                                int argc, JSValueConst *argv, int kind) {
  (void)this_value;
  if (argc < 1) return JS_ThrowTypeError(context, "stat requires a path or descriptor");
  struct stat metadata;
  if (kind == 2) {
    int descriptor;
    if (fs_descriptor(context, argv[0], &descriptor) < 0) return JS_EXCEPTION;
    if (fstat(descriptor, &metadata) != 0) return fs_error(context, "fstat", errno);
  } else {
    const char *path = JS_ToCString(context, argv[0]);
    if (path == NULL) return JS_EXCEPTION;
    const int status = kind == 1 ? lstat(path, &metadata) : stat(path, &metadata);
    if (status != 0) fs_path_error(context, kind == 1 ? "lstat" : "stat", errno, path, NULL);
    JS_FreeCString(context, path);
    if (status != 0) return JS_EXCEPTION;
  }
  JSValue result = JS_NewObject(context);
  JS_SetPropertyStr(context, result, "size",
                    JS_NewInt64(context, (int64_t)metadata.st_size));
  JS_SetPropertyStr(context, result, "mode",
                    JS_NewUint32(context, (uint32_t)metadata.st_mode));
  JS_SetPropertyStr(context, result, "mtimeMs",
                    JS_NewFloat64(context, (double)metadata.st_mtim.tv_sec * 1000 +
                                           (double)metadata.st_mtim.tv_nsec / 1000000));
  JS_SetPropertyStr(context, result, "kind",
                    JS_NewString(context, S_ISDIR(metadata.st_mode) ? "directory" :
                                          S_ISREG(metadata.st_mode) ? "file" :
                                          S_ISLNK(metadata.st_mode) ? "symlink" : "other"));
  return result;
}

static JSValue js_dolly_fs_utimes(JSContext *context, JSValueConst this_value,
                                   int argc, JSValueConst *argv) {
  (void)this_value;
  if (argc < 3) return JS_ThrowTypeError(context, "fsUtimes requires path, atime and mtime");
  struct timespec times[2];
  for (int index = 0; index < 2; ++index) {
    double seconds;
    if (JS_ToFloat64(context, &seconds, argv[index + 1]) < 0) return JS_EXCEPTION;
    if (!isfinite(seconds) || seconds < 0 || seconds > 9007199254740991.0) {
      return JS_ThrowRangeError(context, "invalid file timestamp");
    }
    times[index].tv_sec = (time_t)seconds;
    times[index].tv_nsec = (long)((seconds - (double)times[index].tv_sec) * 1000000000);
  }
  const char *path = JS_ToCString(context, argv[0]);
  if (path == NULL) return JS_EXCEPTION;
  const int status = utimensat(AT_FDCWD, path, times, 0);
  JSValue result = status < 0 ? fs_path_error(context, "utime", errno, path, NULL) : JS_UNDEFINED;
  JS_FreeCString(context, path);
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
  if (directory == NULL) fs_path_error(context, "scandir", errno, path, NULL);
  JS_FreeCString(context, path);
  if (directory == NULL) return JS_EXCEPTION;
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
  static const char *const syscalls[] = {"access", "mkdir", "unlink", "rmdir", "rename", "chmod", "symlink", "link"};
  if (argc < 1) return JS_ThrowTypeError(context, "filesystem operation requires a path");
  int32_t mode = F_OK;
  if ((magic == 0 || magic == 5) && argc > 1 && JS_ToInt32(context, &mode, argv[1]) < 0) return JS_EXCEPTION;
  const char *first = JS_ToCString(context, argv[0]);
  if (first == NULL) return JS_EXCEPTION;
  const char *second = NULL;
  int status = 0;
  if (magic == 0) status = access(first, mode);
  else if (magic == 1) status = mkdir(first, 0755);
  else if (magic == 2) status = unlink(first);
  else if (magic == 3) status = rmdir(first);
  else if (magic == 5) status = chmod(first, (mode_t)mode);
  else {
    if (argc < 2 || (second = JS_ToCString(context, argv[1])) == NULL) {
      JS_FreeCString(context, first);
      return JS_ThrowTypeError(context, "filesystem operation requires two paths");
    }
    status = magic == 4 ? rename(first, second) : magic == 6 ? symlink(first, second) : link(first, second);
  }
  JSValue result = status != 0
      ? fs_path_error(context, syscalls[magic], errno, first, second) : JS_UNDEFINED;
  if (second != NULL) JS_FreeCString(context, second);
  JS_FreeCString(context, first);
  return result;
}

static JSValue js_dolly_fs_readlink(JSContext *context, JSValueConst this_value,
                                    int argc, JSValueConst *argv) {
  (void)this_value;
  if (argc < 1) return JS_ThrowTypeError(context, "fsReadlink requires a path");
  const char *path = JS_ToCString(context, argv[0]);
  if (path == NULL) return JS_EXCEPTION;
  char target[PATH_MAX];
  const ssize_t length = readlink(path, target, sizeof(target));
  JSValue result = length < 0 ? fs_path_error(context, "readlink", errno, path, NULL)
                              : JS_NewStringLen(context, target, (size_t)length);
  JS_FreeCString(context, path);
  return result;
}

// Truncates a path (magic 0) or a descriptor (magic 1); fsync takes a descriptor.
static JSValue js_dolly_fs_resize(JSContext *context, JSValueConst this_value,
                                  int argc, JSValueConst *argv, int magic) {
  (void)this_value;
  int64_t length = 0;
  if (argc < 1 || (magic != 2 && (argc < 2 || JS_ToInt64(context, &length, argv[1]) < 0)))
    return JS_ThrowTypeError(context, "file resize requires a file and a length");
  if (magic != 0) {
    int descriptor;
    if (fs_descriptor(context, argv[0], &descriptor) < 0) return JS_EXCEPTION;
    if ((magic == 1 ? ftruncate(descriptor, (off_t)length) : fsync(descriptor)) != 0)
      return fs_error(context, magic == 1 ? "ftruncate" : "fsync", errno);
    return JS_UNDEFINED;
  }
  const char *path = JS_ToCString(context, argv[0]);
  if (path == NULL) return JS_EXCEPTION;
  JSValue result = truncate(path, (off_t)length) != 0
      ? fs_path_error(context, "open", errno, path, NULL) : JS_UNDEFINED;
  JS_FreeCString(context, path);
  return result;
}

static JSValue js_dolly_realpath(JSContext *context, JSValueConst this_value,
                                 int argc, JSValueConst *argv) {
  (void)this_value;
  if (argc < 1) return JS_ThrowTypeError(context, "realpath requires a path");
  const char *path = JS_ToCString(context, argv[0]);
  if (path == NULL) return JS_EXCEPTION;
  char resolved[PATH_MAX];
  char *status = realpath(path, resolved);
  JSValue result = status == NULL ? fs_path_error(context, "realpath", errno, path, NULL)
                                  : JS_NewString(context, resolved);
  JS_FreeCString(context, path);
  return result;
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

// Node's raw mode clears line editing, echo and ISIG, so Ctrl+C arrives as
// input; leaving raw mode restores the mode it replaced.
static int janis_cooked_mode = -1;

static JSValue js_dolly_set_raw_mode(JSContext *context, JSValueConst this_value,
                                     int argc, JSValueConst *argv) {
  (void)this_value;
  const int raw = argc >= 1 && JS_ToBool(context, argv[0]) == 1;
  if (raw == (janis_cooked_mode >= 0)) return JS_UNDEFINED;
  const uint32_t line = DOLLY_TERMINAL_CANONICAL | DOLLY_TERMINAL_ECHO | DOLLY_TERMINAL_ISIG;
  const int mode = raw ? dolly_terminal_mode_get(STDIN_FILENO) : janis_cooked_mode;
  const int result = mode < 0 ? mode : dolly_terminal_mode_set(
      STDIN_FILENO, raw ? (uint32_t)mode & ~line : (uint32_t)mode);
  if (result < 0) {
    return JS_ThrowInternalError(context, "setRawMode failed: %s", strerror(-result));
  }
  janis_cooked_mode = raw ? mode : -1;
  return JS_UNDEFINED;
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
  // As in Node, exit never returns, so no JavaScript catch can intercept it.
  // The kernel retires this process's children when it exits.
  exit(status & 255);
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
  const unsigned char *body = NULL;
  if (argc >= 4 && !JS_IsNull(argv[3]) && !JS_IsUndefined(argv[3])) {
    body = JS_GetUint8Array(context, &body_length, argv[3]);
  }
  if (method == NULL || url == NULL || (argc >= 3 && headers == NULL) ||
      (argc >= 4 && !JS_IsNull(argv[3]) && !JS_IsUndefined(argv[3]) &&
       body == NULL)) {
    if (method != NULL) JS_FreeCString(context, method);
    if (url != NULL) JS_FreeCString(context, url);
    if (headers != NULL) JS_FreeCString(context, headers);
    return JS_EXCEPTION;
  }

  // Fetch's default redirect mode is "follow"; false asks the broker to fail them.
  const int follow = argc < 5 || JS_ToBool(context, argv[4]);
  unsigned int sequence = 0;
  const int status = dolly_http_start(
      method, url, headers == NULL ? "" : headers, body, body_length,
      follow ? DOLLY_HTTP_FOLLOW_REDIRECTS : 0, &sequence);
  JS_FreeCString(context, method);
  JS_FreeCString(context, url);
  if (headers != NULL) JS_FreeCString(context, headers);
  if (status != 0) return http_error(context, "httpStart", -status, sequence);
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
    return http_error(context, "httpPoll", -status, sequence);
  }
  if (chunk.error != 0) {
    free(data);
    return http_error(context, "httpPoll", (int)chunk.error, sequence);
  }

  JSValue result = JS_NewObject(context);
  JS_SetPropertyStr(context, result, "status",
                    JS_NewUint32(context, chunk.status));
  JS_SetPropertyStr(context, result, "kind",
                    JS_NewUint32(context, chunk.kind));
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
  if (getrandom(bytes, (size_t)requested, 0) != requested) {
    free(bytes);
    return JS_ThrowInternalError(context, "entropy request failed");
  }
  JSValue result = JS_NewUint8ArrayCopy(context, bytes, (size_t)requested);
  free(bytes);
  return result;
}

static JSValue js_dolly_http_cancel(JSContext *context, JSValueConst this_value,
                                    int argc, JSValueConst *argv) {
  (void)this_value;
  uint32_t sequence;
  if (argc < 1 || JS_ToUint32(context, &sequence, argv[0]) < 0) return JS_EXCEPTION;
  const int result = dolly_http_cancel(sequence);
  return result < 0 ? fs_error(context, "httpCancel", -result) : JS_UNDEFINED;
}

static int array_integer(JSContext *context, JSValueConst array, uint32_t index, int32_t *value) {
  JSValue item = JS_GetPropertyUint32(context, array, index);
  const int result = JS_ToInt32(context, value, item);
  JS_FreeValue(context, item);
  return result;
}

static int array_length(JSContext *context, JSValueConst array, uint32_t maximum, uint32_t *length) {
  if (!JS_IsArray(array)) { JS_ThrowTypeError(context, "expected an array"); return -1; }
  JSValue value = JS_GetPropertyStr(context, array, "length");
  const int result = JS_ToUint32(context, length, value);
  JS_FreeValue(context, value);
  if (result < 0) return -1;
  if (*length > maximum) { JS_ThrowRangeError(context, "array is too large"); return -1; }
  return 0;
}

static void free_strings(JSContext *context, char **strings) {
  if (strings == NULL) return;
  for (size_t index = 0; strings[index] != NULL; ++index) JS_FreeCString(context, strings[index]);
  free(strings);
}

static char **array_strings(JSContext *context, JSValueConst array, uint32_t *length) {
  if (array_length(context, array, 65536, length) < 0) return NULL;
  char **strings = calloc((size_t)*length + 1, sizeof(*strings));
  if (strings == NULL) { JS_ThrowOutOfMemory(context); return NULL; }
  for (uint32_t index = 0; index < *length; ++index) {
    JSValue item = JS_GetPropertyUint32(context, array, index);
    size_t size;
    strings[index] = (char *)JS_ToCStringLen(context, &size, item);
    JS_FreeValue(context, item);
    if (strings[index] == NULL) { free_strings(context, strings); return NULL; }
    if (memchr(strings[index], 0, size) != NULL) {
      JS_ThrowTypeError(context, "embedded NUL in process argument");
      free_strings(context, strings);
      return NULL;
    }
  }
  return strings;
}

static JSValue js_dolly_process_spawn(JSContext *context, JSValueConst this_value,
                                      int argc, JSValueConst *argv) {
  (void)this_value;
  if (argc < 6) return JS_ThrowTypeError(context, "processSpawn requires path, argv, env, cwd, stdio and timeout");
  const char *path = NULL, *cwd = NULL;
  char **arguments = NULL, **environment = NULL;
  uint32_t count, environment_count;
  int32_t descriptors[3];
  double timeout;
  JSValue result = JS_EXCEPTION;
  if ((path = JS_ToCString(context, argv[0])) == NULL ||
      (cwd = JS_ToCString(context, argv[3])) == NULL ||
      (arguments = array_strings(context, argv[1], &count)) == NULL ||
      (environment = array_strings(context, argv[2], &environment_count)) == NULL ||
      JS_ToFloat64(context, &timeout, argv[5]) < 0) goto done;
  for (uint32_t index = 0; index < 3; ++index) {
    if (array_integer(context, argv[4], index, &descriptors[index]) < 0) goto done;
  }
  const int pid = dolly_spawn_env_cwd(path, (int)count, arguments, environment, cwd,
      descriptors[0], descriptors[1], descriptors[2], timeout);
  result = pid < 0 ? fs_error(context, "spawn", -pid) : JS_NewInt32(context, pid);
done:
  JS_FreeCString(context, path);
  JS_FreeCString(context, cwd);
  free_strings(context, arguments);
  free_strings(context, environment);
  return result;
}

static JSValue js_dolly_process_wait(JSContext *context, JSValueConst this_value,
                                     int argc, JSValueConst *argv) {
  (void)this_value;
  int32_t pid;
  if (argc < 1 || JS_ToInt32(context, &pid, argv[0]) < 0) return JS_EXCEPTION;
  int status;
  const int result = waitpid(pid, &status, WNOHANG);
  if (result < 0) return fs_error(context, "waitpid", errno);
  if (result == 0) return JS_NULL;
  JSValue value = JS_NewObject(context);
  JS_SetPropertyStr(context, value, "status", WIFEXITED(status) ? JS_NewInt32(context, WEXITSTATUS(status)) : JS_NULL);
  JS_SetPropertyStr(context, value, "signal", JS_NewInt32(context, WIFSIGNALED(status) ? WTERMSIG(status) : 0));
  return value;
}

static JSValue js_dolly_process_kill(JSContext *context, JSValueConst this_value,
                                     int argc, JSValueConst *argv) {
  (void)this_value;
  int32_t pid, signal_number;
  if (argc < 2 || JS_ToInt32(context, &pid, argv[0]) < 0 ||
      JS_ToInt32(context, &signal_number, argv[1]) < 0) return JS_EXCEPTION;
  return kill(pid, signal_number) < 0 ? fs_error(context, "kill", errno) : JS_UNDEFINED;
}

static JSValue js_dolly_fs_pipe(JSContext *context, JSValueConst this_value,
                                int argc, JSValueConst *argv) {
  (void)this_value; (void)argc; (void)argv;
  int descriptors[2];
  if (pipe(descriptors) < 0) return fs_error(context, "pipe", errno);
  JSValue result = JS_NewArray(context);
  for (uint32_t index = 0; index < 2; ++index)
    JS_SetPropertyUint32(context, result, index, JS_NewInt32(context, descriptors[index]));
  return result;
}

static JSValue js_dolly_fs_poll(JSContext *context, JSValueConst this_value,
                                int argc, JSValueConst *argv) {
  (void)this_value;
  uint32_t count;
  int32_t timeout;
  if (argc < 2 || array_length(context, argv[0], 256, &count) < 0 ||
      JS_ToInt32(context, &timeout, argv[1]) < 0) return JS_EXCEPTION;
  struct pollfd descriptors[256];
  for (uint32_t index = 0; index < count; ++index) {
    JSValue entry = JS_GetPropertyUint32(context, argv[0], index);
    int32_t fd, events;
    const int failed = array_integer(context, entry, 0, &fd) < 0 ||
        array_integer(context, entry, 1, &events) < 0;
    JS_FreeValue(context, entry);
    if (failed) return JS_EXCEPTION;
    descriptors[index] = (struct pollfd){.fd = fd, .events = (short)events};
  }
  if (poll(descriptors, count, timeout) < 0) return fs_error(context, "poll", errno);
  JSValue result = JS_NewArray(context);
  for (uint32_t index = 0; index < count; ++index)
    JS_SetPropertyUint32(context, result, index, JS_NewInt32(context, descriptors[index].revents));
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


static int drain_command_jobs(JSContext *context) {
  JSContext *job_context = NULL;
  int status;
  while ((status = JS_ExecutePendingJob(JS_GetRuntime(context),
                                        &job_context)) > 0) {
  }
  if (status >= 0) return 0;

  JSContext *source = job_context == NULL ? context : job_context;
  JSValue exception = JS_GetException(source);
  JS_Throw(context, exception);
  return -1;
}

static JSValue js_dolly_pump_jobs(JSContext *context, JSValueConst this_value,
                                  int argc, JSValueConst *argv) {
  (void)this_value; (void)argc; (void)argv;
  return drain_command_jobs(context) < 0 ? JS_EXCEPTION : JS_UNDEFINED;
}

// QuickJS's own value serializer keeps cycles, Map/Set, Date, RegExp and typed
// arrays; functions and other host objects fail instead of being dropped.
static JSValue js_dolly_clone_value(JSContext *context, JSValueConst this_value,
                                   int argc, JSValueConst *argv) {
  (void)this_value;
  size_t length = 0;
  uint8_t *bytes = JS_WriteObject(context, &length, argc > 0 ? argv[0] : JS_UNDEFINED,
                                  JS_WRITE_OBJ_REFERENCE);
  if (bytes == NULL) return JS_EXCEPTION;
  JSValue result = JS_ReadObject(context, bytes, length, JS_READ_OBJ_REFERENCE);
  js_free(context, bytes);
  return result;
}

// Node's CommonJS wrapper, kept on the source's first line so stack frames
// name the module's own file, line and column.
static JSValue js_dolly_compile_commonjs(JSContext *context, JSValueConst this_value,
                                         int argc, JSValueConst *argv) {
  (void)this_value;
  static const char prefix[] = "(function (exports, require, module, __filename, __dirname) { ";
  static const char suffix[] = "\n})";
  if (argc < 2) return JS_ThrowTypeError(context, "compileCommonJs requires source and filename");
  size_t length = 0;
  const char *source = JS_ToCStringLen(context, &length, argv[0]);
  if (source == NULL) return JS_EXCEPTION;
  const char *filename = JS_ToCString(context, argv[1]);
  char *wrapped = filename == NULL ? NULL : malloc(sizeof(prefix) + length + sizeof(suffix));
  JSValue result = JS_EXCEPTION;
  if (wrapped != NULL) {
    memcpy(wrapped, prefix, sizeof(prefix) - 1);
    memcpy(wrapped + sizeof(prefix) - 1, source, length);
    memcpy(wrapped + sizeof(prefix) - 1 + length, suffix, sizeof(suffix));
    result = JS_Eval(context, wrapped, sizeof(prefix) - 1 + length + sizeof(suffix) - 1,
                     filename, JS_EVAL_TYPE_GLOBAL);
  } else if (filename != NULL) {
    JS_ThrowOutOfMemory(context);
  }
  free(wrapped);
  JS_FreeCString(context, filename);
  JS_FreeCString(context, source);
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
  DOLLY_JS_FUNCTION("envKeys", js_dolly_env_keys, 0);
  DOLLY_JS_FUNCTION("setenv", js_dolly_setenv, 2);
  DOLLY_JS_FUNCTION("cwd", js_dolly_cwd, 0);
  DOLLY_JS_FUNCTION("chdir", js_dolly_chdir, 1);
  DOLLY_JS_FUNCTION("readFile", js_dolly_read_file, 1);
  DOLLY_JS_FUNCTION("writeFile", js_dolly_write_file, 2);
  DOLLY_JS_FUNCTION("download", js_dolly_download, 1);
  DOLLY_JS_FUNCTION("fsOpen", js_dolly_fs_open, 2);
  DOLLY_JS_FUNCTION("fsClose", js_dolly_fs_close, 1);
  DOLLY_JS_FUNCTION("fsUtimes", js_dolly_fs_utimes, 3);
  DOLLY_JS_FUNCTION("fsReaddir", js_dolly_fs_readdir, 1);
  DOLLY_JS_FUNCTION("realpath", js_dolly_realpath, 1);
  DOLLY_JS_FUNCTION("fsReadlink", js_dolly_fs_readlink, 1);
  DOLLY_JS_FUNCTION("readRaw", js_dolly_read_raw, 1);
  DOLLY_JS_FUNCTION("readStdin", js_dolly_read_stdin, 1);
  DOLLY_JS_FUNCTION("isatty", js_dolly_isatty, 1);
  DOLLY_JS_FUNCTION("setRawMode", js_dolly_set_raw_mode, 1);
  DOLLY_JS_FUNCTION("terminalSize", js_dolly_terminal_size, 0);
  DOLLY_JS_FUNCTION("exit", js_dolly_exit, 1);
  DOLLY_JS_FUNCTION("httpStart", js_dolly_http_start, 5);
  DOLLY_JS_FUNCTION("httpPoll", js_dolly_http_poll, 1);
  DOLLY_JS_FUNCTION("httpCancel", js_dolly_http_cancel, 1);
  DOLLY_JS_FUNCTION("processSpawn", js_dolly_process_spawn, 6);
  DOLLY_JS_FUNCTION("processWait", js_dolly_process_wait, 1);
  DOLLY_JS_FUNCTION("processKill", js_dolly_process_kill, 2);
  DOLLY_JS_FUNCTION("fsPipe", js_dolly_fs_pipe, 0);
  DOLLY_JS_FUNCTION("fsPoll", js_dolly_fs_poll, 2);
  DOLLY_JS_FUNCTION("pumpJobs", js_dolly_pump_jobs, 0);
  DOLLY_JS_FUNCTION("random", js_dolly_random, 1);
  DOLLY_JS_FUNCTION("encode", js_dolly_encode, 1);
  DOLLY_JS_FUNCTION("decode", js_dolly_decode, 1);
  DOLLY_JS_FUNCTION("shell", js_dolly_shell, 3);
  DOLLY_JS_FUNCTION("cloneValue", js_dolly_clone_value, 1);
  DOLLY_JS_FUNCTION("compileCommonJs", js_dolly_compile_commonjs, 2);
#undef DOLLY_JS_FUNCTION
  JS_SetPropertyStr(context, dolly, "pid", JS_NewInt32(context, getpid()));
  JS_SetPropertyStr(context, dolly, "ppid", JS_NewInt32(context, getppid()));
#define DOLLY_FS_MAGIC(name, function, length, magic)                           \
  JS_SetPropertyStr(context, dolly, name,                                      \
                    JS_NewCFunctionMagic(context, function, name, length,      \
                                         JS_CFUNC_generic_magic, magic))
  DOLLY_FS_MAGIC("fsRead", js_dolly_fs_io, 5, 0);
  DOLLY_FS_MAGIC("fsWrite", js_dolly_fs_io, 5, 1);
  DOLLY_FS_MAGIC("fsStat", js_dolly_fs_stat, 1, 0);
  DOLLY_FS_MAGIC("fsLstat", js_dolly_fs_stat, 1, 1);
  DOLLY_FS_MAGIC("fsFstat", js_dolly_fs_stat, 1, 2);
  DOLLY_FS_MAGIC("fsTruncate", js_dolly_fs_resize, 2, 0);
  DOLLY_FS_MAGIC("fsFtruncate", js_dolly_fs_resize, 2, 1);
  DOLLY_FS_MAGIC("fsFsync", js_dolly_fs_resize, 1, 2);
#undef DOLLY_FS_MAGIC
  JSValue fs_constants = JS_NewObject(context);
#define DOLLY_FS_CONSTANT(name) JS_SetPropertyStr(context, fs_constants, #name, JS_NewInt32(context, name))
  DOLLY_FS_CONSTANT(O_RDONLY); DOLLY_FS_CONSTANT(O_WRONLY); DOLLY_FS_CONSTANT(O_RDWR);
  DOLLY_FS_CONSTANT(O_CREAT); DOLLY_FS_CONSTANT(O_EXCL); DOLLY_FS_CONSTANT(O_TRUNC);
  DOLLY_FS_CONSTANT(O_APPEND); DOLLY_FS_CONSTANT(O_NONBLOCK); DOLLY_FS_CONSTANT(O_SYNC);
  DOLLY_FS_CONSTANT(O_DIRECTORY); DOLLY_FS_CONSTANT(O_NOFOLLOW); DOLLY_FS_CONSTANT(O_CLOEXEC);
  DOLLY_FS_CONSTANT(POLLIN); DOLLY_FS_CONSTANT(POLLOUT);
  DOLLY_FS_CONSTANT(POLLERR); DOLLY_FS_CONSTANT(POLLHUP); DOLLY_FS_CONSTANT(POLLNVAL);
#undef DOLLY_FS_CONSTANT
  JS_SetPropertyStr(context, dolly, "fsConstants", fs_constants);
#define DOLLY_FS_FUNCTION(name, magic)                                         \
  JS_SetPropertyStr(context, dolly, name,                                      \
                    JS_NewCFunctionMagic(context, js_dolly_fs_operation, name, \
                                         magic == 4 || magic >= 6 ? 2 : 1,     \
                                         JS_CFUNC_generic_magic, magic))
  DOLLY_FS_FUNCTION("fsAccess", 0);
  DOLLY_FS_FUNCTION("fsMkdir", 1);
  DOLLY_FS_FUNCTION("fsUnlink", 2);
  DOLLY_FS_FUNCTION("fsRmdir", 3);
  DOLLY_FS_FUNCTION("fsRename", 4);
  DOLLY_FS_FUNCTION("fsChmod", 5);
  DOLLY_FS_FUNCTION("fsSymlink", 6);
  DOLLY_FS_FUNCTION("fsLink", 7);
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

static int install_globals(JSContext *context, const char *executable,
                           const char *script_path, int argc, char **argv) {
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
  if (JS_SetPropertyStr(context, global, "scriptExecutable",
                        JS_NewString(context, executable)) < 0) {
    JS_FreeValue(context, global);
    return -1;
  }
  if (script_path != NULL &&
      JS_SetPropertyStr(context, global, "scriptPath",
                        JS_NewString(context, script_path)) < 0) {
    JS_FreeValue(context, global);
    return -1;
  }
  JS_FreeValue(context, global);
  return 0;
}

// Frames inside the runtime read as Node's internals, which stack filters skip.
static int load_dolly_prelude(JSContext *context) {
  static const struct { const char *path, *name; } preludes[] = {
      {"/usr/lib/dolly/node.js", "node:internal/dolly"},
      {"/usr/lib/janis/runtime.js", "node:internal/janis"},
  };
  for (size_t index = 0; index < sizeof(preludes) / sizeof(preludes[0]); ++index) {
    size_t length = 0;
    char *source = read_file(preludes[index].path, &length);
    if (source == NULL) {
      fprintf(stderr, "janis: %s: %s\n", preludes[index].path, strerror(errno));
      return -1;
    }
    JSValue result = JS_Eval(context, source, length, preludes[index].name,
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

// As in Node, process 'uncaughtException' listeners receive an error that
// escaped; without one it is printed and the process fails. Returns 0 when a
// listener handled it.
static int report_uncaught(JSContext *context) {
  JSValue error = JS_GetException(context);
  JSValue handled = janis_interrupted ? JS_FALSE : call_janis(context, "__janisUncaught", 1, &error);
  if (JS_IsException(handled)) {
    JS_FreeValue(context, error);
    print_exception(context);
    return -1;
  }
  if (JS_ToBool(context, handled)) {
    JS_FreeValue(context, error);
    return 0;
  }
  JS_Throw(context, error);
  print_exception(context);
  return -1;
}

static int execute_pending_jobs(JSContext *context) {
  JSContext *job_context = NULL;
  int status;
  while ((status = JS_ExecutePendingJob(JS_GetRuntime(context), &job_context)) != 0) {
    if (status > 0) continue;
    if (report_uncaught(job_context == NULL ? context : job_context) < 0) return -1;
  }
  return 0;
}

// QuickJS reports each rejection and any later handler; the runtime decides
// which remain unhandled once microtasks drain, as Node does.
static void track_rejection(JSContext *context, JSValueConst promise, JSValueConst reason,
                            bool is_handled, void *opaque) {
  (void)opaque;
  JSValueConst arguments[] = {promise, reason, JS_NewBool(context, is_handled)};
  JSValue result = call_janis(context, "__janisRejection", 3, arguments);
  if (JS_IsException(result)) print_exception(context);
  JS_FreeValue(context, result);
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
  if (JS_IsException(result)) return report_uncaught(context) < 0 ? -1 : 1;
  const int active = JS_ToBool(context, result);
  JS_FreeValue(context, result);
  return active;
}

static int cleanup_janis(JSContext *context) {
  JSValue global = JS_GetGlobalObject(context);
  JSValue function = JS_GetPropertyStr(context, global, "__janisCleanup");
  JS_FreeValue(context, global);
  if (JS_IsException(function)) return -1;
  if (!JS_IsFunction(context, function)) {
    JS_FreeValue(context, function);
    return 0;
  }
  JSValue result = JS_Call(context, function, JS_UNDEFINED, 0, NULL);
  JS_FreeValue(context, function);
  if (JS_IsException(result)) {
    print_exception(context);
    return -1;
  }
  JS_FreeValue(context, result);
  return 0;
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
  JSValue stack = JS_IsError(exception)
      ? JS_GetPropertyStr(context, exception, "stack") : JS_UNDEFINED;
  const char *trace = JS_IsString(stack) ? JS_ToCString(context, stack) : NULL;
  // A V8-style stack already begins with the message line.
  if (message == NULL) fputs("qjs: JavaScript exception\n", stderr);
  else if (trace == NULL || strncmp(trace, message, strlen(message)) != 0)
    fprintf(stderr, "%s\n", message);
  if (trace != NULL) fprintf(stderr, "%s\n", trace);
  JS_FreeCString(context, trace);
  JS_FreeCString(context, message);
  JS_FreeValue(context, stack);
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
      track_rejection(context, *value, reason, true, NULL);  // reported here, not as unhandled
      JS_FreeValue(context, *value);
      *value = JS_EXCEPTION;
      JS_Throw(context, reason);
      return -1;
    }

    JSContext *job_context = NULL;
    const int status = JS_ExecutePendingJob(JS_GetRuntime(context),
                                            &job_context);
    if (status < 0) {
      if (report_uncaught(job_context == NULL ? context : job_context) == 0) continue;
      JS_FreeValue(context, *value);
      *value = JS_UNDEFINED;
      return -2;
    }
    if (status == 0) {
      const int active = pump_janis(context);
      if (active < 0) {
        JS_FreeValue(context, *value);
        *value = JS_UNDEFINED;
        return -2;
      }
      /* The last timer or HTTP completion can queue jobs without live handles. */
      if (active > 0 || JS_IsJobPending(JS_GetRuntime(context)) ||
          JS_PromiseState(context, *value) != JS_PROMISE_PENDING) continue;
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
  JSValue result = JS_UNDEFINED;
  char *entry_name = NULL;
  if (!module_mode) {
    // The runtime runs CommonJS itself and returns true for an ES module, as
    // Node decides by extension, package type and then syntax.
    JSValue arguments[] = {
        JS_NewStringLen(context, source, length),
        JS_NewString(context, name),
    };
    result = call_janis(context, "__janisMain", 2, arguments);
    JS_FreeValue(context, arguments[0]);
    JS_FreeValue(context, arguments[1]);
    module_mode = JS_IsBool(result) && JS_ToBool(context, result);
  }
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
  }
  // await_value returns -2 once it has reported the failure itself.
  const int awaited = JS_IsException(result) ? -1 : await_value(context, &result);
  if (awaited == 0) JS_FreeValue(context, result);
  else if (awaited == -2 || report_uncaught(context) < 0) return 1;

  for (;;) {
    if (execute_pending_jobs(context) < 0) return 1;
    const int active = pump_janis(context);
    if (active < 0) return 1;
    if (active == 0 && !JS_IsJobPending(JS_GetRuntime(context))) break;
  }
  JSValue exited = call_janis(context, "__janisExiting", 0, NULL);
  if (JS_IsException(exited)) return report_uncaught(context) < 0 ? 1 : process_exit_code(context);
  JS_FreeValue(context, exited);
  return process_exit_code(context);
}

int dolly_quickjs_embed(int argc, char **argv, const char *default_module,
                       int (*initialize)(JSContext *context)) {
  const char *source = NULL;
  const char *name = NULL;
  char *owned_source = NULL;
  size_t length = 0;
  int argument_index = 1;
  int module_mode = 0;
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
      name = "[eval]";
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
      install_globals(context, argv[0], strcmp(name, "[eval]") == 0 ? NULL : name,
                      argc - argument_index, argv + argument_index) != 0 ||
      install_dolly_backend(context) != 0 ||
      load_dolly_prelude(context) != 0 ||
      (initialize && initialize(context) != 0)) {
    if (context != NULL) JS_FreeContext(context);
    JS_FreeRuntime(runtime);
    free(owned_source);
    // Ctrl+C during startup aborts the setup code it interrupted.
    if (janis_interrupted) dolly_exit_signal(SIGINT);
    fputs("qjs: could not create context\n", stderr);
    return 1;
  }

  JS_SetHostPromiseRejectionTracker(runtime, track_rejection, NULL);
  int status = evaluate(context, source, length,
                        strcmp(name, "-") == 0 ? "[stdin]" : name, module_mode);
  if (janis_interrupted) status = 128 + SIGINT;
  if (cleanup_janis(context) != 0 && status == 0) status = 1;
  JS_FreeContext(context);
  JS_FreeRuntime(runtime);
  free(owned_source);
  if (janis_interrupted) dolly_exit_signal(SIGINT);
  return status;
}

int dolly_quickjs_run(int argc,char **argv,const char *default_module) {
  return dolly_quickjs_embed(argc,argv,default_module,NULL);
}
