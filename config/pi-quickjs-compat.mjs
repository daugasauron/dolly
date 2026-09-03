// Pi 0.84.4's TUI uses six ECMAScript Unicode-set (`v`) regular expressions.
// QuickJS-ng 0.15.0 cannot parse that flag yet. Keep the finite compatibility
// decision here so Dolly's target-side post-emit step applies one exact,
// asserted lowering without changing the pinned upstream source tree. The
// bundle form remains only for reproducibility of older image audits.
const loweredUnicodeSets = new Map([
  ["zeroWidthRegex", String.raw`/^(?:\p{Cf}|\p{Cc}|\p{Mark}|\p{Cs})+$/u`],
  ["leadingNonPrintingRegex", String.raw`/^[\p{Cf}\p{Cc}\p{Mark}\p{Cs}]+/u`],
  ["nonPrintingCharRegex", String.raw`/^(?:\p{Cf}|\p{Cc}|\p{Mark}|\p{Cs})$/u`],
  ["markCharRegex", String.raw`/^\p{Mark}$/u`],
  ["terminalSpacingMarkRegex", String.raw`/^(?:(?![\u1734\u302E\u302F])\p{Mc}|[\u065F\u0F7F\u102B\u102C\u1031\u1033-\u1035\u1038\u103A-\u103E])+$/u`],
  ["rgiEmojiRegex", String.raw`/^(?:[0-9#*]\uFE0F?\u20E3|[\u{1F1E6}-\u{1F1FF}]{2}|[\u2600-\u27BF\u{1F000}-\u{1FAFF}](?:\uFE0F|[\u{1F3FB}-\u{1F3FF}])?(?:\u200D[\u2600-\u27BF\u{1F000}-\u{1FAFF}](?:\uFE0F|[\u{1F3FB}-\u{1F3FF}])?)*)$/u`],
]);

export function lowerPiQuickJs(source, form) {
  if (form !== "bundle" && form !== "source") {
    throw new Error(`unknown Pi compatibility form: ${form}`);
  }

  const declarationKind = form === "bundle" ? "var" : "const";
  const expectedEnding = form === "bundle" ? '", "v");' : "/v;";
  for (const [name, replacement] of loweredUnicodeSets) {
    const declaration = new RegExp(`^${declarationKind} ${name} = .+;$`, "m");
    const matches = source.match(new RegExp(declaration.source, "gm")) ?? [];
    if (matches.length !== 1 || !matches[0].endsWith(expectedEnding)) {
      throw new Error(`Pi's ${name} Unicode-set expression changed upstream`);
    }
    source = source.replace(
      declaration,
      `${declarationKind} ${name} = ${replacement};`,
    );
  }

  const unlowered = form === "bundle"
    ? /new RegExp\([^\n]+, "v"\)/
    : /\/v;/;
  if (unlowered.test(source)) {
    throw new Error("Pi contains an unlowered Unicode-set expression");
  }
  return source;
}
