# Tests of wording, and the artifact test against the build: the investigation

Read on `work/rust` (`integrate/round-1013`, head `0f1e60ed`, 2026-10-14 04:12–04:20 JST; history shared with `main`). Nothing was built or run; every number comes from `git`, `grep` and the files. Line numbers are of this tree unless a commit is named. Counts give the `grep` that produced them so they can be repeated. No verdict.

## Summary (findings, no advice)

1. The rule is one commit old in wording: `67c647e7` (2026-09-13, author kallur, no body) added both sentences to `AGENTS.md:106-107` exactly as they read today and in the same commit deleted 65 lines of `test/dolly.test.mjs` that matched harness, launcher, compiler and Janis source text, a theme colour and Pi's prompt prose. Its reasoning is in the task it opened, `codex-07`: "Source spelling often cannot establish runtime behavior and can make harmless refactoring expensive. Structural assertions enforcing the browser boundary have a distinct purpose."
2. What went under it: `cc90a525` (same night) removed 1,160 lines from `test/dolly.artifacts.mjs` and moved five HTTP-policy tests and a hash test into the source suite; `a7241b13` (09-14) 182 lines of `dollyfile-modules.test.mjs`; the takeover audit's `audit-58` (09-30, closed 10-05) a source hash, a Studio notice and C-slicing; `b3cff2ab`/`42daf7ac` (10-05, 10-13) three browser sentences. One test was kept against the rule with a recorded reason (`preparation-cache.test.mjs`, `audit-58`).
3. Group (a), today: 162 `assert.rejects`/`assert.throws` calls in 25 of the 41 `test/*.test.mjs` files; about 121 carry a message regex, 28 accept any throw, 13 match a `code`, `name`, class or function. In `demos/*/test/*.test.mjs`: 61 calls, 24 with a regex. The audit's "102" has no stated method and is not reproduced by any pattern tried.
4. Group (b): 45 matches on terminal text in the 38 core browser tests; 41 of them match a marker the test's own fixture program prints (`PRESSED-0`, `DOLLY-GRID-1`). The three page sentences the audit named are gone (`42daf7ac`). The larger text surface is shell-side: 163 `grep -q` in browser tests, a few of them whole sentences (`host-modules-browser.mjs:164`).
5. Group (c): three assertions read source text today: `pages-publication.test.mjs:11-12` (workflow YAML) and `dolly.artifacts.mjs:208` (`src/kernel-plugin.mjs` must not contain `fetch(`, `eval(`). Group (d): the help tests check status, emptiness, 80 columns and `man X` = `X --help` byte for byte, not wording; two `grep -q '^usage: NAME'`.
6. Of a sample of 89 regexes in nine source-suite files: about 48 (54%) are the only way the test tells one refusal from another and the thrown error carries no code or errno today (plain `Error` with text in `system-snapshot-format.mjs`, `site-release.mjs`, `export-cloudflare-pages.mjs`, `static-asset.mjs`, `session-file.mjs`, `dollyfile-view.mjs:14`); about 32 (36%) are themselves the behaviour (a line number, a declaration to add, `nena enable audio`, a count, a type); about 6 (7%) are the test's own thrown string; none reads source. The HTTP refusals are the exception: `HttpError.errno` exists (`host/http/policy.mjs:4-6,214-240`), and `test/http-broker.test.mjs:79-194` already asserts errno words, while `http-policy.test.mjs` matches `/denied/`, `/quota/`.
7. Where a message is asserted for a recorded reason: `adce6385`'s task ("Messages (one line, with the declaration to add)"), `b3cff2ab` ("A refused program exits 126 with one line on its own stderr that names the cause"), `host-modules.test.mjs:87` ("the refusal names the command that enables the module"), `session-file.test.mjs:81` ("refused by a message naming the version it belongs to"), `cloudflare-pages.test.mjs:191` ("the versions are named and none is dropped").
8. `test/dolly.artifacts.mjs` is 399 lines. By block, about 40 lines assert a fact `scripts/build.sh` or the snapshot builder asserts on the same bytes (`validate-runtime` :300, `validate-browser` :303, `validate-process` :240, `bind-process-layout` :96, `build-system-snapshot.mjs:97-120,144-149`). The export-set exactness (140-151), manifest ownership (192), the import union and blacklist (368-386), the seed contents (89-103), the libc++ symbol check (107-123) and the per-image retention rules (221-294) exist only there. The audit's "250 of 401" is not reproduced; `spawnSync` (line 6) is indeed unused.
9. The parity test runs 194 syntax cases (not 232) through both parsers and compares accept/reject only (`dollyfile-parser.test.mjs:44-53`, `fixtures/dollyfile-syntax.mjs:19`); the graph tests' 17 regexes are the only place that says which rule and which line refused, and the lint returns the sentence as its value (`scripts/lint-dollyfiles.mjs:31-35`).
10. Cost observed in history: of eight asserted messages traced with `git log -S`, six were born with their test and never changed; one test edit followed a reworded sentence (`1723a563`, 10-06, after `b3cff2ab`); one later removal (`42daf7ac`). Whether any wording assertion ever caught a regression is not recorded anywhere.

---

## 1. History

### 1.1 Before the rule

`AGENTS.md` at `67c647e7^` already said "Verify changes in a real browser. Tests should prove shared in-Wasm state, module reload behavior, denied host access, and exact ABI compatibility." (today `:102-103`) and "Make browser capabilities explicit and enforce their exact allowlist in tests" (`:98-99`). `test/dolly.test.mjs` at `ff633f7` held "593 `assert.match`/`assert.doesNotMatch` calls" (`tasks/20260913-092832-codex-07/TASK.md:9-11`).

