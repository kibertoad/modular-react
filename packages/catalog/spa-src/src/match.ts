// Hand-rolled match function — replaces what MiniSearch/Fuse would do.
// For catalogs of typical size (low thousands of entries) this is
// imperceptibly fast and avoids a third dependency.

const SEPARATOR_PATTERN = /[\s\-_./]+/;

function tokenize(s: string): string[] {
  return s.toLowerCase().trim().split(SEPARATOR_PATTERN).filter(Boolean);
}

/**
 * Returns true when every term in `query` matches at least one of the
 * provided searchable fields. Match is substring on the tokenized form,
 * so "user profile" matches "user-profile" and vice versa.
 */
export function matchEntry(query: string, fields: readonly (string | undefined)[]): boolean {
  if (!query.trim()) return true;
  const haystack = fields
    .filter((f): f is string => typeof f === "string" && f.length > 0)
    .map((f) => tokenize(f).join(" "))
    .join(" ");
  const terms = tokenize(query);
  return terms.every((term) => haystack.includes(term));
}
