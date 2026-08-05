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
//        instead of resolving a name — probed against the system dig(1) with a
//        loopback listener, `dig … @127.0.0.1 -f/etc/passwd SRV` sent the
//        contents of /etc/passwd to the nameserver, one query per token. For
//        ssh(1), `-oProxyCommand=…` is documented remote code execution.
//   '+'  dig(1) only. '+' introduces options, so a value like '+tcp' in the
//        query-name slot is consumed as one: the same loopback probe showed
//        `dig … @127.0.0.1 +tcp SRV` switching to TCP and collapsing the query
//        name to "." ("Connection to 127.0.0.1#5354(127.0.0.1) for . failed").
//        Reachable — dig prints a PTR answer whose first label is '+' verbatim.
//   '%'  dig(1) only. Same class as '+' and strictly less impact: dig discards a
//        leading-'%' positional silently, so `dig … @127.0.0.1 %evil SRV`
//        collapses to a root ". IN NS" query. Also reachable — '%' is printed
//        bare. NOT a redirect: that query still goes to the ALREADY-PINNED
//        nameserver, `parseDigSrv` rejects the non-SRV answer, and the record
//        drops itself. Driven through the producer against /usr/bin/dig, no
//        beacon resulted. Rejected because an operand slot should carry the name
//        it was handed, not because anything is redirected.
//   '@'  dig(1) only, and defence-in-depth rather than a demonstrated path.
//        DiG 9.10.6 ESCAPES '@' when it prints a name: a PTR answer whose first
//        label is "@evil" comes back as "\@evil…", which starts with '\', never
//        trips this predicate, and which dig then reads as an ordinary 5-label
//        name sent to the pinned nameserver. Driven through the producer against
//        /usr/bin/dig, that is exactly what happened. A DNS server therefore
//        cannot make `dig +short … PTR` emit a bare leading '@'. The check stays
//        as cheap insurance against a dig earlier on PATH that does not escape
//        '@'; only DiG 9.10.6 was probed, so that escaping is untested
//        elsewhere rather than known to be universal.
//
// Correcting the record on '@', since an earlier revision of this comment had it
// wrong: `@127.0.0.2 @127.0.0.1` landing on the second '@' is NOT "the last one
// wins" — nothing was listening on .2. dig keeps an ORDERED server list and
// falls back only on failure. With two responsive loopback listeners,
// `@127.0.0.1 @::1` delivered to 127.0.0.1 and `@::1 @127.0.0.1` delivered to
// ::1 — the first '@' both times. A trailing '@' could take over only if the
// pinned nameserver failed first.
//
// Hence two predicates, and callers pick by the tool they are about to spawn:
//
//   `isArgvOptionLike`   Leading '-' only. The narrow shared primitive, used by
//                        `isUnsafeSshHost` (ssh) and by the dns-sd producer.
//   `isUnsafeDigOperand` Composes the primitive and adds dig's '+', '%' and '@'.
//                        Used by the dig producer path only.
//
// The dig prefixes are deliberately NOT folded into the shared primitive: '+',
// '%' and '@' introduce nothing for ssh(1) or dns-sd, so rejecting them there
// would drop well-formed input for no security gain, and would silently change
// the behaviour of the ssh host guard — the higher-severity surface of the two.
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
 * True when `value` must not occupy a dig(1) operand slot: an option ('-'), a
 * dig option ('+'), a discarded positional ('%'), or a nameserver selector
 * ('@').
 */
export function isUnsafeDigOperand(value: string): boolean {
  return (
    isArgvOptionLike(value) ||
    value.startsWith("+") ||
    value.startsWith("%") ||
    value.startsWith("@")
  );
}
