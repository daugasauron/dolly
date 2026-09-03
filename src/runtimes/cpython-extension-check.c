#define PY_SSIZE_T_CLEAN
#include <Python.h>

static PyObject *answer(PyObject *self, PyObject *args) {
    (void)self;
    (void)args;
    return PyLong_FromLong(42);
}

static PyMethodDef methods[] = {
    {"answer", answer, METH_NOARGS, "Return the extension-loader proof value."},
    {NULL, NULL, 0, NULL},
};

static struct PyModuleDef module = {
    PyModuleDef_HEAD_INIT,
    "dolly_extension_check",
    "Dolly native-extension ABI proof.",
    -1,
    methods,
};

PyMODINIT_FUNC PyInit_dolly_extension_check(void) {
    return PyModule_Create(&module);
}
