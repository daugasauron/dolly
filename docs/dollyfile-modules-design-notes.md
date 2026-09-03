~~ MAIN COMMENTS

The goal here is for a user to look at an arbitrary part of the dollyfile, then easily follow the flow all teh way down to the actual host contract WAT.

For example, some module requires git -> look at git module -> it requires make, zlib etc -> look at those modules -> it requires something else -> WAT.

It is more about clarifying how the system actually works than it is about being precise in some academic sense. It should be simple.

# Dollyfile modules and interface requirements

Status: discussion draft. This is not a specification and describes no current
behavior.

## Proposed direction

Use one dependency vocabulary but keep three enforcement domains distinct:

| Namespace | Example | Meaning | Verified by |
| --- | --- | --- | --- |
| `build:` / `command:` / `library:` | `build:tool.cc`, `command:git` | An in-Wasm tool or retained artifact | Dollyfile engine and filesystem/ABI checks |
| `api:` / `feature:` | `api:dolly.http-client@0`, `feature:input.pointer` | Compatibility with a typed Dolly interface | Canonical WAT contract and ABI validator |
| `authority:` | `authority:http`, `authority:download` | A browser-side communication or output channel | Trusted embedding/provider policy |

`REQUIRES` means that a named fact must already be satisfied. `EXPORTS` means
that a module established a named, verifiable fact. Neither keyword performs
dependency resolution or grants browser authority.

> Comments:

I am thinking.. maybe it maes sense to use one vocabulary with different domains but I think the vocabulary for named WAT mappings has to be different.

I want the host requirements to map to a specific WAT file. One example that would use this is a curl module that requires the HTTP WAT and exports a library.

- tool -> An executable thats on the path. If something exports a tool, the system should verify that the current PATH contains a WASM executable with this name.
- library -> An actual .o file. The location of the library needs to be part of the contract.
- env -> environment variable on the host. Can be updated but not replaced. For example PATH can be extended but things should fail if something tries to redefine it from scratch.
- file -> Just a file at some location (could be config file or whatever).
- folder -> A folder at some location (data or something)

## Userspace module sketch

A module is an ordered recipe fragment:

```text
DOLLY 2
MODULE git

REQUIRES build:tool.cc
REQUIRES build:tool.ar
REQUIRES build:tool.make
REQUIRES build:library.zlib
REQUIRES build:library.curl
REQUIRES api:dolly.http-client@0

SOURCE HOST BIN /static/default/git.tar /tmp/git.tar SHA256 ...
RUN tar -xf /tmp/git.tar -C /
RUN make -f /usr/src/dolly/startup.mk git
CHECK git --version

KEEP /usr/bin/git
KEEP /usr/lib/libgit.a
KEEP /usr/libexec/dolly/git-remote-http

EXPORTS command:git COMMAND /usr/bin/git
EXPORTS library:git ARCHIVE /usr/lib/libgit.a
EXPORTS feature:git-remote-http COMMAND /usr/libexec/dolly/git-remote-http
END
```

Comments on above:
- This does NOT have a dependency on the http-client API? It has a dependency on the curl module which could have a dependency on http-client. Its an indirect dependency.
- It OBVIOUSLY has a dependency on tar which is not specified, that should fail during parsing. 
- It should NOT depend on startup.mk from the host.

With the new module system I think it makes sense to include the source of eg make files and scripts directly in the module. For example RUN echo """ makefile contents """ > /tmp/git/Makefile. I'd like to use that here.

- I think the end should be like:

EXPORTS TOOL git
EXPORTS LIB  git /usr/lib

What is a feature? I don't know what git-remote-http does or what it's used for?


An image explicitly orders its modules:

```text
DOLLY 2
IMAGE default

USE toolchain
USE make
USE curl
USE zlib
USE git

ENTRY /usr/bin/pi
```

Comments on above: I like this but one comment. How are the modules sourced? Need to specify location of them somehow - HOST/URL and some SHA?


Proposed semantics:

- `USE` executes at that exact row. It does not search for or automatically
  install missing requirements. ~~ Nice
- Requirements must have been exported by an earlier module or be an explicit
  intrinsic platform fact. An unmet requirement fails before module actions. ~~ Yes fail fast during parsing
- Exports become visible only after the module finishes successfully.
- Export evidence is typed. For example, `COMMAND` should require a retained
  regular Wasm executable with a valid Dolly ABI; `ARCHIVE`, `FILE`, and `TREE`
  would have corresponding validators.
- `EXPORTS` does not imply `KEEP`, and does not replace behavioral `CHECK`
  rows. Exported filesystem objects must still be retained at final sealing.
- Duplicate module execution, cycles, conflicting providers, or duplicate
  export names fail explicitly. ~~ With my commends from above I think EXPORTS should imply KEEP, I think its cleaner?
- Module source bytes, digest, order, requirements, exports, checks, and
  evidence become part of the sealed image identity. 
- No semantic-version dependency solver is needed initially. Source digests
  identify exact implementations; export names describe compatibility. ~~ YES - arch style simplicity from no versioning.
- `IMAGE`, `EXTENDS`, and `ENTRY` remain image concepts and are not allowed in
  reusable modules.~~ YES

Git illustrates why exports should be finer than package names. Local Git can
work without external network authority, while `git-remote-http` additionally
needs Dolly's HTTP interface and a browser policy that permits the destination.

> Comments:
> Yeah I still don't know what git-remote-http actually does, see comments above.

## Module state

The filesystem remains shared because that is Dolly's userspace model. Reusable
modules should nevertheless avoid accidental dependencies through process
state. One possible rule is:

