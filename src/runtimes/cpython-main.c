#include "Python.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

extern char **environ;

static int initialized;

static int initialize_python(const char *program) {
    if (initialized) return 0;

    PyConfig config;
    PyConfig_InitPythonConfig(&config);
    config.install_signal_handlers = 0;
    config.parse_argv = 0;
    char *arguments[] = {(char *)program};
    static const char canonical_executable[] = "/usr/bin/python";
    PyStatus status = PyConfig_SetBytesString(
        &config, &config.program_name, canonical_executable);
    if (!PyStatus_Exception(status)) {
        status = PyConfig_SetBytesString(
            &config, &config.executable, canonical_executable);
    }
    if (!PyStatus_Exception(status)) {
        status = PyConfig_SetBytesString(&config, &config.home, "/usr");
    }
    if (!PyStatus_Exception(status)) {
        status = PyConfig_SetBytesArgv(&config, 1, arguments);
    }
    if (!PyStatus_Exception(status)) {
        status = Py_InitializeFromConfig(&config);
    }
    PyConfig_Clear(&config);
    if (PyStatus_Exception(status)) {
        if (status.err_msg != NULL) {
            fprintf(stderr, "python: %s\n", status.err_msg);
        }
        return PyStatus_IsExit(status) ? status.exitcode : 1;
    }
    initialized = 1;
    return 0;
}

static int set_argv(int argc, char **argv) {
    PyObject *items = PyList_New(argc);
    if (items == NULL) return -1;
    for (int index = 0; index < argc; index++) {
        PyObject *item = PyUnicode_DecodeFSDefault(argv[index]);
        if (item == NULL) {
            Py_DECREF(items);
            return -1;
        }
        PyList_SET_ITEM(items, index, item);
    }
    int result = PySys_SetObject("argv", items);
    Py_DECREF(items);
    return result;
}

static int synchronize_environment(PyObject **mapping_result,
                                   PyObject **saved_result) {
    PyObject *os_module = PyImport_ImportModule("os");
    PyObject *mapping = os_module == NULL
        ? NULL : PyObject_GetAttrString(os_module, "environ");
    PyObject *saved = mapping == NULL
        ? NULL : PyObject_CallMethod(mapping, "copy", NULL);
    PyObject *desired = saved == NULL ? NULL : PyDict_New();
    Py_XDECREF(os_module);
    if (desired == NULL) {
        Py_XDECREF(mapping);
        Py_XDECREF(saved);
        return -1;
    }

    for (size_t index = 0; environ != NULL && environ[index] != NULL; ++index) {
        const char *separator = strchr(environ[index], '=');
        if (separator == NULL) continue;
        PyObject *key = PyUnicode_DecodeFSDefaultAndSize(
            environ[index], (Py_ssize_t)(separator - environ[index]));
        PyObject *value = key == NULL
            ? NULL : PyUnicode_DecodeFSDefault(separator + 1);
        if (value == NULL || PyDict_SetItem(desired, key, value) < 0) {
            Py_XDECREF(value);
            Py_XDECREF(key);
            Py_DECREF(desired);
            Py_DECREF(mapping);
            Py_DECREF(saved);
            return -1;
        }
        Py_DECREF(value);
        Py_DECREF(key);
    }

    PyObject *cleared = PyObject_CallMethod(mapping, "clear", NULL);
    PyObject *updated = cleared == NULL
        ? NULL : PyObject_CallMethod(mapping, "update", "O", desired);
    Py_XDECREF(cleared);
    Py_DECREF(desired);
    if (updated == NULL) {
        Py_DECREF(mapping);
        Py_DECREF(saved);
        return -1;
    }
    Py_DECREF(updated);
    *mapping_result = mapping;
    *saved_result = saved;
    return 0;
}

static int restore_environment(PyObject *mapping, PyObject *saved) {
    PyObject *cleared = PyObject_CallMethod(mapping, "clear", NULL);
    PyObject *updated = cleared == NULL
        ? NULL : PyObject_CallMethod(mapping, "update", "O", saved);
    Py_XDECREF(cleared);
    if (updated == NULL) return -1;
    Py_DECREF(updated);
    return 0;
}

static PyObject *fresh_main_globals(void) {
    /* A nested Dolly spawn may invoke /usr/bin/python while its parent Python
     * frame is still live. Give every invocation independent globals rather
     * than clearing the process-wide __main__ dictionary underneath it. */
    PyObject *globals = PyDict_New();
    if (globals == NULL) return NULL;
    PyObject *name = PyUnicode_FromString("__main__");
    if (name == NULL || PyDict_SetItemString(globals, "__name__", name) < 0 ||
        PyDict_SetItemString(globals, "__builtins__", PyEval_GetBuiltins()) < 0) {
        Py_XDECREF(name);
        Py_DECREF(globals);
        return NULL;
    }
    Py_DECREF(name);
    return globals;
}

static int exception_status(void) {
    if (!PyErr_ExceptionMatches(PyExc_SystemExit)) {
        PyErr_Print();
        return 1;
    }

    PyObject *type = NULL;
    PyObject *value = NULL;
    PyObject *traceback = NULL;
    PyErr_Fetch(&type, &value, &traceback);
    PyErr_NormalizeException(&type, &value, &traceback);
    int status = 0;
    PyObject *code = value == NULL ? NULL : PyObject_GetAttrString(value, "code");
    if (code != NULL && code != Py_None) {
        if (PyLong_Check(code)) {
            long parsed = PyLong_AsLong(code);
            status = parsed >= 0 && parsed <= 255 ? (int)parsed : 1;
        } else {
            PyObject_Print(code, stderr, Py_PRINT_RAW);
            fputc('\n', stderr);
            status = 1;
        }
    }
    Py_XDECREF(code);
    Py_XDECREF(type);
    Py_XDECREF(value);
    Py_XDECREF(traceback);
    PyErr_Clear();
    return status;
}

