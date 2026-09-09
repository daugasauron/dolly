DOLLY 3
MODULE codex-build

REQUIRES TOOL patti
REQUIRES TOOL cc
REQUIRES TOOL cp
REQUIRES TOOL mv
REQUIRES TOOL cat
REQUIRES TOOL gzip
REQUIRES TOOL tar
REQUIRES TOOL mkdir
REQUIRES TOOL rm
REQUIRES TOOL protox

SOURCE HOST /static/codex/sources-00.part /tmp/codex-sources-00.part 34a478349d9925278bf1b4fbedaefd5c96fb720362de815f7ae3d64c05bb19de
SOURCE HOST /static/codex/sources-01.part /tmp/codex-sources-01.part 3ed798d02e5dbbf5ff2642634baaa9c61776e078727a68afaa8b0159a331545f
SOURCE HOST /static/codex/sources-02.part /tmp/codex-sources-02.part 6da329711e4976fa4a6f5d48bad2b13265d611ab1378125fa4be28e098358f17
SOURCE HOST /static/codex/sources-03.part /tmp/codex-sources-03.part 2fe1ac84bd799b99cfcc5c6a0e8967696c80972dcccf72d748a2b6c787c0b778
SOURCE HOST /static/codex/sources-04.part /tmp/codex-sources-04.part a32534a8b1e9376f6970564a9e77a36332987818ddb18a0934dcea76f69b58da
SOURCE HOST /static/codex/sources-05.part /tmp/codex-sources-05.part 74eb786b8278adb8fb61d25efad760e811b7310ec9e03c5856ee6b87511c9eeb
SOURCE HOST /static/codex/sources-06.part /tmp/codex-sources-06.part 947378cd19eeb10c6c05ec16cc41dd8f655d833bc93a0b33b5647b04e4ed34a3
SOURCE HOST /static/codex/no-js.c /tmp/codex-no-js.c 5b2a995a8f36f4917f40f39af9806be9d4646d90850585fbc8bd904ff18c45fd
SOURCE HOST /static/codex/patti.toml /tmp/codex-patti.toml d0576e2f732a57850652677d3b95abab03f5875c599de51e5244b6081ca9c334
SLOP cat /tmp/codex-sources-00.part /tmp/codex-sources-01.part /tmp/codex-sources-02.part /tmp/codex-sources-03.part /tmp/codex-sources-04.part /tmp/codex-sources-05.part /tmp/codex-sources-06.part | gzip -dc - | tar -xf - -C /
SLOP rm /tmp/codex-sources-00.part /tmp/codex-sources-01.part /tmp/codex-sources-02.part /tmp/codex-sources-03.part /tmp/codex-sources-04.part /tmp/codex-sources-05.part /tmp/codex-sources-06.part
SLOP mkdir -p /tmp/codex-build/tools
SLOP cc -O1 -c /tmp/codex-no-js.c -o /tmp/codex-build/tools/no-js.o
SLOP patti build --offline --manifest-path /tmp/codex-sources/codex-rs/cli/Cargo.toml --bin codex --target-dir /tmp/codex-build --cache /tmp/patti-cache --config /tmp/codex-patti.toml \
  --patch libc=/opt/rust-sdk/src/libc \
  --patch crossterm=/tmp/codex-sources/git/45fecb9508105988f42fe6ff0441783ed3717f92/. \
  --patch tokio-tungstenite=/tmp/codex-sources/git/0e5b2d73aa18dd9f0a50ee9ff199d5aef7594186/. \
  --patch tungstenite=/tmp/codex-sources/git/4fffad30fe373adbdcffab9545e9e9bf4f2fc19f/. \
  --patch mxc_telemetry=/tmp/codex-sources/git/6cd3d58f05d3447e67109cfb75e042803b843ca4/src/mxc_telemetry \
  --patch appcontainer_common=/tmp/codex-sources/git/6cd3d58f05d3447e67109cfb75e042803b843ca4/src/backends/appcontainer/common \
  --patch learning_mode_windows=/tmp/codex-sources/git/6cd3d58f05d3447e67109cfb75e042803b843ca4/src/backends/learning_mode/windows \
  --patch wxc_common=/tmp/codex-sources/git/6cd3d58f05d3447e67109cfb75e042803b843ca4/src/core/wxc_common \
  --patch mxc_config_contract=/tmp/codex-sources/git/6cd3d58f05d3447e67109cfb75e042803b843ca4/src/core/mxc_config_contract \
  --patch learning_mode_core=/tmp/codex-sources/git/6cd3d58f05d3447e67109cfb75e042803b843ca4/src/core/learning_mode_core \
  --patch sandbox_spec=/tmp/codex-sources/git/6cd3d58f05d3447e67109cfb75e042803b843ca4/src/core/generated/base_container_specification \
  --patch process_security_environment_spec=/tmp/codex-sources/git/6cd3d58f05d3447e67109cfb75e042803b843ca4/src/core/generated/process_security_environment_specification \
  --patch nucleo=/tmp/codex-sources/git/4253de9faabb4e5c6d81d946a5e35a90f87347ee/. \
  --patch nucleo-matcher=/tmp/codex-sources/git/4253de9faabb4e5c6d81d946a5e35a90f87347ee/matcher \
  --patch runfiles=/tmp/codex-sources/git/b56cbaa8465e74127f1ea216f813cd377295ad81/rust/runfiles \
  --patch mio=/tmp/codex-sources/mio-1.2.0 \
  --patch tokio=/tmp/codex-sources/tokio-1.52.3 \
  --patch socket2=/tmp/codex-sources/socket2-0.6.3 \
  --patch zlib-rs@0.5.5=/tmp/codex-sources/zlib-rs-0.5.5 \
  --patch zlib-rs@0.6.3=/tmp/codex-sources/zlib-rs-0.6.3 \
  --patch cc=/tmp/codex-sources/cc-1.2.55 \
  --patch ring=/tmp/codex-sources/ring-0.17.14 \
  --patch reqwest@0.12.28=/tmp/codex-sources/reqwest-0.12.28 \
  --patch nix@0.28.0=/tmp/codex-sources/nix-0.28.0 \
  --patch nix@0.30.1=/tmp/codex-sources/nix-0.30.1 \
  --patch sqlx-sqlite@0.9.0=/tmp/codex-sources/sqlx-sqlite-0.9.0 \
  --patch serial2=/tmp/codex-sources/serial2-0.2.33
SLOP rm -rf /tmp/patti-cache
SLOP mv /tmp/codex-build/codex /usr/bin/codex
SLOP mkdir -p /usr/share/licenses/codex /usr/share/dolly/builds
SLOP cp /tmp/codex-build/patti-build.json /usr/share/dolly/builds/codex.json
SLOP cp /tmp/codex-sources/LICENSE /usr/share/licenses/codex/LICENSE
SLOP cp /tmp/codex-sources/NOTICE /usr/share/licenses/codex/NOTICE
SLOP rm -rf /tmp/codex-sources /tmp/patti-cache /tmp/codex-build /tmp/codex-no-js.c /tmp/codex-patti.toml

EXPORTS TOOL codex
EXPORTS FOLDER codex-licenses /usr/share/licenses/codex
FILE /usr/share/dolly/builds/codex.json
SLOP codex --version
SLOP codex --help
