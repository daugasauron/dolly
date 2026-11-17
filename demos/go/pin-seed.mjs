#!/usr/bin/env node
// The next Go seed: the go package's commands for dolly/wasm64 as Dolly built them, with what
// cmd/dist generated for them, which the go command builds from but Go's source lacks: the
// runtime headers in pkg/include and six z*.go sources. Pinned as DOLLY_GO_SEED
// (scripts/seed-archive.mjs). Run it after building go: a digest it leaves unchanged is the
// fixed point. Usage: node demos/go/pin-seed.mjs
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { decodeSystemSnapshot } from "../../scripts/system-snapshot-format.mjs";
import { pinSeedArchive } from "../../scripts/seed-archive.mjs";

const project = resolve(import.meta.dirname, "../..");
const generated = ["cmd/cgo/zdefaultcc.go", "cmd/go/internal/cfg/zdefaultcc.go", "cmd/internal/objabi/zbootstrap.go",
  "internal/buildcfg/zbootstrap.go", "internal/runtime/sys/zversion.go", "time/tzdata/zzipdata.go"]
  .map(path => `/usr/lib/go/src/${path}`);
const { files } = decodeSystemSnapshot(await readFile(join(project, "dist/dolly-go-system.snapshot")));
const seed = new Map([...files].filter(([path]) => /^\/usr\/lib\/go\/(bin|pkg)\//.test(path) || generated.includes(path)));
if (!seed.has("/usr/lib/go/bin/go") || generated.some(path => !seed.has(path))) throw new Error("go holds no toolchain");
await pinSeedArchive("DOLLY_GO_SEED", seed);