### 1.2 The rule enters: `67c647e7`, 2026-09-13 20:47 JST

"Track core audit in tatr and remove wording-only test checks" (author kallur, no body, no co-author). The diff to `AGENTS.md` adds, under Development rules, exactly today's two sentences:

> "- Do not test implementation spelling, user-facing prose or the wording of other tests. Keep explicit ABI/capability checks and mocks that exercise real behavior."

`git log -S'implementation spelling' -- AGENTS.md` and `-S'wording of other tests'` each find this one commit: the wording never changed. The same commit removed 65 lines from `test/dolly.test.mjs`; examples of what went (`git show 67c647e7 -- test/dolly.test.mjs`):

- `assert.match(harness, /isMode\("zig-sdk"\)/)`, `assert.match(launcher, /DOLLY_BROWSER_MODE=cpp/)`, `assert.match(compiler, /"-vectorize-loops"/)` (a test reading the harness, the launcher script and `src/compiler.cpp`);
- `assert.match(runtime, /globalThis\.__janisCleanup = \(\) =>/)` (Janis cleanup spelled in source);
- `assert.equal(theme.vars.yellow, "#f2d45c")`;
- `assert.match(browserProof, /Pi's ! command executing ls through \/bin\/slop/)` (the wording of another test);
- `assert.match(extension, /Bash is not installed/)`, `assert.match(systemPrompt, /cannot disable browser CORS/)` (user-facing prose).

