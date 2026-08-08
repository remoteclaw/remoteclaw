// Fixture: the shortlink table parses, but yields zero entries.
//
// This is the failure #3160's review comment asked for by name. A seeded leak
// proves the *matcher* works; it says nothing about the *vocabulary*. If an
// upstream sync empties or reshapes this table, a gate without a cardinality
// floor checks nothing and prints a healthy pass — byte-indistinguishable from a
// real one. The same shape has now bitten this repo three times (#3138's stub
// walk, the dangling `tooling-config-refs` paths, and a shell-eaten `\b` in a
// gut-reversion sweep), so the floor is not hypothetical hardening.
const DOCS_ROOT_SEGMENTS = new Set(["web"]);

const DOCS_SHORTLINK_PATHS = new Set([]);

export { DOCS_ROOT_SEGMENTS, DOCS_SHORTLINK_PATHS };
