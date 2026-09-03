/* CPython adapter for Dolly's synchronous in-userspace process model.
 *
 * This is intentionally above the stable Dolly ABI.  It translates Python
 * objects into the small spawn/wait contract; it does not expose a browser,
 * native host process, or a second filesystem.
 */

#include "Python.h"

#include <dolly/runtime.h>

#include <errno.h>
#include <limits.h>
#include <stdlib.h>
#include <unistd.h>

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
            PyMem_Free(items);
            Py_DECREF(sequence);
            PyErr_SetString(PyExc_TypeError, "process arguments must be strings");
            return -1;
        }
        items[index] = (char *)PyUnicode_AsUTF8(item);
        if (items[index] == NULL) {
            PyMem_Free(items);
            Py_DECREF(sequence);
            return -1;
        }
    }
    *result = items;
    *owner = sequence;
    return (int)count;
}

static PyObject *process_spawn(PyObject *module, PyObject *arguments) {
    (void)module;
    PyObject *path_object;
    PyObject *argv_object;
    PyObject *environment_object;
    PyObject *cwd_object;
    PyObject *timeout_object;
    int stdin_fd;
    int stdout_fd;
    int stderr_fd;
    if (!PyArg_ParseTuple(arguments, "OOOOiiiO:spawn", &path_object,
                          &argv_object, &environment_object, &cwd_object,
                          &stdin_fd, &stdout_fd, &stderr_fd, &timeout_object)) {
        return NULL;
    }

    PyObject *path_bytes = NULL;
    if (!PyUnicode_FSConverter(path_object, &path_bytes)) return NULL;
    const char *path = PyBytes_AS_STRING(path_bytes);

    char **argv = NULL;
    PyObject *argv_owner = NULL;
    const int argc = string_vector(argv_object, &argv, &argv_owner);
    if (argc < 0) {
        Py_DECREF(path_bytes);
        return NULL;
    }
    if (argc == 0) {
        PyErr_SetString(PyExc_ValueError, "process argument list is empty");
        goto error;
    }

    char **environment = NULL;
    PyObject *environment_owner = NULL;
    if (environment_object != Py_None &&
        string_vector(environment_object, &environment, &environment_owner) < 0) {
        goto error;
    }

    PyObject *cwd_bytes = NULL;
    char *saved_cwd = NULL;
    int pid = -1;
    int status = 0;
    int wait_result = 0;
    if (cwd_object != Py_None) {
        if (!PyUnicode_FSConverter(cwd_object, &cwd_bytes)) goto error;
        saved_cwd = getcwd(NULL, 0);
        if (saved_cwd == NULL) {
            PyErr_SetFromErrno(PyExc_OSError);
            goto error;
        }
        if (chdir(PyBytes_AS_STRING(cwd_bytes)) != 0) {
            PyErr_SetFromErrnoWithFilenameObject(PyExc_OSError, cwd_object);
            goto error;
        }
    }

    double timeout_milliseconds = -1;
    if (timeout_object != Py_None) {
        timeout_milliseconds = PyFloat_AsDouble(timeout_object) * 1000.0;
        if (PyErr_Occurred()) goto restore;
        if (timeout_milliseconds < 0) {
            PyErr_SetString(PyExc_ValueError, "timeout must be non-negative");
            goto restore;
        }
        if (environment != NULL) {
            PyErr_SetString(PyExc_NotImplementedError,
                            "Dolly version 0 cannot combine an explicit "
                            "environment with a subprocess timeout");
            goto restore;
        }
    }

    pid = timeout_milliseconds < 0
        ? dolly_spawn_env(path, argc, argv, environment,
                          stdin_fd, stdout_fd, stderr_fd)
        : dolly_spawn_timeout(path, argc, argv, stdin_fd, stdout_fd, stderr_fd,
                              timeout_milliseconds);
    wait_result = pid < 0 ? pid : dolly_wait(pid, &status);

restore:
    if (saved_cwd != NULL) {
        if (chdir(saved_cwd) != 0 && !PyErr_Occurred()) {
            PyErr_SetFromErrno(PyExc_OSError);
        }
    }
    free(saved_cwd);
    saved_cwd = NULL;
    Py_XDECREF(cwd_bytes);
    cwd_bytes = NULL;
    if (PyErr_Occurred()) goto error;
    if (pid < 0 || wait_result < 0) {
        errno = -(pid < 0 ? pid : wait_result);
        PyErr_SetFromErrnoWithFilenameObject(PyExc_OSError, path_object);
        goto error;
    }

    PyMem_Free(environment);
    Py_XDECREF(environment_owner);
    PyMem_Free(argv);
    Py_DECREF(argv_owner);
    Py_DECREF(path_bytes);
    return Py_BuildValue("ii", pid, status);

error:
    free(saved_cwd);
    Py_XDECREF(cwd_bytes);
    PyMem_Free(environment);
    Py_XDECREF(environment_owner);
    PyMem_Free(argv);
    Py_XDECREF(argv_owner);
    Py_DECREF(path_bytes);
    return NULL;
}

static PyMethodDef process_methods[] = {
    {"spawn", process_spawn, METH_VARARGS,
     PyDoc_STR("spawn(path, argv, env, cwd, stdin_fd, stdout_fd, stderr_fd, timeout)")},
    {NULL, NULL, 0, NULL},
};

static struct PyModuleDef process_module = {
    PyModuleDef_HEAD_INIT,
    "_dolly_process",
    "Dolly's synchronous in-Wasm process adapter.",
    -1,
    process_methods,
};

PyMODINIT_FUNC PyInit__dolly_process(void) {
    return PyModule_Create(&process_module);
}
