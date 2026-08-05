// Rejects hostnames that ssh(1) would not treat as a host.
//
// A leading '-' is the dangerous case: ssh parses the argument as an option, so
// a host of "-oProxyCommand=..." becomes remote code execution. That check is
// shared with the other argv producers via `isArgvOptionLike` rather than
// restated here, so there is one definition of "reads as an option". A leading or
// trailing ':' produces an invalid HostName (e.g. sliced from "host::22"), and
// whitespace cannot appear in a hostname at all, so its presence means the
// value was mangled or injected somewhere upstream. An empty host is rejected
// here too, so callers get one guard rather than a separate emptiness check.
//
// Deliberately NOT a full hostname/IP grammar allowlist. ssh_config aliases are
// user-defined and may legitimately contain characters a strict grammar would
// reject, so this stays a denylist of the shapes that are actually dangerous or
// structurally invalid.

import { isArgvOptionLike } from "./argv-safety.js";

const HOST_WHITESPACE_PATTERN = /\s/;

/** True when `host` must not be used as an SSH host. */
export function isUnsafeSshHost(host: string): boolean {
  return (
    host.length === 0 ||
    isArgvOptionLike(host) ||
    host.startsWith(":") ||
    host.endsWith(":") ||
    HOST_WHITESPACE_PATTERN.test(host)
  );
}
