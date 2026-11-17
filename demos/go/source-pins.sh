# The go demo's upstream source pins, sourced by config/source-pins.sh.

# The seed: Go's commands for dolly/wasm64 as the previous round built them
# (demos/go/pin-seed.mjs writes both lines).
DOLLY_GO_SEED_URL='https://github.com/daugasauron/dolly/releases/download/v0.1.7/dolly-go-seed-d1aee8933f9613899e26231a8c584d944516eab0cc9a05adaef76373ce661936.tar.gz'
DOLLY_GO_SEED_SHA256=d1aee8933f9613899e26231a8c584d944516eab0cc9a05adaef76373ce661936
# Go: the release's source, patched for GOOS=dolly GOARCH=wasm64 (demos/go), and upstream's
# linux/amd64 toolchain of the same release, which vendors Go programs' modules and
# cross-builds the tools rclone's staging lists files with (build-go-toolchain.sh).
DOLLY_GO_VERSION=1.27.3
DOLLY_GO_URL='https://go.dev/dl/go1.27.3.src.tar.gz'
DOLLY_GO_SHA256=6e7749035cf360f06b2575d162ea79df9fda8ef671889e5c375f8e50777f26bb
DOLLY_GO_HOST_URL='https://go.dev/dl/go1.27.3.linux-amd64.tar.gz'
DOLLY_GO_HOST_SHA256=65efbc80fdc1fa2cd2631cad5b481777a68e8725f34e89f50fc6ac714e379b40
# esbuild, the JavaScript and TypeScript bundler, built by the go package; its one module
# dependency (golang.org/x/sys) is vendored at staging and checked against its go.sum.
DOLLY_ESBUILD_VERSION=0.28.2
DOLLY_ESBUILD_URL='https://github.com/evanw/esbuild/archive/refs/tags/v0.28.2.tar.gz'
DOLLY_ESBUILD_SHA256=300162f899361d9f0263065f8728ef9086dcfc1a3d36bcbc4e0abe5de9c58bf8
