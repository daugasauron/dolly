// The one order of every list a visitor reads on the site's pages: by the
// visible name, ignoring case. Names that differ only in case keep one order.
const collator = new Intl.Collator("en", { sensitivity: "base" });
export const alphabetical = (left, right) => collator.compare(left, right) || (left < right ? -1 : left > right ? 1 : 0);
