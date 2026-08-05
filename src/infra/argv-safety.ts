// Rejects values that a spawned tool would read as syntax rather than as the
// plain operand the argv slot is meant to carry.
//
// Nothing here spawns through a shell (`shouldSpawnWithShell` returns false and
// callers pass an argv array), so quoting and shell metacharacters are not the
// risk. The risk is positional: a value occupies an operand slot, the tool
// parses it as syntax instead, and then does whatever that syntax means.
//
// The dangerous prefix set is TOOL-DEPENDENT — there is no single universal
// "unsafe operand" shape:
//
//   '-'  Every tool here. `dig +short -f<file> NS` reads <file> as a query list
//        instead of resolving a name; for ssh(1), `-oProxyCommand=…` is
//        documented remote code execution.
//   '@'  dig(1) only, and not a mere parse quirk: '@' selects the nameserver,
//        positionally, and the LAST one wins. Probed against the system dig(1)
//        with a loopback listener — `dig +short -p 5354 @127.0.0.2 @127.0.0.1
//        <name> SRV` delivered the datagram to 127.0.0.1, the second '@'. So an
//        '@'-prefixed value landing after an already-pinned nameserver
//        re-points the query at an arbitrary host:53.
//   '+'  dig(1) only. '+' introduces options, so a value like '+tcp' in the
//        query-name slot is consumed as one. The same probe showed
//        `dig … @127.0.0.1 +tcp SRV` switching to TCP and collapsing the query
//        name to ".".
//
// Hence two predicates, and callers pick by the tool they are about to spawn:
//
//   `isArgvOptionLike`   Leading '-' only. The narrow shared primitive, used by
//                        `isUnsafeSshHost` (ssh) and by the dns-sd producer.
//   `isUnsafeDigOperand` Composes the primitive and adds dig's '@' and '+'.
//                        Used by the dig producer path only.
//
// The dig prefixes are deliberately NOT folded into the shared primitive: '@'
// and '+' introduce nothing for ssh(1) or dns-sd, so rejecting them there would
// drop well-formed input for no security gain, and would silently change the
// behaviour of the ssh host guard — the higher-severity surface of the two.
//
// Both stay deliberately narrow, and deliberately NOT a hostname or DNS-name
// grammar. Callers carry values that legitimately contain spaces, apostrophes
// and non-ASCII — mDNS instance names are free-form UTF-8 (RFC 6763 §4.1.1) and
// ssh_config aliases are user-defined — so anything stricter would reject
// well-formed input while still reading as "hardened". Only the LEADING
// character is structural; the same characters are ordinary in any interior
// position.

/** True when `value` would be parsed as an option in an argv operand slot. */
export function isArgvOptionLike(value: string): boolean {
  return value.startsWith("-");
}

/**
 * True when `value` must not occupy a dig(1) operand slot: an option ('-'),
 * a nameserver selector ('@'), or a dig option ('+').
 */
export function isUnsafeDigOperand(value: string): boolean {
  return isArgvOptionLike(value) || value.startsWith("@") || value.startsWith("+");
}
