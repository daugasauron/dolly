// _dolly_http: CPython binding of Dolly's brokered HTTP client (dolly/http.h).
// Requests still cross env.dolly_http_dispatch and its browser policy; there
// is no socket or TLS here. Transports are in dolly_http.py.
#define PY_SSIZE_T_CLEAN
#include <Python.h>
#include <dolly/http.h>

static unsigned char record[DOLLY_HTTP_CHUNK_CAPACITY];

static PyObject *raise_http_error(int error) {
  // OSError selects its subclass (PermissionError, TimeoutError, ...) by errno.
  PyObject *arguments = Py_BuildValue("(is)", error, dolly_http_error_message(error));
  if (arguments != NULL) PyErr_SetObject(PyExc_OSError, arguments);
  Py_XDECREF(arguments);
  return NULL;
}

// start(method, url, headers, body, flags) -> handle. `headers` holds
// `name: value\r\n` lines. EBUSY means every request slot is in use.
static PyObject *http_start(PyObject *module, PyObject *arguments) {
  const char *method, *url, *headers;
  Py_buffer body;
  unsigned int flags, sequence = 0;
  if (!PyArg_ParseTuple(arguments, "sssy*I", &method, &url, &headers, &body, &flags)) return NULL;
  const int result = dolly_http_start(method, url, headers, body.buf, (size_t)body.len, flags, &sequence);
  PyBuffer_Release(&body);
  return result != 0 ? raise_http_error(-result) : PyLong_FromUnsignedLong(sequence);
}

// poll(handle) -> None while nothing is ready, else (kind, status, eof, bytes).
// A transfer error is the request's final record and raises OSError.
static PyObject *http_poll(PyObject *module, PyObject *arguments) {
  unsigned int sequence;
  if (!PyArg_ParseTuple(arguments, "I", &sequence)) return NULL;
  dolly_http_chunk chunk = {0};
  const int result = dolly_http_poll(sequence, &chunk, record, sizeof(record));
  if (result < 0) return raise_http_error(-result);
  if (result == 0) Py_RETURN_NONE;
  if (chunk.error != 0) return raise_http_error((int)chunk.error);
  return Py_BuildValue("(IIIy#)", chunk.kind, chunk.status, chunk.eof,
                       (const char *)record, (Py_ssize_t)chunk.length);
}

static PyObject *http_cancel(PyObject *module, PyObject *arguments) {
  unsigned int sequence;
  if (!PyArg_ParseTuple(arguments, "I", &sequence)) return NULL;
  const int result = dolly_http_cancel(sequence);
  if (result != 0) return raise_http_error(-result);
  Py_RETURN_NONE;
}

static PyMethodDef methods[] = {
  {"start", http_start, METH_VARARGS, NULL},
  {"poll", http_poll, METH_VARARGS, NULL},
  {"cancel", http_cancel, METH_VARARGS, NULL},
  {NULL, NULL, 0, NULL},
};

static int add_constants(PyObject *module) {
  return PyModule_AddIntConstant(module, "FOLLOW_REDIRECTS", DOLLY_HTTP_FOLLOW_REDIRECTS) ||
         PyModule_AddIntConstant(module, "KIND_URL", DOLLY_HTTP_KIND_URL) ||
         PyModule_AddIntConstant(module, "KIND_HEADER", DOLLY_HTTP_KIND_HEADER) ||
         PyModule_AddIntConstant(module, "KIND_BODY", DOLLY_HTTP_KIND_BODY);
}

static PyModuleDef_Slot slots[] = {
  {Py_mod_exec, add_constants},
  {0, NULL},
};

static struct PyModuleDef definition = {
  PyModuleDef_HEAD_INIT, "_dolly_http", NULL, 0, methods, slots,
};

PyMODINIT_FUNC PyInit__dolly_http(void) { return PyModuleDef_Init(&definition); }
