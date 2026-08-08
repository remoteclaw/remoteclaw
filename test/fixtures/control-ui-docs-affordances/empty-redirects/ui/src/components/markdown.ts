// Fixture: the Control UI tables are populated, but the redirects map is empty.
//
// The other half of the cardinality floor. 105 of this repo's 147 shortlinks
// resolve only through a redirect, so an empty map does not merely lose a little
// signal — it inverts the gate's verdict wholesale, and it inverts it toward
// noise rather than silence. Without the floor the run would report ~105 fresh
// dangling targets and read as a catastrophic regression in the Control UI,
// sending a reviewer to fix link tables that never changed.
const DOCS_ROOT_SEGMENTS = new Set(["web"]);

const DOCS_SHORTLINK_PATHS = new Set(["/control-ui", "/web/dashboard"]);

export { DOCS_ROOT_SEGMENTS, DOCS_SHORTLINK_PATHS };
