(module
  ;; An HTML document a program shows the user, in a popup of the page, and
  ;; the fields of a form of it that the user submits. The page shows what the
  ;; document says, not what it does: it builds the popup from the document's
  ;; text, headings, lists, tables and forms, styled by the page's own sheet;
  ;; every other element and attribute is left out. The popup is a frame of an
  ;; opaque origin that loads nothing and runs no script but the page's own:
  ;; no URL of the document is fetched or navigated to, and nothing of the page
  ;; or the network is reachable from it.
  (import "env" "memory" (memory i64 1024 131072 shared))
  ;; (operation, span address, span byte length) -> 0, a length or -errno; one
  ;; popup at a time. OPEN's span is the document: 1 to DOCUMENT_MAX bytes of
  ;; UTF-8 (EILSEQ otherwise); EBUSY while a popup is shown, ECANCELED for 2 s
  ;; after the user closed one. ANSWER's span is where the fields go: EAGAIN
  ;; until the user acts, then the fields' length, ECANCELED when the user
  ;; closed the popup, EMSGSIZE when they do not fit; the popup is over. CLOSE
  ;; takes an empty span and removes the popup.
  (import "env" "dolly_html_dispatch"
    (func $dolly_html_dispatch (param i32 i64 i64) (result i32)))
  (global (export "DOLLY_HTML_OPEN") i32 (i32.const 1))
  (global (export "DOLLY_HTML_ANSWER") i32 (i32.const 2))
  (global (export "DOLLY_HTML_CLOSE") i32 (i32.const 3))
  (global (export "DOLLY_HTML_DOCUMENT_MAX") i32 (i32.const 1048576))
  ;; Fields are application/x-www-form-urlencoded, as a browser posts a form:
  ;; the submitted form's entries and its submit button's name and value.
  (global (export "DOLLY_HTML_FIELDS_MAX") i32 (i32.const 65536))

  ;; Process operations. SHOW's request is the document; no response. It shows
  ;; it, in place of the caller's own popup, and waits while another process
  ;; shows one. WAIT has no request; its response is the fields. It waits
  ;; until the user submits a form of the caller's popup or closes it: the
  ;; fields' length, or ECANCELED. EBADF without a popup. Process exit removes
  ;; it.
  (global (export "DOLLY_HTML_SHOW") i32 (i32.const 192))
  (global (export "DOLLY_HTML_WAIT") i32 (i32.const 193))
)