static int run_code(const char *code) {
    PyObject *globals = fresh_main_globals();
    if (globals == NULL) return exception_status();
    PyObject *result = PyRun_StringFlags(code, Py_file_input, globals, globals, NULL);
    if (result == NULL) {
        Py_DECREF(globals);
        return exception_status();
    }
    Py_DECREF(result);
    Py_DECREF(globals);
    return 0;
}

static int run_file(FILE *file, const char *name, int close_file) {
    PyObject *globals = fresh_main_globals();
    if (globals == NULL) {
        if (close_file) fclose(file);
        return exception_status();
    }
    PyObject *path = PyUnicode_DecodeFSDefault(name);
    if (path == NULL || PyDict_SetItemString(globals, "__file__", path) < 0) {
        Py_XDECREF(path);
        Py_DECREF(globals);
        if (close_file) fclose(file);
        return exception_status();
    }
    Py_DECREF(path);
    PyObject *result = PyRun_FileExFlags(
        file, name, Py_file_input, globals, globals, close_file, NULL);
    if (result == NULL) {
        Py_DECREF(globals);
        return exception_status();
    }
    Py_DECREF(result);
    Py_DECREF(globals);
    return 0;
}

static int run_module(const char *name) {
    PyObject *runpy = PyImport_ImportModule("runpy");
    PyObject *function = runpy == NULL
        ? NULL : PyObject_GetAttrString(runpy, "run_module");
    PyObject *module_name = function == NULL ? NULL : PyUnicode_FromString(name);
    PyObject *arguments = module_name == NULL ? NULL : PyTuple_Pack(1, module_name);
    PyObject *keywords = arguments == NULL ? NULL : Py_BuildValue(
        "{s:s,s:O}", "run_name", "__main__", "alter_sys", Py_True);
    PyObject *result = keywords == NULL ? NULL :
        PyObject_Call(function, arguments, keywords);
    Py_XDECREF(keywords);
    Py_XDECREF(arguments);
    Py_XDECREF(module_name);
    Py_XDECREF(function);
    Py_XDECREF(runpy);
    if (result == NULL) return exception_status();
    Py_DECREF(result);
    return 0;
}

static int run_invocation(int argc, char **argv) {
    if (argc >= 2 && strcmp(argv[1], "-c") == 0) {
        if (argc < 3) {
            fputs("python: argument expected for -c\n", stderr);
            return 2;
        }
        if (set_argv(argc - 2, argv + 2) < 0) return exception_status();
        return run_code(argv[2]);
    }
    if (argc >= 2 && strcmp(argv[1], "-m") == 0) {
        if (argc < 3) {
            fputs("python: argument expected for -m\n", stderr);
            return 2;
        }
        if (set_argv(argc - 2, argv + 2) < 0) return exception_status();
        return run_module(argv[2]);
    }
    if (argc >= 2 && strcmp(argv[1], "-") != 0) {
        if (argv[1][0] == '-') {
            fprintf(stderr, "python: unsupported option: %s\n", argv[1]);
            return 2;
        }
        if (set_argv(argc - 1, argv + 1) < 0) return exception_status();
        FILE *file = fopen(argv[1], "rb");
        if (file == NULL) {
            perror(argv[1]);
            return 2;
        }
        return run_file(file, argv[1], 1);
    }

    char *stdin_argv[] = {"-"};
    if (set_argv(1, stdin_argv) < 0) return exception_status();
    if (argc == 1 && Py_FdIsInteractive(stdin, NULL)) {
        int result = PyRun_InteractiveLoopFlags(stdin, "<stdin>", NULL);
        return result == 0 ? 0 : exception_status();
    }
    return run_file(stdin, "<stdin>", 0);
}

int main(int argc, char **argv) {
    if (argc == 2 &&
        (strcmp(argv[1], "--version") == 0 || strcmp(argv[1], "-V") == 0)) {
        printf("Python %s\n", PY_VERSION);
        return 0;
    }
    int status = initialize_python(argv[0]);
    if (status != 0) return status;

    /* sys.argv is interpreter-global, while Dolly commands are nested and
     * synchronous. Save it across a child Python invocation just like the
     * runtime saves cwd, environment, and descriptors around every command. */
    PyObject *saved_argv = PySys_GetObject("argv");
    Py_XINCREF(saved_argv);
    PyObject *environment = NULL;
    PyObject *saved_environment = NULL;
    if (synchronize_environment(&environment, &saved_environment) < 0) {
        status = exception_status();
    } else {
        status = run_invocation(argc, argv);
    }
    if (environment != NULL &&
        restore_environment(environment, saved_environment) < 0 && status == 0) {
        status = exception_status();
    }
    Py_XDECREF(environment);
    Py_XDECREF(saved_environment);
    if (saved_argv != NULL && PySys_SetObject("argv", saved_argv) < 0 && status == 0) {
        status = exception_status();
    }
    Py_XDECREF(saved_argv);
    return status;
}

/* The interpreter and the command-local `initialized` guard must remain one
 * lifecycle unit across repeated synchronous spawns. libpython is a provider,
 * but /usr/bin/python owns command persistence. */
__attribute__((export_name("dolly_preserve_module_state")))
void dolly_preserve_module_state(void) {}
