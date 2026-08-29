#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

const [mesonPath, outputPath] = process.argv.slice(2);
if (!mesonPath || !outputPath) {
  throw new Error("usage: generate-git-sources.mjs MESON.BUILD OUTPUT");
}

const meson = await readFile(mesonPath, "utf8");

function sourceArray(name) {
  const match = meson.match(new RegExp(`${name} = \\[([\\s\\S]*?)\\n\\]`));
  if (!match) throw new Error(`could not find ${name} in ${mesonPath}`);
  return [...match[1].matchAll(/'([^']+\.c)'/g)].map((item) => item[1]);
}

const sources = [
  ...sourceArray("compat_sources"),
  ...sourceArray("libgit_sources"),
  ...sourceArray("builtin_sources"),
  // Meson's default (non-breaking-changes) build adds this outside the base
  // builtin_sources array.
  "builtin/pack-redundant.c",
  "compat/stub/procinfo.c",
  "compat/poll/poll.c",
  "compat/qsort_s.c",
  "compat/regex/regex.c",
  "compat/memmem.c",
  "compat/mmap.c",
  "compat/pread.c",
  "compat/setenv.c",
  "compat/strcasestr.c",
  "compat/strlcpy.c",
  "compat/strtoimax.c",
  "compat/strtoumax.c",
  "block-sha1/sha1.c",
  "sha256/block/sha256.c",
  "varint.c",
];

const unique = [...new Set(sources)].sort();
await writeFile(outputPath, `${unique.join("\n")}\n`);
