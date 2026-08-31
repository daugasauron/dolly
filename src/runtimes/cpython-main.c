#include "Python.h"

#include <stdio.h>
#include <string.h>

static int initialized;

static int initialize_python(const char *program) {
    if (initialized) return 0;

    PyConfig config;
    PyConfig_InitPythonConfig(&config);
    config.install_signal_handlers = 0;
    config.parse_argv = 0;
    char *arguments[] = {(char *)program};
    PyStatus status = PyConfig_SetBytesArgv(&config, 1, arguments);
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

static PyObject *fresh_main_globals(void) {
    PyObject *module = PyImport_AddModule("__main__");
    if (module == NULL) return NULL;
    PyObject *globals = PyModule_GetDict(module);
    PyDict_Clear(globals);
    PyObject *name = PyUnicode_FromString("__main__");
    if (name == NULL || PyDict_SetItemString(globals, "__name__", name) < 0 ||
        PyDict_SetItemString(globals, "__builtins__", PyEval_GetBuiltins()) < 0) {
        Py_XDECREF(name);
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
    if (result == NULL) return exception_status();
    Py_DECREF(result);
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
        if (close_file) fclose(file);
        return exception_status();
    }
    Py_DECREF(path);
    PyObject *result = PyRun_FileExFlags(
        file, name, Py_file_input, globals, globals, close_file, NULL);
    if (result == NULL) return exception_status();
    Py_DECREF(result);
    return 0;
}

static int run_module(const char *name) {
    PyObject *runpy = PyImport_ImportModule("runpy");
    PyObject *function = runpy == NULL
        ? NULL : PyObject_GetAttrString(runpy, "_run_module_as_main");
    PyObject *module_name = function == NULL ? NULL : PyUnicode_FromString(name);
    PyObject *result = module_name == NULL ? NULL :
        PyObject_CallFunctionObjArgs(function, module_name, Py_True, NULL);
    Py_XDECREF(module_name);
    Py_XDECREF(function);
    Py_XDECREF(runpy);
    if (result == NULL) return exception_status();
    Py_DECREF(result);
    return 0;
}

int main(int argc, char **argv) {
    if (argc == 2 &&
        (strcmp(argv[1], "--version") == 0 || strcmp(argv[1], "-V") == 0)) {
        printf("Python %s\n", PY_VERSION);
        return 0;
    }
    int status = initialize_python(argv[0]);
    if (status != 0) return status;

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
