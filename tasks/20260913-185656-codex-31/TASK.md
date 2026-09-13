# Keep installed agent guidance consistent with custom session support

- STATUS: CLOSED
- PRIORITY: 100
- TAGS: audit,documentation,agents

The installed dollyfiles skill still says custom result images cannot use named
sessions, even though issue 11 added them. This source is installed in Pi's
configuration layer and is the guidance an agent actually reads.

## Done when

- Explain current named-session support and the exact cached-base limitation in the installed skill.
- Prepare and rebuild the affected configuration/application images; prove the TypeScript and Pi source producers are reused.
- Check the installed file in the actual Studio image and preserve the source-built default tools.

## Result

The installed skill now describes named custom-image sessions and their exact
cached-base dependency. The official 20-image build rebuilt only Studio in
9.4 s; the other 19 images, including TypeScript/Pi/Neovim producers, were reused.
Total preparation/build time was 40.3 s, including 27.2 s of source preparation.
Studio's new snapshot is 271,436,682 bytes with digest prefix `9f2282c5230f3f54`.

Decoded the retained snapshot and compared the installed skill byte-for-byte
with its source; source-built rg/fd remain installed. The real Chrome Studio
mode passed Pi startup/prompts, example linting, visible Neovim highlighting,
unsaved lint errors and return to Slop. A final plan reuses all 20 images in
3.4 s. No test was added for wording.

The final local package at source `96f86c6` passed live inventory acceptance for
all 20 selected images. It includes runtime `cf7fb16004c7477a` and this Studio
snapshot. Release: `6eeb480d3262dbbf0941b88994f30d20bcca58fec0b94f74ff7bcd64de9ed215`.
Archive: `/dev/shm/dolly-core-release-archives.7La9kj/site.tar.gz`, SHA256
`34b79f6c590b779bcd4319fb8c2fbc31fa3f1323677a31b2896af11b2e5bbf31`.
The package remains local; no remote deployment was performed.
