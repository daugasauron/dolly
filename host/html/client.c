#include <dolly/html.h>
#include <dolly/process.h>
#include <dolly/host.h>
#include <errno.h>

DOLLY_HOST_REQUIRE(html, 0, DOLLY_HTML_ABI_DIGEST);

int dolly_html_show(const void *document, size_t size, char *fields, size_t capacity) {
  if (document == NULL || fields == NULL) return -EFAULT;
  if (size == 0) return -EINVAL;
  if (size > DOLLY_HTML_DOCUMENT_MAX) return -EFBIG;
  const int64_t shown = dolly_process_call(DOLLY_HTML_SHOW, document, size, NULL, 0);
  if (shown != 0) return shown < 0 ? (int)shown : -EIO;
  const int64_t answer = dolly_process_call(DOLLY_HTML_WAIT, NULL, 0, fields, capacity);
  return answer < 0 || answer <= (int64_t)capacity ? (int)answer : -EIO;
}
