import { createHash } from "node:crypto";

// Recipes that /bin/dollyfile and the JavaScript recipe graph must both accept
// or both reject. Each case maps paths on the canonical origin to text;
// /Dollyfile is the root. PIN(/path) stands for the SHA-256 of that file once
// its own pins resolve.
// C imports FROM/COPY targets as built artifacts, so every target here is valid.
const zeros = "0".repeat(64);
const image = (rows = "") => `DOLLY 5\nIMAGE default\n${rows}ENTRY /bin/slop\n`;
const root = (text, files = {}) => ({ "/Dollyfile": text, ...files });
const module = (text, files = {}) => root(image("USE https://daugasauron.com/modules/probe.dm PIN(/modules/probe.dm)\n"),
  { "/modules/probe.dm": text, ...files });
const probe = (rows, files) => module(`DOLLY 5\nMODULE probe\n${rows}\n`, files);
const base = { "/Dollyfile-base": "DOLLY 5\nIMAGE base\nENTRY /bin/slop\n" };
const chain = length => Object.fromEntries(Array.from({ length }, (_, index) => [`/modules/m${index}.dm`,
  `DOLLY 5\nMODULE m${index}\n${index + 1 < length ? `USE https://daugasauron.com/modules/m${index + 1}.dm PIN(/modules/m${index + 1}.dm)\n` : ""}`]));
const words = (count, size = 1) => Array.from({ length: count }, () => "a".repeat(size)).join(" ");

export const syntaxCases = [
  // Header, identity and ENTRY.
  [true, root(image())],
  [false, root("")],
  [false, root("DOLLY 3\nIMAGE default\nENTRY /bin/slop\n")],
  [false, root("DOLLY 4\nIMAGE default\nENTRY /bin/slop\n")],
  [false, root("DOLLY 6\nIMAGE default\nENTRY /bin/slop\n")],
  [false, root('DOLLY "5"\nIMAGE default\nENTRY /bin/slop\n')],
  [true, root("# comment\n\nDOLLY  5 # version\nIMAGE  default\nENTRY /bin/slop\n")],
  [false, root("DOLLY 5\nDOLLY 5\nIMAGE default\nENTRY /bin/slop\n")],
  [false, root("IMAGE default\nENTRY /bin/slop\n")],
  [true, root('DOLLY 5\nIMAGE "default"\nENTRY /bin/slop\n')],
  [false, root("DOLLY 5\nIMAGE Default\nENTRY /bin/slop\n")],
  [true, root(`DOLLY 5\nIMAGE ${"a".repeat(32)}\nENTRY /bin/slop\n`)],
  [false, root(`DOLLY 5\nIMAGE ${"a".repeat(33)}\nENTRY /bin/slop\n`)],
  [false, root("DOLLY 5\nENTRY /bin/slop\nIMAGE default\n")],
  [false, root("DOLLY 5\nIMAGE default\nIMAGE other\nENTRY /bin/slop\n")],
  [false, root("DOLLY 5\nMODULE default\n")],
  [false, root("DOLLY 5\nIMAGE default\n")],
  [true, module('DOLLY 5\nMODULE "probe"\n')],
  [false, module("DOLLY 5\nMODULE other\n")],
  [false, module("DOLLY 5\nIMAGE probe\nENTRY /bin/slop\n")],
  [false, probe("ENTRY /bin/slop")],
  [false, root(image() + "SLOP true\n")],
  [true, root(image() + "\n# done\n")],
  [false, root(image("ENTRY /bin/slop\n"))],
  [false, root("DOLLY 5\nIMAGE default\nENTRY bin/slop\n")],
  [false, root("DOLLY 5\nIMAGE default\nENTRY\n")],
  [true, root('DOLLY 5\nIMAGE default\nENTRY /bin/slop ""\n')],
  [true, root(`DOLLY 5\nIMAGE default\nENTRY /bin/slop ${words(255)}\n`)],
  [false, root(`DOLLY 5\nIMAGE default\nENTRY /bin/slop ${words(256)}\n`)],
  [true, root(`DOLLY 5\nIMAGE default\nENTRY /bin/slop ${words(1, 4096)}\n`)],
  [false, root(`DOLLY 5\nIMAGE default\nENTRY /bin/slop ${words(1, 4097)}\n`)],
  [true, root(`DOLLY 5\nIMAGE default\nENTRY /bin/slop ${words(15, 4096)} ${words(1, 4000)}\n`)],
  [false, root(`DOLLY 5\nIMAGE default\nENTRY /bin/slop ${words(15, 4096)} ${words(1, 4050)}\n`)],

  // Physical and logical lines.
  [true, probe("SLOP cc \\\n  input.c")],
  [true, probe("SLOP cc \\ # comment\n  input.c")],
  [true, probe("SLOP cc \\ \t\n  input.c")],
  [false, probe("SLOP cc \\")],
  [false, module("DOLLY 5\nMODULE probe\nSLOP cc \\")],
  [false, probe("SLOP cc \\\n# comment\n  input.c")],
  [true, probe("# comment \\\nSLOP true")],
  [false, probe('FILE "/usr/share/a \\\nb" # quoted per line')],
  [true, probe("SLOP cc \\\n\nSLOP true")],
  [true, probe("SLOP printf '%s' \\\\ \\\n  done")],
  [true, root("DOLLY 5\r\nIMAGE default\r\nSLOP cc \\\r\n  x\r\nFILE /usr/share/a\r\n    body\r\nENTRY /bin/slop\r\n")],
  [true, root("DOLLY 5\rIMAGE default\rFILE /usr/share/a\r    body\rENTRY /bin/slop")],
  [true, probe(`SLOP ${"a".repeat(65531)}`)],
  [false, probe(`SLOP ${"a".repeat(65532)}`)],
  [false, probe(`SLOP ${"a".repeat(32766)} \\\n${"a".repeat(32766)}`)],
  [true, root(image("# buffered input\n".repeat(6000)))],
  [false, root(image("# buffered input\n".repeat(8192)))],
  [false, probe("# buffered input\n".repeat(8192))],
  [false, probe("SLOP true\0")],
  [false, probe("# comment\0")],
  [false, root(image("FILE /usr/share/a\n    body\0\n"))],
  [false, probe("RUN true")],
  [false, probe("slop true")],

  // FILE bodies.
  [true, probe("FILE /usr/share/a\n    alpha\n      beta\n    \nSLOP printf done")],
  [false, probe("FILE /usr/share/a\n    alpha\n\n    beta")],
  [false, probe("FILE /usr/share/a\n\talpha")],
  [true, probe("FILE /usr/share/a\n    # literal \\\n    'unbalanced\n    \tindented")],
  [true, probe("FILE /usr/share/a \\\n  # continued path line\n    body")],
  [true, module("DOLLY 5\nMODULE probe\nFILE /usr/share/a\n    last line")],
  [false, probe("FILE\n    body")],
  [false, probe("FILE /usr/share/a /usr/share/b")],
  [true, probe('FILE "/usr/share/a b"')],
  [true, probe("FILE /usr/share/a b")],
  [true, probe("FILE /tmp/scratch")],
  [false, probe("FILE /tmp")],
  [false, probe("FILE /workspace/no")],
  [false, probe("FILE /usr/share/trailing/")],
  [false, probe("FILE /usr/./share")],
  [false, probe("FILE /usr/../share")],
  [false, probe("FILE usr/share")],
  [false, probe("FILE //usr/share")],
  [false, probe(`FILE /${"界".repeat(1500)}`)],
  [false, probe('FILE "/usr/share/a\\b"')],
  [true, probe("FOLDER /usr/share/probe")],
  [false, probe("FOLDER /tmp/probe")],
  [false, probe("FOLDER /usr/a /usr/b")],

  // Words and SLOP.
  [true, probe('SLOP "cc" input.c')],
  [true, probe("SLOP 'cc' input.c")],
  [true, probe("SLOP c\\c input.c")],
  [false, probe('SLOP "" argument')],
  [false, probe('SLOP CWD / "" argument')],
  [true, probe('SLOP CWD "/workspace/project dir" "cc" "an input.c"')],
  [true, probe('SLOP "CWD" / "cc" ""')],
  [true, probe("SLOP CWD / true")],
  [false, probe("SLOP CWD /usr")],
  [false, probe("SLOP CWD /workspace/ cc")],
  [false, probe("SLOP CWD relative cc")],
  [false, probe("SLOP")],
  [false, probe('SLOP cc "unterminated')],
  [false, probe("SLOP cc 'unterminated")],
  [false, probe("SLOP cc trailing\\")],
  [true, probe("SLOP cc input.c")],
  [true, probe('SLOP cc "東京 input.c" # comment')],
  [true, probe("SLOP cc a#b 'quoted # text' \\# escaped")],
  [true, probe("SLOP unknown ; another")],
  [true, probe("SLOP LABEL=value cc")],
  [true, probe("SLOP cc; unknown")],

  // COMPILEC: one source, one program, nothing else.
  [true, probe("COMPILEC /tmp/slop/slop.c /bin/slop")],
  [true, probe('COMPILEC "/tmp/a b.c" /bin/a # comment')],
  [false, probe("COMPILEC /tmp/slop/slop.c")],
  [false, probe("COMPILEC slop.c /bin/slop")],
  [false, probe("COMPILEC /tmp/slop/slop.c bin/slop")],
  [false, probe("COMPILEC /tmp/slop/slop.c /bin/slop -O2")],
  [false, probe("COMPILEC /tmp/slop/slop.c /bin/")],
  [false, probe("COMPILEC")],

  // EXPORTS and REQUIRES.
  [true, probe('EXPORTS ENV DOLLY_TEST_VALUE "APPEND literal"')],
  [true, probe("EXPORTS ENV DOLLY_TEST_VALUE APPEND")],
  [true, probe("EXPORTS ENV DOLLY_TEST_VALUE")],
  [true, probe("EXPORTS ENV PATH APPEND /opt/probe/bin")],
  [false, probe("EXPORTS ENV DOLLY_TEST_VALUE APPEND extra words")],
  [false, probe("EXPORTS ENV 1BAD value")],
  [true, probe("EXPORTS TOOL cc")],
  [true, probe("EXPORTS TOOL [")],
  [true, probe(`EXPORTS TOOL cc ${zeros}`)],
  [false, probe(`EXPORTS TOOL cc ${"A".repeat(64)}`)],
  [false, probe("EXPORTS TOOL cc /bin/cc")],
  [false, probe("EXPORTS TOOL")],
  [false, probe(`EXPORTS TOOL ${"a".repeat(129)}`)],
  [true, probe("EXPORTS TOOL cc\nEXPORTS TOOL cc")],
  [true, probe("EXPORTS FILE value /usr/share/a\nEXPORTS FILE value /usr/share/b")],
  ...["FILE", "FOLDER", "HEADER", "LIB"].flatMap(type => [
    [true, probe(`EXPORTS ${type} value /usr/share/value`)],
    [false, probe(`EXPORTS ${type} value`)],
    [false, probe(`EXPORTS ${type} value /workspace/value`)],
  ]),
  [false, probe("EXPORTS linecount linecount")],
  [false, probe("EXPORTS HOST gpu@0")],
  [true, probe("REQUIRES TOOL cc")],
  [true, probe("REQUIRES TOOL linecount")],
  [true, probe("REQUIRES ENV PATH")],
  [false, probe("REQUIRES cc")],
  [false, probe("REQUIRES linecount linecount")],
  [false, probe("REQUIRES TOOL cc extra")],

  // Host requirements.
  [true, probe("REQUIRES HOST gpu@0\nREQUIRES HOST http@0\nREQUIRES HOST gpu@0")],
  [true, probe(`REQUIRES HOST ${"a".repeat(31)}@65535`)],
  ...["gpu", "gpu@01", "GPU@0", "gpu@-1", "gpu@65536", "@0", "gpu@0@1", `${"a".repeat(32)}@0`, "gpu@0 extra", ""]
    .map(value => [false, probe(`REQUIRES HOST ${value}`)]),
  [false, probe("REQUIRES HOST gpu@0\nREQUIRES HOST gpu@1")],
  [false, root(image("REQUIRES HOST gpu@0\nUSE https://daugasauron.com/modules/probe.dm PIN(/modules/probe.dm)\n"),
    { "/modules/probe.dm": "DOLLY 5\nMODULE probe\nREQUIRES HOST gpu@1\n" })],
  [true, probe(Array.from({ length: 64 }, (_, index) => `REQUIRES HOST p${index}@0`).join("\n"))],
  [false, probe(Array.from({ length: 65 }, (_, index) => `REQUIRES HOST p${index}@0`).join("\n"))],

  // USE graphs.
  [false, root(image(`USE https://daugasauron.com/modules/probe.dm ${zeros}\n`), { "/modules/probe.dm": "DOLLY 5\nMODULE probe\n" })],
  [false, root(image(`USE https://daugasauron.com/modules/absent.dm ${zeros}\n`))],
  [false, root(image("USE https://daugasauron.com/modules/probe.dm\n"))],
  [false, root(image(`USE https://daugasauron.com/modules/Probe.dm ${zeros}\n`))],
  [false, root(image(`USE https://daugasauron.com/modules/probe.dm?x=1 ${zeros}\n`))],
  [false, root(image("USE HOST /modules/probe.dm PIN(/modules/probe.dm)\n"), { "/modules/probe.dm": "DOLLY 5\nMODULE probe\n" })],
  [true, root(image("USE https://daugasauron.com/other/probe.dm PIN(/other/probe.dm)\n"),
    { "/other/probe.dm": "DOLLY 5\nMODULE probe\n" })],
  [true, root(image("USE https://daugasauron.com/modules/probe.dm PIN(/modules/probe.dm)\n".repeat(2)),
    { "/modules/probe.dm": "DOLLY 5\nMODULE probe\n" })],
  [false, probe("USE https://daugasauron.com/modules/probe.dm PIN(/modules/probe.dm)")],
  [false, probe("USE https://daugasauron.com/modules/other.dm PIN(/modules/other.dm)",
    { "/modules/other.dm": "DOLLY 5\nMODULE other\nUSE https://daugasauron.com/modules/probe.dm PIN(/modules/probe.dm)\n" })],
  [true, root(image("USE https://daugasauron.com/modules/m0.dm PIN(/modules/m0.dm)\n"), chain(15))],
  [false, root(image("USE https://daugasauron.com/modules/m0.dm PIN(/modules/m0.dm)\n"), chain(16))],

  // FROM, COPY and SOURCE.
  [true, root("DOLLY 5\nIMAGE default\nFROM https://daugasauron.com/Dollyfile-base PIN(/Dollyfile-base)\nENTRY /bin/slop\n", base)],
  [false, root("DOLLY 5\nIMAGE default\nSLOP true\nFROM https://daugasauron.com/Dollyfile-base PIN(/Dollyfile-base)\nENTRY /bin/slop\n", base)],
  [false, root("DOLLY 5\nIMAGE default\nFROM https://daugasauron.com/Dollyfile-base PIN(/Dollyfile-base)\nFROM https://daugasauron.com/Dollyfile-base PIN(/Dollyfile-base)\nENTRY /bin/slop\n", base)],
  [false, probe("FROM https://daugasauron.com/Dollyfile-base PIN(/Dollyfile-base)", base)],
  [false, root("DOLLY 5\nIMAGE default\nFROM HOST /Dollyfile-base PIN(/Dollyfile-base)\nENTRY /bin/slop\n", base)],
  [false, root(image(`FROM https://daugasauron.com/Dollyfile-/bad ${zeros}\n`))],
  [false, root(image(`FROM https://daugasauron.com/Dollyfile-${"a".repeat(33)} ${zeros}\n`))],
  [false, root(image(`FROM https://daugasauron.com/Dollyfile-base?x=1 ${zeros}\n`))],
  [false, root(image(`FROM https://Dollyfile-base ${zeros}\n`))],
  [true, root(image("COPY FROM https://daugasauron.com/Dollyfile-base PIN(/Dollyfile-base) /usr /usr\n"), base)],
  [true, root(image("COPY FROM https://daugasauron.com/Dollyfile-base PIN(/Dollyfile-base) / /opt/base\n"), base)],
  [true, probe("COPY FROM https://daugasauron.com/Dollyfile-base PIN(/Dollyfile-base) /usr/bin/a '/usr/bin/a b'", base)],
  [false, root(image("COPY FROM https://daugasauron.com/Dollyfile-base PIN(/Dollyfile-base) /usr /usr/../etc\n"), base)],
  [false, root(image("COPY https://daugasauron.com/Dollyfile-base PIN(/Dollyfile-base) /usr /usr\n"), base)],
  [false, root(image("COPY FROM https://daugasauron.com/Dollyfile-base PIN(/Dollyfile-base) /usr\n"), base)],
  [true, probe(`SOURCE https://daugasauron.com/static/probe.tar ${zeros} /tmp/probe.tar`)],
  [true, probe(`SOURCE https://example.com/probe.tar ${zeros} /tmp/probe.tar`)],
  [true, probe(`SOURCE http://example.com:8080/probe.tar?x=1 ${zeros} /tmp/probe.tar`)],
  [true, probe(`SOURCE https://example.com ${zeros} /tmp/probe.tar`)],
  [false, probe(`SOURCE https://example.com/probe.tar#x ${zeros} /tmp/probe.tar`)],
  [false, probe(`SOURCE 'https://example.com/probe tar' ${zeros} /tmp/probe.tar`)],
  [false, probe(`SOURCE https:///probe.tar ${zeros} /tmp/probe.tar`)],
  [false, probe(`SOURCE file:///host/file ${zeros} /usr/share/file`)],
  [false, probe(`SOURCE /static/probe.tar ${zeros} /tmp/probe.tar`)],
  [false, probe(`SOURCE https://example.com/probe.tar /tmp/probe.tar ${zeros}`)],
  [false, probe(`SOURCE URL https://example.com/probe.tar ${zeros} /tmp/probe.tar`)],
  [false, probe(`SOURCE https://example.com/probe.tar ${zeros} tmp/probe.tar`)],
  [false, probe("SOURCE https://example.com/probe.tar /tmp/probe.tar")],
];

const digest = text => createHash("sha256").update(text).digest("hex");

export function resolvePins(files) {
  const resolved = new Map();
  function text(locator, stack) {
    if (!resolved.has(locator)) {
      const inner = [...stack, locator];
      resolved.set(locator, files[locator].replace(/PIN\((\/[^)]+)\)/g, (_, target) =>
        inner.includes(target) || !(target in files) ? zeros : digest(text(target, inner))));
    }
    return resolved.get(locator);
  }
  return Object.fromEntries(Object.keys(files).map(locator => [locator, text(locator, [])]));
}
