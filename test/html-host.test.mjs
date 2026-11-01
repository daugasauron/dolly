import assert from "node:assert/strict";
import test from "node:test";
import { worker } from "../host/html/html.mjs";
import { DOLLY_ERRNO as E, DOLLY_HTML_OPEN, DOLLY_HTML_ANSWER, DOLLY_HTML_CLOSE, DOLLY_HTML_DOCUMENT_MAX,
  DOLLY_HTML_FIELDS_MAX } from "../host/html/abi.mjs";

// The Worker side bounds what a compromised kernel hands it, shows one popup
// at a time and gives each answer once.
test("html module bounds spans, shows one popup and answers it once", () => {
  const memory = new WebAssembly.Memory({ initial: 32, maximum: 64, shared: true });
  const sent = [];
  let serviced = 0;
  const module = worker({ send: message => sent.push(message),
    get: () => ({ memory, serviceDeferred: () => ++serviced }) });
  const dispatch = (operation, address, length) => module.bindings["env.dolly_html_dispatch"](operation, BigInt(address), BigInt(length));
  const bytes = new Uint8Array(memory.buffer);
  const document = new TextEncoder().encode("<p>é</p>");
  bytes.set(document, 4096);

  assert.equal(dispatch(DOLLY_HTML_OPEN, memory.buffer.byteLength - 4, 8), -E.EINVAL, "a span past the memory");
  assert.equal(dispatch(DOLLY_HTML_OPEN, 4096, 0), -E.EINVAL);
  assert.equal(dispatch(DOLLY_HTML_OPEN, 0, DOLLY_HTML_DOCUMENT_MAX + 1), -E.EINVAL);
  bytes[8192] = 0xff;
  assert.equal(dispatch(DOLLY_HTML_OPEN, 8192, 1), -E.EILSEQ);
  assert.equal(dispatch(DOLLY_HTML_ANSWER, 0, 16), -E.EBADF, "no popup");
  assert.equal(sent.length, 0);

  assert.equal(dispatch(DOLLY_HTML_OPEN, 4096, document.length), 0);
  assert.deepEqual(sent.at(-1), { type: "html-show", popup: 1, document: "<p>é</p>" });
  assert.equal(dispatch(DOLLY_HTML_OPEN, 4096, document.length), -E.EBUSY, "one popup at a time");
  assert.equal(dispatch(DOLLY_HTML_ANSWER, 0, 16), -E.EAGAIN);
  module.messages["html-answer"]({ popup: 2, fields: "stale=1" });
  module.messages["html-answer"]({ popup: 1, fields: 7 });
  assert.equal(dispatch(DOLLY_HTML_ANSWER, 0, 16), -E.EAGAIN, "a stale or malformed answer is not the user's");
  module.messages["html-answer"]({ popup: 1, fields: "a=%C3%A9&b=2" });
  assert.equal(serviced, 1, "the waiting program resumes at once");
  assert.equal(dispatch(DOLLY_HTML_ANSWER, 0, 4), -E.EMSGSIZE);
  assert.equal(dispatch(DOLLY_HTML_ANSWER, 0, 16), -E.EBADF, "an answer is given once");

  assert.equal(dispatch(DOLLY_HTML_OPEN, 4096, document.length), 0);
  module.messages["html-answer"]({ popup: 2, fields: "x".repeat(DOLLY_HTML_FIELDS_MAX + 1) });
  assert.equal(dispatch(DOLLY_HTML_ANSWER, 0, DOLLY_HTML_FIELDS_MAX * 2), -E.EMSGSIZE);
  assert.equal(dispatch(DOLLY_HTML_OPEN, 4096, document.length), 0);
  module.messages["html-answer"]({ popup: 3, fields: "a=%C3%A9&b=2" });
  assert.equal(dispatch(DOLLY_HTML_ANSWER, 64, 16), 12);
  assert.equal(new TextDecoder().decode(bytes.slice(64, 76)), "a=%C3%A9&b=2");

  assert.equal(dispatch(DOLLY_HTML_OPEN, 4096, document.length), 0);
  assert.equal(dispatch(DOLLY_HTML_CLOSE, 0, 1), -E.EINVAL);
  assert.equal(dispatch(DOLLY_HTML_CLOSE, 0, 0), 0);
  assert.deepEqual(sent.at(-1), { type: "html-close", popup: 4 });
  assert.equal(dispatch(DOLLY_HTML_ANSWER, 0, 16), -E.EBADF);

  // The user's close is ECANCELED, and the next popup waits two seconds.
  assert.equal(dispatch(DOLLY_HTML_OPEN, 4096, document.length), 0);
  module.messages["html-answer"]({ popup: 5, fields: null });
  assert.equal(dispatch(DOLLY_HTML_ANSWER, 0, 16), -E.ECANCELED);
  assert.equal(dispatch(DOLLY_HTML_OPEN, 4096, document.length), -E.ECANCELED);
  assert.equal(sent.filter(({ type }) => type === "html-show").length, 5);
});
