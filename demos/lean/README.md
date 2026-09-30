# Lean images

Runnable images that copy only what they run out of build-only images.

- `hello`: Game of Life in a lean image without a compiler.
- `hello-build`: Builds the hello program.
- `runtime`: The system userspace without its compiler.
- `hello-on-runtime`: The runtime base with the hello image copied in.
