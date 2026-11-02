// html@0 kernel side: the page shows one process's document at a time, and
// that process waits for what the user does with it.
#include "process-kernel.h"

#include <dolly/html.h>
#include <dolly/process.h>
#include <errno.h>
#include <stdint.h>

DOLLY_BROWSER_IMPORT(dolly_html_dispatch)
int dolly_html_dispatch(uint32_t operation, unsigned char *bytes, uintptr_t length);

// The process whose popup the page shows.
static int owner;

static void html_close(void) {
  dolly_html_dispatch(DOLLY_HTML_CLOSE, NULL, 0);
  owner = 0;
}

static int64_t html_show(int pid, unsigned char *document, uintptr_t size) {
  if (owner == pid) html_close();
  if (owner != 0) return DOLLY_PROCESS_DISPATCH_DEFERRED;
  if (size == 0) return -EINVAL;
  if (size > DOLLY_HTML_DOCUMENT_MAX) return -EFBIG;
  const int status = dolly_html_dispatch(DOLLY_HTML_OPEN, document, size);
  if (status == 0) owner = pid;
  return status;
}

// The supervisor retries a deferred WAIT each scheduling turn, and at once
// when the page reports the user's answer.
static int64_t html_wait(int pid, unsigned char *fields, uintptr_t capacity) {
  if (owner != pid) return -EBADF;
  const int result = dolly_html_dispatch(DOLLY_HTML_ANSWER, fields,
      capacity < DOLLY_HTML_FIELDS_MAX ? capacity : DOLLY_HTML_FIELDS_MAX);
  if (result == -EAGAIN) return DOLLY_PROCESS_DISPATCH_DEFERRED;
  owner = 0;
  return result;
}

static int64_t html_call(int pid, int tid, uint32_t operation, unsigned char *mailbox,
                         uintptr_t request_size, uintptr_t response_capacity) {
  if (operation == DOLLY_HTML_SHOW) return html_show(pid, mailbox, request_size);
  return request_size != 0 ? -EINVAL : html_wait(pid, mailbox, response_capacity);
}

static void html_release(int pid, int tid) {
  if (tid == 0 && owner == pid) html_close();
}

const dolly_kernel_module dolly_html_kernel = {
    DOLLY_HTML_SHOW, DOLLY_HTML_WAIT, html_call, html_release};