- `ENV` and `WORKDIR` inside a module are scoped to that module and restored at
  `END`; See commends above on ENV, I think it should be treated as an EXPORT. Maybe remove WORKDIR and bake it in together with ENTRY ?
- image-level `ENV` and `WORKDIR` remain persistent;
- deliberately published environment or configuration needs an explicit
  export.

This is a semantic choice, not merely syntax, and needs testing against the
current recipes before being adopted.

> Comments:
>

## Interface module sketch

The exact browser/runtime calls and types must remain canonical WAT. A module
manifest should name and compose those contracts rather than duplicate their
function signatures:

```text
INTERFACE dolly.browser.display@0
REQUIRES machine:shared-memory64
CONTRACT abi/dolly-display-0.wat
EXPORTS protocol:display-mailbox@4
EXPORTS feature:input.keyboard
EXPORTS feature:input.text
EXPORTS feature:input.pointer
EXPORTS feature:input.resize
EXPORTS feature:output.framebuffer-rgba8
END
```

```text
INTERFACE dolly.browser.http@0
REQUIRES machine:shared-memory64
CONTRACT abi/dolly-http-0.wat
EXPORTS protocol:http-mailbox@2
END
```

The interface module version and an internal mailbox version are different
identities. For example, `dolly-display-0.wat` currently describes display
contract generation 0 while exporting mailbox version 4.

The existing WAT files already form useful protocol-sized groups: command ABI,
HTTP, display/input, download, and snapshot/session. The existing
`config/browser-imports.json` is an audit classification of raw main-module
imports, not a complete interface manifest. An import-only list misses
channels driven through shared memory and runtime exports, such as framebuffer
presentation and session persistence.

> Comments:
Not really sure here, I think.. this is too complicated. I think for now, just have
sort of named mappings to a WAT file. Maybe include SHA to make sure it doesn't change.

The idea is to make things simpler, so for example if something requires gpu, you can add the WAT file for those calls, then name it GPU, write some program that relies on that name (SHA?) and transforms it into a library using a module, and then implement the program. I think that is simple and should imnprove the user experience. Not really sure though.

## Authority rule

A Dollyfile may describe an authority requirement, but it must never grant or
configure that authority. The trusted embedding chooses its provider profile
and policy independently:

```text
image API requirements       subset of runtime interface features
image authority requirements subset of trusted embedding grants
```

If either check fails, the image does not run under that embedding. The browser
must not respond by enabling the missing capability.

HTTP additionally needs destination, method, credential, redirect, quota, and
approval policy. Satisfying `api:dolly.http-client@0` proves protocol
compatibility; it does not imply that any particular request is authorized.

Repository module fetching should follow the existing `EXTENDS`/`SOURCE HOST`
model: exact source-visible locations, bounded responses, hashes in the lock,
and browser policy established independently of recipe execution. A custom
module cannot add its own broker rule.

> Comments:
No. In my understanding the ONLY way to understand authority/security is to look at the host WAT files. 

It doesn't matter if its security/mouse/gpu wahtever its just an interface. You have to understand how EACH ONE maps to the browser implementation.

The goal of this language is to make it easier to underestand, trace and reason about the interface that exists. Authority and security are not good abstractions in my opinion.

## Security limitation

Requirements cannot create per-module isolation. Dolly assumes compromise of
the complete shared in-Wasm userspace. If the browser grants HTTP to an
instance, compromised code from any userspace module can reach that edge.
Module requirements therefore aggregate into whole-image requirements.

Keyboard, pointer, text, resize, and framebuffer are useful feature names, but
they are not independent security compartments today. They share the display
mailbox and shared Wasm memory. Initially, one display provider should export
these as feature facets. They should be described as independently enforceable
authority grants only if the trusted browser provider actually gates them
independently.

`env.dolly_http_dispatch` remains the sole intentional agent-selected network
edge. A module system must not create an alternate fetch, module download,
socket, JavaScript-evaluation, DOM, or host-filesystem path.

> Comments:
> Same comments as above section.

## Suggested implementation order

1. Add inline `MODULE` / `REQUIRES` / `EXPORTS` metadata while preserving
   strict sequential execution.
2. Record verified module and export metadata in the sealed image identity.
3. Add explicit repository `USE` and module locking after the semantics are
   stable.
4. Assign stable names and semantic feature exports to the existing WAT
   contracts.
5. Aggregate image requirements and compare them with a trusted browser
   provider profile.
6. Consider separately gated display facets or capability-specific runtime
   builds only when there is a concrete enforcement need.

Don't do anything yet just consider my comments.

## Open questions

- Should module `ENV` and `WORKDIR` be scoped, or retain Dollyfile v1's global
  sequential behavior?
- Should `EXPORTS` refer only to typed evidence, or also explicitly name the
  `CHECK` rows that establish behavioral evidence?
- Which capabilities are intrinsic before the first module, especially the
  bootstrap compiler and Dollyfile engine?
- Should alternative providers be allowed to export the same compatibility
  name, or should every export name have exactly one provider in an image?
- Should Git be one module with several exports or separate `git-core` and
  `git-http` modules?
- Are `REQUIRES api:...` and `REQUIRES authority:...` sufficiently distinct,
  or should authority requirements use a different keyword such as `NEEDS`?
- Should external modules be repository-only initially, or should a pinned
  `USE HOST|URL ... SHA256 ...` form exist from the start?
- Is the interface registry itself written in a Dolly-like manifest syntax, or
  generated directly from WAT plus a small semantic-feature mapping?

> General comments:
> I think I've put enough comments for now. I think the next step for you is to present a simple curl and git module source and see what I think about it.
