// Builtin-only cases also run under ASan with all external spawning denied.
// Dolly always pops explicit dot arguments, including after set --. Bash can
// retain replacements at top level; those three cases record its different status.
export const sourceFiles = {
  "replace.slop": "set -- new tail\n",
  "shift.slop": "shift\n",
  "return.slop": "set -- changed\nreturn 7\nexit 99\n",
  "nested.slop": ". ./replace.slop inner\ncase $1 in outer) :;; *) exit 91;; esac\n. ./shift.slop\n",
  "invalid.slop": "if :; then\n",
  "Makefile": "CAPTURE := $(shell x=$$(exit 7))\n" +
    "CAPTURE_STATUS := $(.SHELLSTATUS)\n" +
    "all:\n\t@test '$(CAPTURE_STATUS)' = 7\n" +
    "\t@set -- old; . ./replace.slop; test \"$$1\" = new; echo SLOP-MAKE-OK > make-success\n" +
    "fail:\n\t@x=$$(exit 7); echo SHOULD-NOT-RUN > make-failed\n",
};

export const shellCases = [
  ["sourcing shares replacement arguments", "set -- old; . ./replace.slop; case $#:$1:$2 in 2:new:tail) :;; *) exit 91;; esac", 0],
  ["sourcing shares shifted arguments", "set -- old kept; . ./shift.slop; case $1 in kept) :;; *) exit 91;; esac", 0],
  ["explicit source arguments are temporary", "set -- old kept; . ./replace.slop temporary; case $1:$2 in old:kept) :;; *) exit 91;; esac", 0, 91],
  ["explicit source arguments can be shifted", "set -- old; . ./shift.slop first second; case $1 in old) :;; *) exit 91;; esac", 0],
  ["source preserves shell name", "set -- old; . ./replace.slop temporary; case $0 in fixture-zero) :;; *) exit 91;; esac", 0],
  ["nested sources preserve ownership", "set -- outer kept; . ./nested.slop; case $1 in kept) :;; *) exit 91;; esac", 0, 91],
  ["sourced changes remain local to function arguments", "f() { . ./replace.slop; case $1 in new) :;; *) exit 91;; esac; }; set -- old; f arg; case $1 in old) :;; *) exit 91;; esac", 0],
  ["source return status", ". ./return.slop", 7],
  ["source return does not exit caller", ". ./return.slop; case $?:$1 in 7:changed) :;; *) exit 91;; esac", 0],
  ["explicit source return restores arguments", "set -- old; . ./return.slop temporary; case $?:$1 in 7:old) :;; *) exit 91;; esac", 0, 91],
  ["source return does not return from enclosing function", "f() { . ./return.slop; return 9; }; f", 9],
  ["source return triggers errexit", "set -e; . ./return.slop; exit 19", 7],
  ["source syntax error restores explicit arguments", "set -- old; . ./invalid.slop temporary; case $?:$1 in 2:old) :;; *) exit 91;; esac", 0],
  ["missing source fails", ". ./missing.slop", 1],
  ["last substitution is assignment status", "x=$(exit 7)", 7],
  ["assignment failure triggers errexit", "set -e; x=$(exit 7); exit 19", 7],
  ["assignment failure does not force exit without errexit", "x=$(exit 7); exit 19", 19],
  ["last of multiple assignments wins", "a=$(exit 3) b=$(exit 7)", 7],
  ["last substitution in one value wins", "x=$(exit 3)$(exit 8)", 8],
  ["successful last substitution clears failure", "a=$(exit 7) b=$(:)", 0],
  ["ordinary assignment resets substitution status", "a=$(exit 7); b=plain", 0],
  ["nested substitution status", "x=$(y=$(exit 9))", 9],
  ["empty substitution succeeds", "(exit 4); x=$()", 0],
  ["comment-only substitution succeeds", "(exit 4); x=$(# comment\n)", 0],
  ["substitution exit inherits prior status", "(exit 4); x=$(exit)", 4],
  ["backtick substitution status", "x=`exit 6`", 6],
  ["empty expanded command retains substitution status", "$(exit 8)", 8],
  ["ordinary command owns its status", ": $(exit 7)", 0],
  ["export owns its status", "export x=$(exit 7)", 0],
  ["function owns its status", "f() { return 4; }; f $(exit 7)", 4],
  ["substitution status reaches later expansions", "(exit 4); x=$(exit 7) y=$?; case $?:$y in 7:7) :;; *) exit 91;; esac", 0],
  ["status expansion follows word order", "(exit 4); x=$?:$(exit 7):$?; case $x in 4::7) :;; *) exit 91;; esac", 0],
  ["implicit exit uses substitution status", "(exit 4); exit $(exit 7)", 7],
  ["skipped parameter fallback does not substitute", "value=set; x=${value:-$(exit 7)}", 0],
  ["used parameter fallback retains status", "unset value; x=${value:-$(exit 7)}", 7],
  ["conditionals handle assignment failure", "set -e; if x=$(exit 7); then exit 91; else :; fi", 0],
  ["or-list handles assignment failure", "set -e; x=$(exit 7) || :; exit 19", 19],
  ["and-list skips after assignment failure", "x=$(exit 7) && exit 91", 7],
  ["outer errexit is not inherited by substitution", "f() { return 7; }; set -e; x=$(f; :); exit 19", 19],
  ["substitution can explicitly enable errexit", "x=$(set -e; y=$(exit 7); exit 19)", 7],
  ["assignment redirection preserves substitution status", "x=$(exit 7) > result", 7],
  ["redirection error overrides substitution status", "x=$(exit 7) > missing-directory/result", 1],
  ["redirection-only substitution status", "> $(exit 7)result", 7],
  ["heredoc-only substitution status", "<<EOF\n$(exit 5)\nEOF\n", 5],
  ["quoted heredoc does not substitute", "<<'EOF'\n$(exit 5)\nEOF\n", 0],
];

export function shellQuote(value) { return `'${value.replaceAll("'", "'\\''")}'`; }
