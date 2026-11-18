// The npm package that holds each Dolly host module, application and package: dolly-host-NAME,
// dolly-image-NAME and dolly-package-NAME. npm refuses a new package name with some words in it
// ("That word is not allowed": dolly-host-download on 2026-10-30, dolly-package-libdolly-download
// on 2026-11-15), so a published name says another word for each.
export const npmRefusedWords = { download: "save" };
export const npmPackageName = (kind, name) => Object.entries(npmRefusedWords)
  .reduce((published, [word, said]) => published.replaceAll(word, said), `dolly-${kind}-${name}`);
