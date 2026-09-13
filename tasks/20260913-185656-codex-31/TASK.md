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
