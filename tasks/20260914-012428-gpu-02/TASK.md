# Remove the default 64 MiB HTTP response size limit

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: network,usability

Remove the unconditional 64 MiB cumulative HTTP response-body ceiling so ordinary
downloads, including model files, can stream through the existing broker.
Retain optional finite quotas explicitly imposed by a restricted embedding.

This is the byte limit discussed in the [GPU investigation](../20260914-003437-gpu-01/ABI.md).
The separate request-count quota and upload-file ceiling are different limits.

## Evidence

At source baseline `1a57397`, `src/http-policy.mjs` sets `maxResponseBytes` to
`64 * 1024 * 1024` for unrestricted requests and as the per-rule default.
`HttpTransfer.run` in `src/http-broker.mjs` counts response bytes and fails with
`E2BIG` when the policy limit is crossed. Delivery already uses bounded 64 KiB
mailbox chunks and waits for consumption; total response size is independent of
chunk capacity.

The policy normalizer currently requires positive finite integer limits, and
inherited policies intersect byte limits. Simply setting `Infinity` or removing
the comparison would not preserve a coherent optional-quota policy.

## Done when

- Ordinary HTTP downloads have no fixed 64 MiB total-response ceiling.
- Explicit finite response quotas remain enforceable, including inherited
  restrictions and exact bootstrap-source bounds.
- Bounded chunks, admission, outstanding transfers, backpressure, cancellation,
  checked counters and stream errors retain their behavior. The broker must not
  accumulate the whole response in a new host buffer.
- A real browser downloads more than 64 MiB through an ordinary in-sandbox tool
  and verifies the resulting bytes in the shared Wasm filesystem.
- A smaller explicit quota still rejects an oversized response; cancellation
  during streaming retires the transfer without leaking admission slots.
- Update affected policy documentation and focused behavior checks. No image
  rebuild or model-specific download service is needed for this policy change.

Large-file memory requirements and the existing HTTP deadline remain separate
constraints; removing a response-byte default does not promise unlimited storage.

## Completed 2026-09-14

Omitted/null response quotas now mean no total byte ceiling. Finite rules,
inherited restrictions and pinned bootstrap bounds still apply. Streaming keeps
the same bounded mailboxes, backpressure and deadline; byte addition checks
JavaScript's exact integer range before updating the counter.

`node --test test/http-policy.test.mjs test/http-broker.test.mjs` passed 27 checks.
`node test/http-stream-browser.mjs` passed in real Chrome: in-sandbox curl saved
68,157,457 bytes and sha256sum verified
`9351ec58b4992a096e0bd0d073fa651aee133083ca6093828c550d011269c791`.
A 1,024-byte quota rejected the response, cancellation retired the transfer,
and a subsequent request succeeded. Evidence: `build/http-limit-browser.log`.

The game also exposed a separate 1 MiB process upload bottleneck. Operation 83
now stages large bodies through bounded sequential packets in kernel Wasm
memory. Browser authority is unchanged. The same browser check compiled a C
client inside Dolly, verified a 3,145,745-byte binary round trip, rejected invalid
staging offsets, and confirmed the browser rejects a 9 MiB upload. The 8 MiB
browser request bound and smaller explicit request quotas remain intentional.

Subsequent Astra `xhigh` runs reproduced a separate 120-second timeout during
conversation compaction. The broker and development Codex relay now default to
600 seconds; finite explicit policy deadlines and cancellation still apply.
