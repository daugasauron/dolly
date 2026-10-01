import { createHash } from "node:crypto";

// Recipes that /bin/dollyfile and the JavaScript recipe graph must both accept
// or both reject. Each case maps paths on the canonical origin to text;
// /Dollyfile is the root. PIN(/path) stands for the SHA-256 of that file once
// its own pins resolve.
// C imports FROM/INSTALL/COPY targets as built artifacts and checks their
// roles then; every target here is valid syntactically.
const zeros = "0".repeat(64);
const image = (rows = "") => `DOLLY 6\nAPPLICATION default\n${rows}ENTRY /bin/slop\n`;
const root = (text, files = {}) => ({ "/Dollyfile": text, ...files });
// Rows inside a package root: every directive but FROM and ENTRY.
const probe = rows => root(`DOLLY 6\nPACKAGE default\n${rows}\n`);
const base = { "/Dollyfile-base": "DOLLY 6\nTOOLCHAIN base\nENTRY /bin/slop\n" };
const pkg = { "/Dollyfile-pkg": "DOLLY 6\nPACKAGE pkg\nFILE /usr/share/pkg\n" };
const words = (count, size = 1) => Array.from({ length: count }, () => "a".repeat(size)).join(" ");

export const syntaxCases = [
  // Header, roles, names and ENTRY.
  [true, root(image())],
  [false, root("")],
  [false, root("DOLLY 5\nAPPLICATION default\nENTRY /bin/slop\n")],
  [false, root("DOLLY 7\nAPPLICATION default\nENTRY /bin/slop\n")],
  [false, root('DOLLY "6"\nAPPLICATION default\nENTRY /bin/slop\n')],
  [true, root("# comment\n\nDOLLY  6 # version\nAPPLICATION  default\nENTRY /bin/slop\n")],
  [false, root("DOLLY 6\nDOLLY 6\nAPPLICATION default\nENTRY /bin/slop\n")],
  [false, root("APPLICATION default\nENTRY /bin/slop\n")],
  [false, root("DOLLY 6\nIMAGE default\nENTRY /bin/slop\n")],
  [false, root("DOLLY 6\nMODULE default\n")],
  [true, root('DOLLY 6\nAPPLICATION "default"\nENTRY /bin/slop\n')],
  [false, root("DOLLY 6\nAPPLICATION Default\nENTRY /bin/slop\n")],
  [true, root(`DOLLY 6\nAPPLICATION ${"a".repeat(32)}\nENTRY /bin/slop\n`)],
  [false, root(`DOLLY 6\nAPPLICATION ${"a".repeat(33)}\nENTRY /bin/slop\n`)],
  ...["qwen3.5-4b", "lua5.5", "qwen2.5-coder", "llama3.2-3b", "gemma-3n", "python3.14", "lua5.4.6-rc1"]
    .map(name => [true, root(`DOLLY 6\nAPPLICATION ${name}\nENTRY /bin/slop\n`)]),
  ...["example.txt", "a.b", "qwen3.5b", "a.5b", "a..5", "a-", "a.", "-a", "a--b", "a-.5", "a.5.", "a_b"]
    .map(name => [false, root(`DOLLY 6\nAPPLICATION ${name}\nENTRY /bin/slop\n`)]),
  [false, root("DOLLY 6\nENTRY /bin/slop\nAPPLICATION default\n")],
  [false, root("DOLLY 6\nAPPLICATION default\nAPPLICATION other\nENTRY /bin/slop\n")],
  [false, root("DOLLY 6\nAPPLICATION default\nTOOLCHAIN other\nENTRY /bin/slop\n")],
  [false, root("DOLLY 6\nAPPLICATION default\n")],
  [true, root("DOLLY 6\nTOOLCHAIN default\nENTRY /bin/slop\n")],
  [true, root("DOLLY 6\nTOOLCHAIN default\nSLOP true\n")],
  [true, root("DOLLY 6\nPACKAGE default\nSLOP true\n")],
  [true, root("DOLLY 6\nPACKAGE default\n")],
  [false, root("DOLLY 6\nPACKAGE default\nENTRY /bin/slop\n")],
  [false, root(image() + "SLOP true\n")],
  [true, root(image() + "\n# done\n")],
  [false, root(image("ENTRY /bin/slop\n"))],
  [false, root("DOLLY 6\nAPPLICATION default\nENTRY bin/slop\n")],
  [false, root("DOLLY 6\nAPPLICATION default\nENTRY\n")],
  [true, root('DOLLY 6\nAPPLICATION default\nENTRY /bin/slop ""\n')],
  [true, root(`DOLLY 6\nAPPLICATION default\nENTRY /bin/slop ${words(255)}\n`)],
  [false, root(`DOLLY 6\nAPPLICATION default\nENTRY /bin/slop ${words(256)}\n`)],
  [true, root(`DOLLY 6\nAPPLICATION default\nENTRY /bin/slop ${words(1, 4096)}\n`)],
  [false, root(`DOLLY 6\nAPPLICATION default\nENTRY /bin/slop ${words(1, 4097)}\n`)],
  [true, root(`DOLLY 6\nAPPLICATION default\nENTRY /bin/slop ${words(15, 4096)} ${words(1, 4000)}\n`)],
  [false, root(`DOLLY 6\nAPPLICATION default\nENTRY /bin/slop ${words(15, 4096)} ${words(1, 4050)}\n`)],

  // Physical and logical lines.
  [true, probe("SLOP cc \\\n  input.c")],
  [true, probe("SLOP cc \\ # comment\n  input.c")],
  [true, probe("SLOP cc \\ \t\n  input.c")],
  [false, probe("SLOP cc \\")],
  [false, probe("SLOP cc \\\n# comment\n  input.c")],
  [true, probe("# comment \\\nSLOP true")],
  [false, probe('FILE "/usr/share/a \\\nb" # quoted per line')],
  [true, probe("SLOP cc \\\n\nSLOP true")],
  [true, probe("SLOP printf '%s' \\\\ \\\n  done")],
  [true, root("DOLLY 6\r\nAPPLICATION default\r\nSLOP cc \\\r\n  x\r\nFILE /usr/share/a\r\n    body\r\nENTRY /bin/slop\r\n")],
  [true, root("DOLLY 6\rAPPLICATION default\rFILE /usr/share/a\r    body\rENTRY /bin/slop")],
  [true, probe(`SLOP ${"a".repeat(65531)}`)],
  [false, probe(`SLOP ${"a".repeat(65532)}`)],
  [false, probe(`SLOP ${"a".repeat(32766)} \\\n${"a".repeat(32766)}`)],
  [true, root(image("# buffered input\n".repeat(6000)))],
  [false, root(image("# buffered input\n".repeat(8192)))],
  [false, probe("SLOP true\0")],
  [false, probe("# comment\0")],
  [false, root(image("FILE /usr/share/a\n    body\0\n"))],
  [false, probe("USE https://daugasauron.com/modules/probe.dm " + zeros)],
  [false, probe("COMPILEC /tmp/slop/slop.c /bin/slop")],
  [false, probe("slop true")],

  // FILE bodies.
  [true, probe("FILE /usr/share/a\n    alpha\n      beta\n    \nSLOP printf done")],
  [false, probe("FILE /usr/share/a\n    alpha\n\n    beta")],
  [false, probe("FILE /usr/share/a\n\talpha")],
  [true, probe("FILE /usr/share/a\n    # literal \\\n    'unbalanced\n    \tindented")],
  [true, probe("FILE /usr/share/a \\\n  # continued path line\n    body")],
  [true, root("DOLLY 6\nPACKAGE default\nFILE /usr/share/a\n    last line")],
  [false, probe("FILE\n    body")],
  [false, probe("FILE /usr/share/a /usr/share/b")],
  [true, probe('FILE "/usr/share/a b"')],
  [false, probe("FILE /usr/share/a b")],
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

  // Words, SLOP and RUN.
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
  [true, probe("RUN /usr/libexec/dolly/process-bin/compiler --dolly-toolchain-mode=c -O1 /tmp/slop/slop.c -o /bin/slop")],
  [true, probe("RUN /bin/true")],
  [true, probe('RUN CWD /usr/src "/bin/a b" "" x')],
  [true, probe(`RUN /bin/true ${words(255)}`)],
  [false, probe(`RUN /bin/true ${words(256)}`)],
  [false, probe(`RUN /bin/true ${words(1, 4097)}`)],
  [false, probe("RUN")],
  [false, probe("RUN true")],
  [false, probe("RUN CWD /usr")],
  [false, probe("RUN CWD relative /bin/true")],
  [false, probe("RUN /bin/")],

  // EXPORTS and REQUIRES.
  [true, probe('EXPORTS ENV DOLLY_TEST_VALUE "APPEND literal"')],
  [true, probe("EXPORTS ENV DOLLY_TEST_VALUE APPEND")],
  [false, probe("EXPORTS ENV DOLLY_TEST_VALUE")],
  [true, probe("EXPORTS ENV PATH APPEND /opt/probe/bin")],
  [false, probe("EXPORTS ENV DOLLY_TEST_VALUE APPEND extra words")],
  [false, probe("EXPORTS ENV DOLLY_TEST_VALUE one two")],
  [false, probe("EXPORTS ENV 1BAD value")],
  [true, probe("EXPORTS TOOL cc")],
  [true, probe("EXPORTS TOOL [")],
  [false, probe(`EXPORTS TOOL cc ${zeros}`)],
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
  [false, probe("REQUIRES TOOL slop")],
  [false, probe("REQUIRES cc")],
  [false, probe("REQUIRES linecount linecount")],
  [false, probe("REQUIRES TOOL cc extra")],

  // Host requirements.
  [true, probe("REQUIRES HOST gpu@0\nREQUIRES HOST http@0\nREQUIRES HOST gpu@0")],
  [true, probe(`REQUIRES HOST ${"a".repeat(31)}@65535`)],
  ...["gpu", "gpu@01", "GPU@0", "gpu@-1", "gpu@65536", "@0", "gpu@0@1", `${"a".repeat(32)}@0`, "gpu@0 extra", ""]
    .map(value => [false, probe(`REQUIRES HOST ${value}`)]),
  [false, probe("REQUIRES HOST gpu@0\nREQUIRES HOST gpu@1")],
  [true, probe(Array.from({ length: 64 }, (_, index) => `REQUIRES HOST p${index}@0`).join("\n"))],
  [false, probe(Array.from({ length: 65 }, (_, index) => `REQUIRES HOST p${index}@0`).join("\n"))],
  // The manifest follows the role line: nothing precedes a REQUIRES HOST line.
  [true, probe("REQUIRES HOST gpu@0\nEXPORTS TOOL cc\nREQUIRES TOOL cc")],
  [false, probe("EXPORTS TOOL cc\nREQUIRES HOST gpu@0")],
  [false, probe("REQUIRES TOOL cc\nREQUIRES HOST gpu@0")],
  [false, root("DOLLY 6\nAPPLICATION default\nFROM https://daugasauron.com/Dollyfile-base PIN(/Dollyfile-base)\nREQUIRES HOST gpu@0\nENTRY /bin/slop\n", base)],

  // FROM, INSTALL, COPY and SOURCE.
  [true, root("DOLLY 6\nAPPLICATION default\nFROM https://daugasauron.com/Dollyfile-base PIN(/Dollyfile-base)\nENTRY /bin/slop\n", base)],
  [true, root("DOLLY 6\nPACKAGE default\nFROM https://daugasauron.com/Dollyfile-base PIN(/Dollyfile-base)\nFILE /usr/share/a\n", base)],
  [false, root("DOLLY 6\nAPPLICATION default\nSLOP true\nFROM https://daugasauron.com/Dollyfile-base PIN(/Dollyfile-base)\nENTRY /bin/slop\n", base)],
  [false, root("DOLLY 6\nAPPLICATION default\nFROM https://daugasauron.com/Dollyfile-base PIN(/Dollyfile-base)\nFROM https://daugasauron.com/Dollyfile-base PIN(/Dollyfile-base)\nENTRY /bin/slop\n", base)],
  [false, root("DOLLY 6\nAPPLICATION default\nFROM HOST /Dollyfile-base PIN(/Dollyfile-base)\nENTRY /bin/slop\n", base)],
  [false, root(image(`FROM https://daugasauron.com/Dollyfile-/bad ${zeros}\n`))],
  [false, root(image(`FROM https://daugasauron.com/Dollyfile-${"a".repeat(33)} ${zeros}\n`))],
  [false, root(image(`FROM https://daugasauron.com/Dollyfile-base?x=1 ${zeros}\n`))],
  [false, root(image(`FROM https://Dollyfile-base ${zeros}\n`))],
  [true, root(image("INSTALL https://daugasauron.com/Dollyfile-pkg PIN(/Dollyfile-pkg)\n"), pkg)],
  [true, root(image("SLOP true\nINSTALL https://daugasauron.com/Dollyfile-pkg PIN(/Dollyfile-pkg)\n".repeat(2)), pkg)],
  [true, root("DOLLY 6\nPACKAGE default\nINSTALL https://daugasauron.com/Dollyfile-pkg PIN(/Dollyfile-pkg)\n", pkg)],
  [false, root(image("INSTALL https://daugasauron.com/Dollyfile-pkg\n"), pkg)],
  [false, root(image("INSTALL https://daugasauron.com/Dollyfile-pkg PIN(/Dollyfile-pkg) / /\n"), pkg)],
  [false, root(image("INSTALL https://daugasauron.com/pkg.dm PIN(/Dollyfile-pkg)\n"), pkg)],
  [true, root(image("COPY https://daugasauron.com/Dollyfile-base PIN(/Dollyfile-base) /usr /usr\n"), base)],
  [true, root(image("COPY https://daugasauron.com/Dollyfile-pkg PIN(/Dollyfile-pkg) /usr/share/pkg /opt/pkg\n"), pkg)],
  [true, root(image("COPY https://daugasauron.com/Dollyfile-base PIN(/Dollyfile-base) / /opt/base\n"), base)],
  [true, root("DOLLY 6\nPACKAGE default\nCOPY https://daugasauron.com/Dollyfile-base PIN(/Dollyfile-base) /usr/bin/a '/usr/bin/a b'\n", base)],
  [false, root(image("COPY https://daugasauron.com/Dollyfile-base PIN(/Dollyfile-base) /usr /usr/../etc\n"), base)],
  [false, root(image("COPY FROM https://daugasauron.com/Dollyfile-base PIN(/Dollyfile-base) /usr /usr\n"), base)],
  [false, root(image("COPY https://daugasauron.com/Dollyfile-base PIN(/Dollyfile-base) /usr\n"), base)],
  // URL paths are normalized: a parser would resolve these segments elsewhere.
  [false, root("DOLLY 6\nAPPLICATION default\nFROM https://daugasauron.com/./Dollyfile-base PIN(/Dollyfile-base)\nENTRY /bin/slop\n", base)],
  [false, root(image("COPY https://daugasauron.com//Dollyfile-base PIN(/Dollyfile-base) /usr /usr\n"), base)],
  [false, probe(`SOURCE https://example.com/a/%2E%2e/probe.tar ${zeros} /tmp/probe.tar`)],
  [true, probe(`SOURCE https://example.com/a/.../?x=//.. ${zeros} /tmp/probe.tar`)],
  [true, probe(`SOURCE https://daugasauron.com/dist/static/probe.tar ${zeros} /tmp/probe.tar`)],
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
