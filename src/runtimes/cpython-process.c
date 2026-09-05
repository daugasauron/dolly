/* CPython spawn adapter above Dolly's kernel-owned process interface. */
#include "Python.h"
#include <dolly/runtime.h>
#include <errno.h>
#include <limits.h>
#include <string.h>

static int string_vector(PyObject *value, char ***result, PyObject **owner) {
    PyObject *sequence = PySequence_Fast(value, "expected a sequence of strings");
    if (sequence == NULL) return -1;
    const Py_ssize_t count = PySequence_Fast_GET_SIZE(sequence);
    if (count > INT_MAX) {
        Py_DECREF(sequence);
        PyErr_SetString(PyExc_OverflowError, "process argument list is too large");
        return -1;
    }
    char **items = PyMem_Calloc((size_t)count + 1, sizeof(*items));
    if (items == NULL) {
        Py_DECREF(sequence);
        PyErr_NoMemory();
        return -1;
    }
    for (Py_ssize_t index = 0; index < count; ++index) {
        PyObject *item = PySequence_Fast_GET_ITEM(sequence, index);
        if (!PyUnicode_Check(item)) {
            PyErr_SetString(PyExc_TypeError, "process arguments must be strings");
            goto error;
        }
        Py_ssize_t size;
        items[index] = (char *)PyUnicode_AsUTF8AndSize(item, &size);
        if (items[index] == NULL) goto error;
        if (memchr(items[index], 0, (size_t)size) != NULL) {
            PyErr_SetString(PyExc_ValueError, "embedded null byte");
            goto error;
        }
    }
    *result = items;
    *owner = sequence;
    return (int)count;
error:
    PyMem_Free(items);
    Py_DECREF(sequence);
    return -1;
}

static PyObject *process_spawn(PyObject *module, PyObject *arguments) {
    (void)module;
    const char *path, *cwd;
    PyObject *argv_object, *environment_object;
    int stdin_fd, stdout_fd, stderr_fd;
    if (!PyArg_ParseTuple(arguments, "sOOziii:spawn", &path,
                          &argv_object, &environment_object, &cwd,
                          &stdin_fd, &stdout_fd, &stderr_fd)) return NULL;

    char **argv = NULL, **environment = NULL;
    PyObject *argv_owner = NULL, *environment_owner = NULL, *result = NULL;
    const int argc = string_vector(argv_object, &argv, &argv_owner);
    if (argc < 0) goto done;
    if (argc == 0) {
        PyErr_SetString(PyExc_ValueError, "process argument list is empty");
        goto done;
    }
    if (environment_object != Py_None &&
        string_vector(environment_object, &environment, &environment_owner) < 0) goto done;

    extern char **environ;
    const int pid = dolly_spawn_env_cwd(path, argc, argv,
        environment == NULL ? environ : environment, cwd,
        stdin_fd, stdout_fd, stderr_fd, -1);
    if (pid < 0) {
        errno = -pid;
        PyErr_SetFromErrnoWithFilename(PyExc_OSError, path);
    } else result = PyLong_FromLong(pid);
done:
    PyMem_Free(environment);
    Py_XDECREF(environment_owner);
    PyMem_Free(argv);
    Py_XDECREF(argv_owner);
    return result;
}

static PyMethodDef process_methods[] = {
    {"spawn", process_spawn, METH_VARARGS,
     PyDoc_STR("spawn(path, argv, env, cwd, stdin_fd, stdout_fd, stderr_fd) -> pid")},
    {NULL, NULL, 0, NULL},
};
static struct PyModuleDef process_module = {
    PyModuleDef_HEAD_INIT, "_dolly_process", "Dolly's in-Wasm process spawn adapter.",
    -1, process_methods,
};
PyMODINIT_FUNC PyInit__dolly_process(void) {
    return PyModule_Create(&process_module);
}
