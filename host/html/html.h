#ifndef DOLLY_HTML_API_H
#define DOLLY_HTML_API_H

#include <stddef.h>
#include <dolly/html-abi.h>

#ifdef __cplusplus
extern "C" {
#endif

// Shows `size` bytes of UTF-8 HTML in a popup of the page, which shows its
// text, headings, lists, tables and forms in the page's own style
// (dolly-html-0.wat), and waits until the user submits a form of it or closes
// it. Returns the length of the submitted fields written to `fields`
// (application/x-www-form-urlencoded, as a browser posts a form), or a
// negative errno: -ECANCELED when the user closed the popup, -EFBIG for a
// document over DOLLY_HTML_DOCUMENT_MAX bytes, -EILSEQ for one that is not
// UTF-8, -EMSGSIZE for fields over `capacity` bytes.
int dolly_html_show(const void *document, size_t size, char *fields, size_t capacity);

#ifdef __cplusplus
}
#endif

#endif