It also opened seventeen tasks; the one for tests is `codex-07`, "Delete behavior-related source assertions and keep useful coverage". Its words (the owner's agent, same day):

> "Source spelling often cannot establish runtime behavior and can make harmless refactoring expensive. Structural assertions enforcing the browser boundary have a distinct purpose." (`:9-11`)
> "Mocks alone are not a deletion criterion. The browser startup EventEmitter and timer tests exercise real timeout/cleanup logic cheaply; seed packaging tests compare actual emitted files; exact Wasm imports/exports enforce the boundary." (`:24-28`)
> Done when: "Retain structural checks for exact imports, forbidden host capabilities, and other deliberate boundary rules." (`:34`)

### 1.3 The large removal: `cc90a525`, 2026-09-13 22:58

"Remove source-spelling tests and keep behavioral and ABI checks": `test/dolly.artifacts.mjs` −1,160 lines (6 files: 211 insertions, 1,166 deletions). Examples of the removed assertions (`git show cc90a525 -- test/dolly.artifacts.mjs`):

- `assert.match(runtimeSource, /DOLLY_DOWNLOAD_MAX_BYTES = 64 \* 1024 \* 1024/)` and the same number matched in `runtime-worker.mjs` and `browser.mjs`;
- `assert.match(source, /open\("\/etc\/dolly\/image\.manifest", O_RDONLY\)/)`, `assert.doesNotMatch(source, /static const char \*const system_files/)`;
- `assert.match(browser, /event\.code === "KeyS"/)`, `assert.match(store, /indexedDB\.open/)`, `assert.match(store, /CompressionStream\("gzip"\)/)`;
- `assert.doesNotMatch(frontend, /ghostty-web|terminal\.write|onData/)`, `assert.match(frontend, /class FramebufferPresenter/)`;
- `assert.match(packaging, /--export=__stack_pointer/)` (CMake text; the task: "Stack bounds are checked in the emitted Wasm rather than in CMake command spelling");
- the whole test "the main artifact is a WebAssembly binary" (magic bytes).

Kept, per the task's completion: "exact Wasm types/import allowlists, real seed contents, registry/source pins, image identity and generated-loader host-capability exclusions" (`codex-07:38-42`). Five HTTP-policy tests and the hashing known-answer test moved into the source suite (`test/http-policy.test.mjs` +142, `test/janis-hash.test.mjs` +17). "The main benefit of these deletions is reduced maintenance, not a claimed large runtime gain from removing regex assertions." (`:52-53`)

`a7241b13` (09-14 01:04) "Remove remaining module-suite source-spelling checks": `test/dollyfile-modules.test.mjs` −182 ("helper names, startup text, compiler argument spelling, and script cleanup syntax", `codex-07:55-58`).

### 1.4 The takeover audit, 2026-09-30: `audit-58`

"Tests assert on source text, prose and repository contents" (closed 10-05). It listed: C slicing by string markers (`terminal-ring.test.mjs`, `preparation-cache.test.mjs`, `pages-publication.test.mjs:11-17`), a golden hash of source (`bhop.test.mjs`), repository-content assertions (`dollyfile-modules.test.mjs`), "prose assertions (`browser-harness.mjs:6052-6056` … `studio.test.mjs:15`, `dolly.artifacts.mjs:31`)". What followed: `53546fe2` (10-01) "Stop asserting the Studio notice's wording" (−1 line, `/Dollyfile Studio/`); `c8aae6ea` (10-01) "Drop the bhop source-hash test … It froze the spelling of three sources; the compiled Airtime check tests the physics they implement"; the ring moved into `host/display/input-ring.c` so the test needs no markers. One was kept with a reason: "`test/preparation-cache.test.mjs` stays as it is: it checks a behavior (a preparation key ignores the checkout location …) and cuts each script at its first statement after the key assignment only to avoid the fetch and compile that follow. The alternatives are a print-key mode in every prepare script, which is a test hook in production scripts, or a Git checkout fixture per script; neither is worth its lines for this one check." (`audit-58:45-51`). `pages-publication.test.mjs:11-12` was not changed and is still there.

### 1.5 The messages of October: asserted, reworded, followed, removed

- `b3cff2ab` (10-05) "Report a refused or failed process on its own stderr; malformed calls return errnos" reworded the kernel's refusal (`host/requirements.mjs:58-59`, today: `host module X is not enabled: nena enable NAME` / `host module X is not declared by this image (REQUIRES HOST)`). Its test diff replaced three `assert.match(await text(), /http@1 is unsupported/)` with a helper: "A refused program exits 126 with one line on its own stderr that names the cause" — status 126, empty stdout, exactly one stderr line, `grep -q 'http@1'` (`test/host-modules-browser.mjs`, the diff of `b3cff2ab`). So the author of the reword already chose: status plus one name, not the sentence.
- `ce74d524` (10-05) added `/Required host module gpu@0 is unavailable/` to `host-compute-browser.mjs`.
- `1723a563` (10-06) "Expect the refusal line the kernel now prints in the minimal image test": `-/http@0 is unsupported/` `+/host module http@0 is not declared by this image/`. This is the one found instance of a test edited because a sentence changed.
- `adce6385` (10-06) "Refuse to seal an image whose ENTRY names what the image does not hold" added the engine's five messages (`src/dollyfile.c:2060-2094`), the lint's (`scripts/lint-dollyfiles.mjs:31-35`), nine regexes in `dollyfile-graph.test.mjs:77-84` and the browser sentence in `custom-session-browser.mjs`. Its task records why the message has that shape: "Messages (one line, with the declaration to add)" and "Studio's `dollyfile-lint` reads one file and cannot see the base, so it is unchanged: there the build's message is the check." (`tasks/20261006-103256-entry-missing/TASK.md`, Fix section). The bug it fixed was "a green build followed by a screen that says nothing".
- `42daf7ac` (10-13 12:06) "Three core browser tests check a status or a name where they checked a sentence": `default-browser.mjs` keeps `126` with the comment "126 is the refusal: had the program run, its failed request would be status 1" and drops the sentence; `custom-session-browser.mjs` keeps `await rejected(page)` and drops `/ENTRY needs \/usr\/bin\/session-hello, … add EXPORTS TOOL session-hello/`; `host-compute-browser.mjs:77` becomes `/gpu@0/`. "The three pass in Chrome 151 and Firefox 155 on the images of v0.1.2."
- `6a102425` (10-13 15:21): "Both failed on the round's branch for the tests' own reasons: nena's sentence replaced the old wording" (its diff touches only `demos/wine/test/wine-browser.mjs`; the speech test's string `the browser refused the microphone` has had no commit since `8a7fd584`, 10-10, so where that failure was fixed is not in this commit).
- `741e4c4b` (10-14 03:42) "Tests: a comment's wording in the process test" (a comment, not an assertion).

### 1.6 The audit of 2026-10-13 and the owner's words

`hygiene.md` item 10: "`test/dolly.artifacts.mjs` (401 lines) re-asserts the build … lines 36-74 restate WAT type strings; 314-321 compare the generator's output with the same function that produced it; line 6 imports `spawnSync` unused. Unique and worth keeping: export set (140-151), import ownership (186-202), import blacklist (385-388). Do: cut to those three." Item 11: "102 `assert.rejects/throws` message regexes in `test/` … page prose in `custom-session-browser.mjs:222`, `default-browser.mjs:46`, `host-compute-browser.mjs:77`; `pages-publication.test.mjs:11-12` regexes over the workflow YAML; `dolly.artifacts.mjs:207-208` regexes over `src/kernel-plugin.mjs` source. Do: `{ code }` matchers and status checks." Item 15: "Hard constraints with no test … 'no host filesystem or subprocess' only by import names (`dolly.artifacts.mjs:385-388`); module reload none; forced Worker termination preserving kernel and shell none". Row 29 of the audit's list: "Tests of wording, and `test/dolly.artifacts.mjs` re-asserting the build | 102 message patterns; 250 of 401 lines | cheap".

The owner, 2026-10-13 (`tasks/20261013-142800-direction/TASK.md:32-36`): "The audit is too blunt. Some of the points are good but some are garbage. Both SLOP and RUN are needed, see the history, this is hard earned wisdom. Create tasks to investigate each of your points more in detail without deciding if they should go or not". No owner statement on tests of wording specifically was found; the rule's commit has no body; `codex-07` is the nearest record of intent (§1.2).

### 1.7 Where the line between prose and behaviour was drawn before

- `codex-07`: "exact Wasm imports/exports enforce the boundary"; "Janis scratch cleanup still needs observed success/error cleanup evidence if it is to be claimed as covered; matching a function call never established it."
- `b3cff2ab`: the cause's name, the status and the line count are asserted; the sentence is not.
- `42daf7ac`: a status that differs from the program's own status is the proof; the page's sentence is not.
- `entry-missing`: the message's content ("add EXPORTS TOOL greet") was the deliverable ("naming the ENTRY line and the missing path").
- `docs/http.md:39-41` (per the credential investigation): errors carry an errno only, never a URL or header; `test/http-broker.test.mjs:136` asserts a response `authorization` header never reaches the records, as data, not as a message regex.
- `audit-58`'s kept slicing: behaviour checked through text when the alternative is a test hook in production code.

---

## 2. The enumeration

Suites at `0f1e60ed`: 41 `test/*.test.mjs` (4,420 lines); `test/dolly.artifacts.mjs` 399 and `test/zig-sdk.artifacts.mjs` 57; 38 `test/*-browser.mjs` (4,756); 31 `demos/*/test/*.test.mjs` (1,627); 32 `demos/*/test/*-browser.mjs` (4,700). `package.json:14,23`: `test:source` runs `test/*.test.mjs` and `demos/**/*.test.mjs`; `test:artifacts` the `*.artifacts.mjs`.

### (a) `assert.rejects` / `assert.throws` with a message

Method: `grep -nE 'assert\.(rejects|throws)\(' test/*.test.mjs` → 162 calls in 25 files. `grep -nE 'assert\.(rejects|throws)\(.*,\s*(/|"|`|'"'"'|\{ *message)'` → 107 with a matcher on the same line; 38 open a multi-line call. Reading every call with `-A2` and sorting by hand: about 121 with a regex literal (116 on the line, 5 on a continuation line: `http-policy.test.mjs:50-57,59,115,156-160`, `session-file.test.mjs:38-41`); 28 with no matcher (any throw passes: `host-modules.test.mjs:72,75,78,80,81`, `pages-publication.test.mjs:22-26`, `session-file.test.mjs:65,80,83,115`, `upload-transport.test.mjs:42,44`, `image-build-service.test.mjs:35,145,147`, …); 13 with `{ code }`, `{ name }`, a class or a function (`build-identity:28`, `snapshot-packs:105`, `site-release:28`, `session-recovery:36,37,53,54,59,60`, `static-asset:47-48`, `verified-fetch:30`, `http-policy:18,223`).

Files with the most (calls / with a regex): `dollyfile-graph.test.mjs` 19/17, `cloudflare-pages.test.mjs` 17/17, `system-snapshot-format.test.mjs` 16/13, `site-release.test.mjs` 12/10, `session-file.test.mjs` 11/6, `host-modules.test.mjs` 11/6, `http-policy.test.mjs` 10/8, `image-build-service.test.mjs` 9/6, `process-abi.test.mjs` 8/8, `snapshot-packs.test.mjs` 7/6.

Representative:
- `test/dollyfile-graph.test.mjs:42` `/Dollyfile:5: invalid SOURCE/`; `:79` `/add EXPORTS TOOL game/`; `:82` `/\/workspace\/game is in scratch/`; `:234` `/pkg needs REQUIRES HOST threads@0/`; `:133` `/stale recipe pin/`.
- `test/cloudflare-pages.test.mjs:195-196` `/20,000-file limit exceeded by 1: v0\.1\.0 has 4 files, v0\.2\.0 has 10000 files, v0\.3\.0 has 9993 files/`; `:61-62` `/100 header rules exceeded: v0\.1\.0 need 101/`; `:168` `/src\/browser\.mjs differs from deployment\.sha256/`.
- `test/system-snapshot-format.test.mjs:73-76` `/truncated/`, `/trailing/`, `/header/`; `:30-32` `/not retained/`, `/symlink loop/`.
- `test/site-release.test.mjs:95,98,101` `/file manifest mismatch/` three times (changed, extra, missing file); `:63,65` `/ENOENT/`.
- `test/host-modules.test.mjs:84-88` `/http@1 is not declared/`, `/http@0 has a different layout/`, `/nena enable audio/`.
- `test/process-abi.test.mjs:44-47` `/import dolly_process_0.call must be/`, `/process memory is outside/`; `:105` `/expected func\(i64\).*got func\(i32\)/`.
- `test/http-policy.test.mjs:187` `/quota/`; `:203` `/policy denied/`; `test/image-build-service.test.mjs:25` `/size limit/`.
- `test/session-file.test.mjs:82` `/9\.8\.7/` (the version named); `:68` `/checksum/`.
- `test/dolly.artifacts.mjs:393-398` `/missing or changed type/`, `/count changed/`, `/duplicate/`.

Demos: `grep -nE 'assert\.(rejects|throws)\('` over `demos/*/test/*.test.mjs` → 61 calls in 17 files: 24 with a regex, 26 bare, 10 with `{ code }`/`{ name }` (`janis-compatibility.test.mjs:28-68` `ENOSYS`, `ERR_METHOD_NOT_IMPLEMENTED`; `response.test.mjs:39-40`), 1 function (`0ad-relay.test.mjs:14` `error.status`). Most: `rts-input.test.mjs` 16/10 (`/Invalid game response/`, `/Truncated/`, `/errno 125/`, `/not a PNG/`), `classicube-agent.test.mjs` 8/0, `rts-launcher.test.mjs` 5/5 (`/models.json/` ×5), `pi-tools.test.mjs` 3/3 (`/^Error: partial\n\nCommand timed out after 0.3 seconds$/`, a tool result Pi's model reads).

The audit's "102": no method is given; neither 107 (same-line matcher) nor 121 (regexes) nor 162 (calls) reproduces it.

### (b) Browser tests matching printed text

Method: `grep -nE 'assert\.match\(await (text|session\.text|page\.|.*textContent)|waitForText\(|assert\.match\(.*text\(\)|textContent\(\),'` → 45 in `test/*-browser.mjs` (`buttons-browser` 10, `terminal-browser` 9, `process-browser` 7, nine files with 1), 14 in `demos/*/test/*-browser.mjs` (`local-llm` 4, `studio` 3, `rts` 3, `speech` 2, `closed-source-agent` 1, `bhop` 1).

Of the 45: 41 match a marker the test's own fixture program prints (`/PRESSED-0/`, `/^PASTE-REFUSED-1$/m`, `/DOLLY-GRID-1/`, `/TREE-READY\s*$/`, `/MICROPHONE_DENIED/`, `/CURSORS-SHOWN/`, `/BUTTONS_REFUSALS_OK/`). The rest: `boundary-browser.mjs:60` `/FATAL\n.*boundary probe/` (the page's log word plus the test's own error string); `custom-session-browser.mjs:62` (`#status` non-empty, no words); `shell-env-browser.mjs:21` `/SHELL=unset\./` (printed by the test's own command); `pager-browser.mjs:40` (a variable). Demos: `speech-browser.mjs:48,54` `/"speech-to-text" listens again/`, `/the browser refused the microphone/` (sentences from `demos/speech/speech-to-text.c`); `rts-browser.mjs:141,155,210` `/600 seconds/`, `/rts-vision-fixture · xhigh/`, `/RTS replay reached EOF at game frame [1-9]\d*/`; `studio-browser.mjs:122` `/loading precompiled userspace snapshot/` (the page's bootstrap log), `:128` `/error: BUILD-COMPILER-ERROR/` (the compiler's line with the test's marker); `local-llm-browser.mjs:162-163` `${model} · [\d.]+ GB GPU memory · in use` (the menu's row); `bhop-browser.mjs:109` `/bhop: ticks=\d+ jumps=3 falls=0 pad=0/` (a status line parsed for counts).

Page prose: `grep -nE 'getByText\(|"text='` → 0. `nena-browser.mjs:226-227` waits for `/nena enable gpu/` in `#session-status` and matches `/audio@0.*nena enable gpu/` in what the page said. `gpu-indicator-browser.mjs:54,60,67` compares the indicator to `{ gpu: "unavailable", link: enableSteps }` (a state word and a link, not a sentence).

Text checked inside the sandbox by the shell: `grep -nE 'grep -q'` over both browser suites → 163 (`amy-browser` 36, `shell-browser` 15, `mojo-browser` 15, `custom-session-browser` 13, `process-browser` 11, `pi-browser` 9, `tmux-browser` 8, `cpp-browser` 6). Most grep for a marker or a file's content; the sentence-shaped ones: `host-modules-browser.mjs:164` `grep -q 'host module input@0 is not declared by this image (REQUIRES HOST)' /tmp/err` (the whole sentence); `nena-browser.mjs:103,126` `grep -q 'nena enable ${module}'`; `:168` `grep -q 'threads@0'`; `tmux-browser.mjs:160` `grep -q 'needs pty@0'`; `man-browser.mjs:29` `grep -q no-such-command /tmp/err`; `default-browser.mjs:30` `grep -q '^usage: download'`; `amy-browser.mjs:297` `grep -q '^usage: session-recover'`.

The audit's cited lines today: `custom-session-browser.mjs:222` is `await context.close()` (the sentence left in `42daf7ac`); `default-browser.mjs:46` is `assert.equal(await session.submit("/tmp/http"), 126)`; `host-compute-browser.mjs:77` is `/gpu@0/`; `pages-publication.test.mjs:11-12` and `dolly.artifacts.mjs:207-208` are as cited.

### (c) Tests that read source, workflow, recipe or README text

Method: `grep -nE 'readFile\(new URL\("\.\./(src|scripts|host|\.github|README|docs|modules|Dollyfile|include|toolchain|abi)'` over `test/*.test.mjs`, `test/*.artifacts.mjs`, `demos/*/test/*.test.mjs`, fixtures excluded → 4 hits.

- `test/pages-publication.test.mjs:10-12`: reads `.github/workflows/pages.yml`; `assert.match(workflow, /artifact_sha256:\n[^\n]*\n\s+required: true/)` and the `run: bash _source/scripts/verify-sha256.sh "${EXPECTED_SHA256}" dolly-pages.tar.gz` line. Two assertions over YAML text; the rest of the file (`:22-26`) runs `verify-sha256.sh` on real files.
- `test/dolly.artifacts.mjs:207-208`: reads `src/kernel-plugin.mjs`; `assert.doesNotMatch(plugin, /\bfetch\s*\(|XMLHttpRequest|\b(?:eval|Function)\s*\(/)`. One assertion.
- `test/dolly.artifacts.mjs:57`: reads `include/dolly/process.h` for its bytes' digest (not text matching).
- `demos/bhop/test/bhop.test.mjs:10-25`: reads the recipe's embedded C and compiles and runs it; the regexes at `:22-25` match the compiled check's own output.

Related: `test/dollyfile-graph.test.mjs` (since `9d9064b3`) derives expectations from the `Dollyfile`'s start-up text with `/amy install (\S+)/g`; `test/preparation-cache.test.mjs:26` slices prepare scripts (kept with a reason, §1.4). No test matches a README, a recipe comment or another test's text today.

### (d) `--help`, manual pages, usage

`test/commands.test.mjs:171-190`: for 30 of Dolly's own commands, `--help` exits 0, stdout non-empty, stderr empty; `man` with wrong arguments exits 2 with empty stdout and non-empty stderr; `man no-such-command` exits 1. No words matched. `test/man-browser.mjs:10-36`: every command in `/bin` and `/usr/bin` has a page; every own command answers `--help` with non-empty output; `man foreground` and `foreground --help` are identical (`cmp`), likewise `help` and after `amy install git`; `help` fits 80 columns (`! grep -q '.\{81\}'`); `man grep` equals the file; `grep -q no-such-command /tmp/err`. `default-browser.mjs:30` and `amy-browser.mjs:297` check the first line's form `usage: NAME`. `studio-browser.mjs:95` and `rts-browser.mjs:175` check the status of `--help` only.

---

## 3. What the wording stands for

Sample: the regexes of nine source-suite files, 89 of about 121: `dollyfile-graph` 17, `cloudflare-pages` 17, `system-snapshot-format` 13, `site-release` 10, `process-abi` 8, `http-policy` 8, `host-modules` 6, `session-file` 6, `static-asset` 4. Each read with its source.

**(i) The message is the only way to tell one refusal from another: about 48 of 89 (54%).** `system-snapshot-format.test.mjs:30-32,41,56,73-76,99-108` (thirteen corruptions of a snapshot; `scripts/system-snapshot-format.mjs` has 12 `throw new Error(text)` and no code); `site-release.test.mjs:59,61,95-105,189` (`scripts/site-release.mjs`: 25 plain throws); `cloudflare-pages.test.mjs:31,54-56,59,164,171,179-189` (`export-cloudflare-pages.mjs`: 13 plain throws); `static-asset.test.mjs:39-45` (`src/static-asset.mjs`: 6); `session-file.test.mjs:68,70,74,84` (`src/session-file.mjs`: 8); `dollyfile-graph.test.mjs:38-39,133,197` (`scripts/dollyfile-graph.mjs:15`, `recipe-files.mjs:15`). What exists in the code today other than the text: nothing. `grep -rnE 'Object\.assign\(new (Error|TypeError)|error\.code = |\.errno = |code: "' src scripts host` finds only the host providers' `errno` (`host/audio/provider.mjs:4`, `microphone`, `buttons`, `nena/nena.mjs:19`, `gpu/worker.mjs:6`) and `HttpError` (`host/http/policy.mjs:4-6`). Two sub-cases: `site-release.test.mjs:63,65` and `cloudflare-pages.test.mjs:181,187` match `/ENOENT/` in a message where the underlying fs error carries `code: "ENOENT"` (used that way at `site-release.test.mjs:28`); and the HTTP tests: `http-policy.test.mjs:50-57,115,151-160,187,203,215` and `image-build-service.test.mjs:23-26,59-63` match `/denied/`, `/quota/`, `/size limit/` on `HttpError`s that carry `EACCES`, `EDQUOT`, `E2BIG` (`policy.mjs:214,219,228,240`); `test/http-broker.test.mjs:79-82,114,151,155,194` already asserts the errno word. `/denied/` matches both `Dolly HTTP policy denied the request` (`policy.mjs:228`) and `Browser-local service request denied` (`local-services.mjs:20`); both are `EACCES`.

**(ii) The message is itself the behaviour: about 32 of 89 (36%).** A line number (`dollyfile-graph.test.mjs:40-43` `Dollyfile:5: …`; `upstreams.test.mjs:30` `Dollyfile-example:7:`), the declaration to add (`:77-84` `add EXPORTS TOOL game or FILE /usr/bin/game`; `:234` `pkg needs REQUIRES HOST threads@0`; `host-modules.test.mjs:56`), the module and the command (`host-modules.test.mjs:84-88`; comment at `:87`), a count or a name the operator acts on (`cloudflare-pages.test.mjs:61-62,168-169,189,195-196`; comment `:191`), a type (`process-abi.test.mjs:105` `expected func(i64)…got func(i32)`), a version (`session-file.test.mjs:81-82`), a status (`session-transport.test.mjs:118` `capture failed with status 5`). In `process-abi.test.mjs:44-52,71-74` two validators, `src/process-abi.mjs` (the page's) and `scripts/dolly-abi.mjs` (the build's), are compared through the same regex: "build and browser validators agree on X" has no other common output.

**(iii) Incidental prose beside a proving assertion: about 6 of 89 (7%) are the test's own string** thrown through the code under test (`session-file.test.mjs:38-41` `/producer stopped/`; `session-transport.test.mjs:109,131`; `snapshot-reproducibility.test.mjs:38-39`). A further ~15 have a state assertion beside the regex (`pinned-checkout.test.mjs:37-38` the file unchanged; `site-release.test.mjs:59-60` `keep` intact; `verified-fetch.test.mjs:46-48` the cache untouched; `cloudflare-pages.test.mjs:169-170` the mirror unchanged): there the state proves no damage and the regex proves which refusal; neither proves the other.

**(iv) Reads source text instead of exercising it: 0 of the 89; 3 in the suites** (§2c).

Of the 28 bare `rejects`/`throws`, the test accepts any exception, including one from a bug before the check (`host-modules.test.mjs:75-81` on malformed records; `session-file.test.mjs:65,80,115`; `pages-publication.test.mjs:22-26`).

Browser group (b): the 41 markers are protocol strings the test's own program prints (class ii by construction: the test wrote both sides). The 163 `grep -q`: by sample of the sentence-shaped ones, `host-modules-browser.mjs:164` is the one whole kernel sentence still asserted; the others assert a name (`gpu@0`, `pty@0`, `nena enable audio`, `usage: download`).

---

## 4. `test/dolly.artifacts.mjs` against the build

Build-side checks, for reference: `scripts/build.sh:96` `bind-process-layout` (digest of `include/dolly/process.h` into the contract; refuses a stale one, `dolly-abi.mjs:272-295`); `:107` `validate-process` on `process-minimal`, `process-no-dso`; `:240` on `bootstrap`, `process-check`, `process-cpp-check`; `:251` `validate-process-dso`; `:259` `emit-emscripten-exports` (the export list derived from the plugin contract and the host contracts, `dolly-abi.mjs:296-300`); `:300` `validate-runtime` (`dolly-abi.mjs:142-182`: statically linked, stamped, memory type, every contract import present as an export with the same type); `:303` `validate-browser` (`:135-141`: runtime imports equal `abi/dolly-browser-0.wat`'s, a hand-written WAT listed at `build.sh:86`, in name, type and count). `scripts/build-system-snapshot.mjs:97-120` on reuse and `:144-149` after a build: `verifySnapshotIdentity` (`snapshot-identity.mjs:8-36`: `/etc/dolly/image`, `recipes.lock`, each recipe retained byte-exact, canonical Dollyfile, ENTRY) plus metadata `recipes`, `hostRequirements`, `inputs`, `byteLength`, `sha256`, `entry`, `manifest`. `scripts/site-release.mjs:91,136` repeats `validateBrowserImports` and `verifySnapshotIdentity` at release. `host/modules.mjs:33-35` refuses a duplicate import owner and `:259-263` an unowned import when the page loads.

| Lines | Asserts | Also asserted by the build? |
|---|---|---|
| 36-49 | plugin contract: `memory64(min=1024,max=131072,shared)`, `table64(min=1,max=*)`, no exports, no `dolly_toolchain_main`/`dolly_spawn`/`dolly_http_perform` import | 43-44 restate `abi/dolly-kernel-plugin-0.wat:6-7` (the audit's claim holds); `validate-runtime` checks the runtime's memory against the contract (`dolly-abi.mjs:154-159`), not the contract against a number. 45-48: only here. |
| 51-74 | process contract: imports `env.memory`, `dolly_process_0.call` with types; `_start`; layout digest = sha256(`process.h`) | 59-66 restate `abi/dolly-process-0.wat:15` and the call type; 72-73 recompute what `bind-process-layout` wrote from the same file (`build.sh:96`). |
| 76-87 | `process-check` satisfies the contract; sections present; two imports | `build.sh:240` validates the same file; the section and import list only here. |
| 89-103 | seed holds only `bootstrap` and `compiler` in `process-bin/`, byte-equal to `build/`; `stdio.h` present; no `c++/v1`, no SDK ports | Only here (`grep 'process-bin/' scripts/*.mjs scripts/*.sh`: build.sh writes them, nothing lists the seed). |
| 107-123 | libc++ archives' symbols ⊆ `dynamic-provider.symbols` and vice versa for `_Z` names | Only here (`prepare-process-sysroot.sh:119` writes the list; nothing compares). |
| 125-138 | gate: two memory imports, two typed exports | Restates `abi/dolly-process-gate-0.wat`. Only here as a check. |
| 140-151 | runtime exports exactly the plugin's imports ∪ host contracts' functions | Only here. `validate-runtime` checks ⊇; the list is generated (`build.sh:259`) and the comment `dolly-abi.mjs:294-295` ("Emscripten adds only its own runtime") is a claim this test enforces. |
| 153-155 | `validateRuntime` | `build.sh:300`, same function. |
| 157-184 | supervisor and threads contracts' functions exported with their types; three exact types; four removed names absent | 162-166 duplicates 197-200 (both WATs are host contracts: `host/runtime/module.json:11`, `host/threads/module.json:8`). 173-183 only here. |
| 186-202 | each host contract's imports owned by its manifest and present in the runtime with the type; its functions exported | 192 (owned) only here at test time (`host/modules.mjs:33-35,263` at page load); 193-194 in type by `validate-browser` against the hand-written WAT; 197-200 only here. |
| 204-209 | no `dylink.0`; source regex over `kernel-plugin.mjs` | 206 = `dolly-abi.mjs:150-152`; 208 only here (group c). |
| 211-310 | sealing: image, buildId, identityVersion, recipes, manifest sorted, primary program per core image (221-248, 265), `recipes.lock` retained (267), seed/toolchain inheritance rule (271-285), no bootstrap probes (286-287), each recipe retained (288), no `/workspace` (289), byteLength, sha256 (290-291), ENTRY paths retained (292-294), entry (295), BOM sensitivity of the verifier (303-307) | 259-262, 290-291, 295: `build-system-snapshot.mjs:97-120` on reuse (that is, only when the builder runs again) and `:144-149` after a build; 288: `snapshot-identity.mjs:19-23`; 292-294: `validateSnapshotEntry` via `:31`. The rest (the `corePrograms` map, 267, 271-287, 289, 303-307) only here. |
| 312-325 | `DOLLY_STATIC_SOURCES` equals `inspectStaticSources()` now; prefixes and digests well formed | Written by the same function (`image-definitions.mjs:140`): the audit's claim holds; the comparison is against the current tree, so it fails when `dist/` is older than the sources. 320-324 only here. |
| 327-352 | registry matches discovered recipes; boot route iff ENTRY and `display@0`; rebuild and view routes exist; `amy-index.txt` rows = packages | Only here. |
| 354-362 | kernel memory import type; table export | 360 = `dolly-abi.mjs:154-159`; 361 only here. |
| 364-387 | `validateBrowserImports` (367); runtime imports = union of manifests (368-376); six module import names (377-382); blacklist `/nodefs\|opfs\|fetch\|socket\|spawn\|process\|pthread\|thread_/` (383-386) | 367 = `build.sh:303`. 368-386 only here; the build's statement of the same set is `abi/dolly-browser-0.wat`, a hand-written file. |
| 389-399 | the validator rejects a renamed, retyped, missing and duplicated import, by message | Only here (a unit test of `validateBrowserImports`). |

Counting lines whose fact the build or the snapshot builder asserts on the same artifacts: about 40 (153-155, 206, 360, 367, 72-73, 76-78, 162-166, 193-194, 259-262, 288, 290-295). The audit's "250 of 401" is not reproduced by block; the file is 399 lines. `spawnSync` is imported at line 6 and used nowhere (`grep -n spawnSync`: one hit). The audit's "unique" three are unique; so are 45-48, 89-103, 107-123, 173-183, 221-248, 265-289, 303-307, 320-352, 389-399.

Facts `AGENTS.md` asks tests to prove that are proved here and nowhere else in the test suites: "exact ABI compatibility" of the kernel's exports (140-151) and of every host contract (186-202); "enforce their exact allowlist in tests" (368-386: the only test that states the kernel's complete import set and that no import is outside `env.memory` and `env.dolly_*`). `test/zig-sdk.artifacts.mjs` asserts retained paths and environment values, no wording. Hygiene 15's "no host filesystem or subprocess only by import names" refers to 383-386 (not 385-388).

---

## 5. What a change would mean, on real cases

Observations only; "today" is §3.

1. **`test/host-modules.test.mjs:88` `/nena enable audio/`** (class ii). Without the regex: `checkHostAbi` throws for `audio@0` when `nena@0` is present. No longer proved: that the refusal names the command, which `nena-browser.mjs:103,126,226-227` and `tmux-browser.mjs:160` rely on in a browser and `b3cff2ab` named as the kernel's contract ("one line on its own stderr that names the cause"). To prove it without text: `host/requirements.mjs:58-59` builds the sentence inline; a field such as `{ module: "audio@0", enable: "audio" }` on the thrown error would have to exist.

2. **`test/dollyfile-graph.test.mjs:42` `/Dollyfile:5: invalid SOURCE/`** (ii + i). Without: lint rejects the recipe, which the parity test already proves for 194 syntax cases through both parsers (`dollyfile-parser.test.mjs:44-53`, accept/reject only; its image-reference loop `:62-73` likewise). No longer proved: which rule, and that the line number is right. To prove without text: `src/dollyfile-view.mjs:14` throws `${label}:${line}: ${message}` as a plain `Error`; the lint returns the sentence as its value (`lint-dollyfiles.mjs:31-35`); the C engine's only channels are stderr and status 2 (`src/dollyfile.c:2060-2094`). The graph tests are the only place the rule and line are checked.

3. **`test/system-snapshot-format.test.mjs:73-76` `/truncated/`, `/trailing/`, `/header/`** (i). Without: three corruptions are refused. No longer proved: for the right reason (a truncated file refused as "header" would pass). To prove without text: a code on the 12 throws of `scripts/system-snapshot-format.mjs`; none exists.

4. **`test/http-policy.test.mjs:187` `/quota/`, `:203` `/policy denied/`** (i with an errno today). `{ errno: DOLLY_ERRNO.EDQUOT }` and `EACCES` would state the same fact without text (`policy.mjs:219,228`), as `http-broker.test.mjs:79,151,194` does on the mailbox word. One difference: `/denied/` and `EACCES` both cover the policy's and the local services' refusal alike.

5. **`test/process-abi.test.mjs:44-52` "build and browser validators agree on wrong-call", `/import dolly_process_0.call must be/`.** Without: each validator throws on the fixture. No longer proved: that the page's validator (`src/process-abi.mjs`, 3 plain throws) and the build's refuse for the same reason; the message is their only shared output. To prove without text: a code shared by both.

6. **`test/cloudflare-pages.test.mjs:195-196`** `/20,000-file limit exceeded by 1: v0\.1\.0 has 4 files, v0\.2\.0 has 10000 files, v0\.3\.0 has 9993 files/` (ii). Without: a rejection, and `:197` still proves nothing was written. No longer proved: the arithmetic and that every version is named ("the versions are named and none is dropped", `:191`). To prove without text: a structured error `{ limit, excess, versions }`.

The browser case already made: `42daf7ac` kept `126` in `default-browser.mjs:45-46` ("had the program run, its failed request would be status 1") and dropped the sentence; the sentence for `input@0` is still proved once, in the sandbox, by `host-modules-browser.mjs:164`. Where a message is the only place a fact is checked: the lint's rule and line (case 2), the decoder's reason (case 3), the two validators' agreement (case 5), the release's counts (case 6), the named version (`session-file.test.mjs:82`), the named command (case 1).

---

## 6. What could not be found out by reading

- Whether any wording assertion ever caught a regression: no task or commit records one. `git log -S` on eight asserted strings (`missing or changed type`, `ENTRY needs`, `is not declared by this image`, `Required host module`, `cold-2 snapshot differs`, `log exceeds`, `does not own`, `snapshot selected image`; and `policy denied`, `stale recipe pin`, `file manifest mismatch`, `invalid session chunk`, `add REQUIRES HOST`, `downloaded source checksum mismatch`, `invalid Pages header path`, `not a regular file`): most were born with their test in one commit and never reworded; the one test edit caused by a reword is `1723a563` (10-06, after `b3cff2ab`); later edits to those lines were moves (`9d9064b3`) or removals (`42daf7ac`).
- The audit's methods for "102" and "250 of 401": not stated; not reproduced.
- Whether a loose regex (`/denied/`, `/header/`, `/call/`, `/DSO /`) has ever matched the wrong refusal: not knowable without running mutated code.
- Which of the 163 shell-side `grep -q` lines have broken on a rename: `8e313e4d` (10-13) changed four lines of `amy-browser.mjs` for the mojo rename (names, not sentences); nothing else found by `--grep`.
- Where `6a102425`'s "nena's sentence replaced the old wording" was fixed for the speech test: not in that commit's diff, and the speech test's strings have no commit after `8a7fd584`.
- Whether the 28 bare `rejects` ever hid a wrong exception: not recorded.