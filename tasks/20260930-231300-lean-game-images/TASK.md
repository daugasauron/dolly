# Ship game images without the C/C++ toolchain

- STATUS: OPEN
- PRIORITY: 180
- TAGS: images,lean,demo

Owner decision: games that never compile at runtime may drop the 135 MiB toolchain; developer images keep it (Dollyfile Studio, Neovim, Python, JavaScript, Pi and other build-capable images). rg/fd stay in every Pi image.

Measured on experiment/dollyfile: a compiler-free runtime base built by COPY FROM is 19.7 MB (system: 159.6 MB) and boots about 5x faster locally; builds are byte-reproducible.

Done when: a core compiler-free runtime image exists and the game demos are built on it, verified in Chrome and Firefox.
