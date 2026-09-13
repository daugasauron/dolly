# Avoid dumping complete recipe graphs on identity assertion failures

- STATUS: CLOSED
- PRIORITY: 250
- TAGS: audit,testing,build

## Evidence and resolution

Changing the Pi producer boundary invalidated a provider identity assertion in
`dollyfile-modules.test.mjs`. Comparing the full graph-bearing objects through
`assert.equal` took 479.3 s before the test worker was killed with SIGKILL.
The same failing assertion, expressed as a boolean identity check with its short
image/requirement message, now reports the failure in a 55.9 ms isolated run
(the test itself took 20.4 ms). The identity condition is unchanged; only failure
diagnostics stop inspecting the large graph objects.
