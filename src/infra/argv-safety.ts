// Rejects values that a spawned tool would read as an option, not as an operand.
//
// Nothing here spawns through a shell (`shouldSpawnWithShell` returns false and
// callers pass an argv array), so quoting and shell metacharacters are not the
// risk. The risk is positional: a value that begins with '-' occupies an operand
// slot but is parsed as a flag, and the tool then does whatever that flag does.
// Verified against the system dig(1) — `dig +short -f<file> NS` reads <file> as a
// query list instead of resolving a name.
//
// Deliberately narrow, and deliberately NOT a hostname or DNS-name grammar.
// Callers carry values that legitimately contain spaces, apostrophes and
// non-ASCII — mDNS instance names are free-form UTF-8 (RFC 6763 §4.1.1) and
// ssh_config aliases are user-defined — so anything stricter would reject
// well-formed input while still reading as "hardened". Only the leading '-'
// is structurally dangerous in an argv operand slot.

/** True when `value` would be parsed as an option in an argv operand slot. */
export function isArgvOptionLike(value: string): boolean {
  return value.startsWith("-");
}
