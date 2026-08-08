// Fixture: the shortlink declaration is gone entirely.
//
// This is what a real upstream restructure looks like from the gate's side —
// the table renamed, inlined, or moved to another module. The gate must throw
// and name the missing declaration, not fall back to "found nothing, all clear".
// A parser that returns `[]` on a shape it no longer recognizes is the same
// vacuous pass as an empty vocabulary, arrived at one step earlier.
const DOCS_ROOT_SEGMENTS = new Set(["web"]);

export { DOCS_ROOT_SEGMENTS };
