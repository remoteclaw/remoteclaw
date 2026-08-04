// Parses npm registry specs into package, version, and tag references.
import { normalizeLowercaseStringOrEmpty } from "@remoteclaw/normalization-core/string-coerce";

const EXACT_SEMVER_VERSION_RE =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;
const REMOTECLAW_STABLE_CORRECTION_VERSION_RE =
  /^(?<year>\d{4})\.(?<month>[1-9]\d?)\.(?<patch>[1-9]\d*)-(?<correction>[1-9]\d*)$/;
const REMOTECLAW_STABLE_VERSION_RE = /^(?<year>\d{4})\.(?<month>[1-9]\d?)\.(?<patch>[1-9]\d*)$/;
const REMOTECLAW_ALPHA_VERSION_RE =
  /^(?<year>\d{4})\.(?<month>[1-9]\d?)\.(?<patch>[1-9]\d*)-alpha\.(?<alpha>[1-9]\d*)$/;
const REMOTECLAW_BETA_VERSION_RE =
  /^(?<year>\d{4})\.(?<month>[1-9]\d?)\.(?<patch>[1-9]\d*)-beta\.(?<beta>[1-9]\d*)$/;
const DIST_TAG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Parsed monthly patch RemoteClaw release version used for channel-aware ordering. */
type RemoteClawReleaseVersion = {
  channel: "alpha" | "beta" | "stable";
  year: number;
  month: number;
  patch: number;
  alphaNumber?: number;
  betaNumber?: number;
  correctionNumber?: number;
};

/**
 * Parsed registry-only npm spec accepted by plugin install flows.
 * Selectors are limited to exact versions and dist-tags; URL/git/file specs
 * are rejected before they can execute on the gateway host.
 */
export type ParsedRegistryNpmSpec = {
  name: string;
  raw: string;
  selector?: string;
  selectorKind: "none" | "exact-version" | "tag";
  selectorIsPrerelease: boolean;
};

function parseRegistryNpmSpecInternal(
  rawSpec: string,
): { ok: true; parsed: ParsedRegistryNpmSpec } | { ok: false; error: string } {
  const spec = rawSpec.trim();
  if (!spec) {
    return { ok: false, error: "missing npm spec" };
  }
  if (/\s/.test(spec)) {
    return { ok: false, error: "unsupported npm spec: whitespace is not allowed" };
  }
  // Registry-only: no URLs, git, file, or alias protocols.
  // Keep strict: this runs on the gateway host.
  if (spec.includes("://")) {
    return { ok: false, error: "unsupported npm spec: URLs are not allowed" };
  }
  if (spec.includes("#")) {
    return { ok: false, error: "unsupported npm spec: git refs are not allowed" };
  }
  if (spec.includes(":")) {
    return { ok: false, error: "unsupported npm spec: protocol specs are not allowed" };
  }

  const at = spec.lastIndexOf("@");
  const hasSelector = at > 0;
  const name = hasSelector ? spec.slice(0, at) : spec;
  const selector = hasSelector ? spec.slice(at + 1) : "";

  // Accept only registry package names; file paths, aliases, and URL/git specs are intentionally
  // rejected before this point because plugin installs run on the gateway host.
  const unscopedName = /^[a-z0-9][a-z0-9-._~]*$/;
  const scopedName = /^@[a-z0-9][a-z0-9-._~]*\/[a-z0-9][a-z0-9-._~]*$/;
  const isValidName = name.startsWith("@") ? scopedName.test(name) : unscopedName.test(name);
  if (!isValidName) {
    return {
      ok: false,
      error: "unsupported npm spec: expected <name> or <name>@<version> from the npm registry",
    };
  }
  if (!hasSelector) {
    return {
      ok: true,
      parsed: {
        name,
        raw: spec,
        selectorKind: "none",
        selectorIsPrerelease: false,
      },
    };
  }
  if (!selector) {
    return { ok: false, error: "unsupported npm spec: missing version/tag after @" };
  }
  if (/[\\/]/.test(selector)) {
    return { ok: false, error: "unsupported npm spec: invalid version/tag" };
  }
  const exactVersionMatch = EXACT_SEMVER_VERSION_RE.exec(selector);
  if (exactVersionMatch) {
    return {
      ok: true,
      parsed: {
        name,
        raw: spec,
        selector,
        selectorKind: "exact-version",
        selectorIsPrerelease:
          Boolean(exactVersionMatch[4]) && !isRemoteClawStableCorrectionVersion(selector),
      },
    };
  }
  if (!DIST_TAG_RE.test(selector)) {
    return {
      ok: false,
      error: "unsupported npm spec: use an exact version or dist-tag (ranges are not allowed)",
    };
  }
  return {
    ok: true,
    parsed: {
      name,
      raw: spec,
      selector,
      selectorKind: "tag",
      selectorIsPrerelease: false,
    },
  };
}

/** Parses a registry-only npm package spec into package name and optional selector metadata. */
export function parseRegistryNpmSpec(rawSpec: string): ParsedRegistryNpmSpec | null {
  const parsed = parseRegistryNpmSpecInternal(rawSpec);
  return parsed.ok ? parsed.parsed : null;
}

/** Returns whether a user-provided npm spec resolves to the official RemoteClaw npm scope. */
export function isRemoteClawOrgNpmSpec(rawSpec: string | undefined): boolean {
  const parsed = rawSpec ? parseRegistryNpmSpec(rawSpec) : null;
  return parsed?.name.startsWith("@remoteclaw/") === true;
}

/**
 * npm scopes this project's docs and channel catalog present as first-party, but
 * which are NOT registered on the public npm registry.
 *
 * A scope nobody owns is a dependency-confusion vector. Our own documentation tells
 * operators to run `remoteclaw plugins install @remoteclaw/<channel>`; whoever
 * registers the scope first serves that install, and installed plugins run in-process
 * with full host capability (no sandbox). So resolution from these scopes fails closed.
 *
 * The refusal is scope-wide rather than an allowlist of the names we document: those
 * names are precisely what a squatter would publish, so allowlisting them would
 * allowlist the attack. It is also narrower than it looks — only *registry* resolution
 * is refused. Local path, directory, and tarball installs never consult this list, so
 * the in-tree `@remoteclaw/*` extensions still install from disk.
 *
 * Remove a scope from this list once it is actually registered and its packages are
 * published by this project. At that point the durable control is `expectedIntegrity`
 * pinning, which the third-party catalog entries already carry.
 *
 * Distinct from `isRemoteClawOrgNpmSpec` above, which asks whether a spec is *ours* —
 * an ownership question that stays true after the scope is registered. This asks
 * whether the scope is *unowned on the registry*, which is what gates installs. The two
 * agree today only by coincidence; do not collapse them.
 */
export const UNCLAIMED_FIRST_PARTY_NPM_SCOPES: readonly string[] = ["@remoteclaw"];

/**
 * Returns the unclaimed first-party scope a spec resolves into, or null when the spec
 * is safe to resolve from the registry.
 *
 * Matches the scope segment only, so the unscoped `remoteclaw` package — which this
 * project does publish — is unaffected. Unparseable specs return null; they are
 * rejected separately by `validateRegistryNpmSpec`.
 */
export function findUnclaimedNpmScope(rawSpec: string | undefined): string | null {
  const parsed = rawSpec ? parseRegistryNpmSpec(rawSpec) : null;
  return parsed ? findUnclaimedNpmScopeForPackageName(parsed.name) : null;
}

/**
 * Scope check for a bare package name, as it appears as a key in a `dependencies`
 * map — where there is no selector to parse.
 *
 * Needed because `npm install` resolves a package's own declared dependencies from
 * the registry, which is the same exposure as installing the package directly: a
 * plugin depending on `@remoteclaw/anything` would pull a squatted package into its
 * `node_modules` and import it in-process.
 */
export function findUnclaimedNpmScopeForPackageName(name: string): string | null {
  const trimmed = name.trim();
  return UNCLAIMED_FIRST_PARTY_NPM_SCOPES.find((scope) => trimmed.startsWith(`${scope}/`)) ?? null;
}

/** Formats the refusal shown when an installed package declares an unclaimed-scope dependency. */
export function formatUnclaimedNpmScopeDependencyError(params: {
  dependencies: readonly string[];
  scope: string;
}): string {
  const list = params.dependencies.join(", ");
  return (
    `Refusing to install dependencies for this package: it requires ${list} from the ` +
    `"${params.scope}" npm scope, which is not registered. Whoever claims that scope would ` +
    `supply the code, and it would run in-process with no sandbox (dependency confusion). ` +
    `Ask the package author to depend on a package published under a scope they control.`
  );
}

/** Formats the operator-facing refusal shown when a spec targets an unclaimed scope. */
export function formatUnclaimedNpmScopeError(params: { spec: string; scope: string }): string {
  return (
    `Refusing to resolve "${params.spec}" from the public npm registry: the "${params.scope}" ` +
    `scope is not registered, so any package published under it is not ours and installing it ` +
    `would run unverified code in-process (dependency confusion). Channels that ship with ` +
    `RemoteClaw are already bundled — enable the channel in your config instead of installing ` +
    `it. To install a plugin you built yourself, pass its path or tarball, for example ` +
    `"remoteclaw plugins install ./my-plugin".`
  );
}

/** Validates a registry-only npm spec and returns a user-facing error when rejected. */
export function validateRegistryNpmSpec(rawSpec: string): string | null {
  const parsed = parseRegistryNpmSpecInternal(rawSpec);
  return parsed.ok ? null : parsed.error;
}

/** Returns whether a value is an exact semver selector, with optional leading `v`. */
export function isExactSemverVersion(value: string): boolean {
  return EXACT_SEMVER_VERSION_RE.test(value.trim());
}

/** Parses RemoteClaw's monthly patch stable/alpha/beta/correction version format. */
function parseRemoteClawReleaseVersion(value: string): RemoteClawReleaseVersion | null {
  const trimmed = value.trim();
  const candidates = [
    { match: REMOTECLAW_STABLE_VERSION_RE.exec(trimmed), channel: "stable" as const },
    { match: REMOTECLAW_STABLE_CORRECTION_VERSION_RE.exec(trimmed), channel: "stable" as const },
    { match: REMOTECLAW_ALPHA_VERSION_RE.exec(trimmed), channel: "alpha" as const },
    { match: REMOTECLAW_BETA_VERSION_RE.exec(trimmed), channel: "beta" as const },
  ];
  const candidate = candidates.find((entry) => entry.match?.groups);
  if (!candidate?.match?.groups) {
    return null;
  }

  const year = Number.parseInt(candidate.match.groups.year ?? "", 10);
  const month = Number.parseInt(candidate.match.groups.month ?? "", 10);
  const patch = Number.parseInt(candidate.match.groups.patch ?? "", 10);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(patch) ||
    month < 1 ||
    month > 12 ||
    patch < 1
  ) {
    return null;
  }

  const correctionNumber =
    candidate.channel === "stable" && candidate.match.groups.correction
      ? Number.parseInt(candidate.match.groups.correction, 10)
      : undefined;
  // Stable correction releases share the stable channel rank; the optional
  // correction number is compared later so base stable sorts before fixes.
  const alphaNumber =
    candidate.channel === "alpha"
      ? Number.parseInt(candidate.match.groups.alpha ?? "", 10)
      : undefined;
  const betaNumber =
    candidate.channel === "beta"
      ? Number.parseInt(candidate.match.groups.beta ?? "", 10)
      : undefined;

  return {
    channel: candidate.channel,
    year,
    month,
    patch,
    correctionNumber,
    alphaNumber,
    betaNumber,
  };
}

/** Returns whether a version is an RemoteClaw monthly patch stable correction release. */
export function isRemoteClawStableCorrectionVersion(value: string): boolean {
  const parsed = parseRemoteClawReleaseVersion(value);
  return parsed?.channel === "stable" && parsed.correctionNumber !== undefined;
}

/** Compares RemoteClaw monthly patch release versions across alpha, beta, stable, and corrections. */
export function compareRemoteClawReleaseVersions(left: string, right: string): number | null {
  const parsedLeft = parseRemoteClawReleaseVersion(left);
  const parsedRight = parseRemoteClawReleaseVersion(right);
  if (!parsedLeft || !parsedRight) {
    return null;
  }
  if (parsedLeft.year !== parsedRight.year) {
    return parsedLeft.year < parsedRight.year ? -1 : 1;
  }
  if (parsedLeft.month !== parsedRight.month) {
    return parsedLeft.month < parsedRight.month ? -1 : 1;
  }
  if (parsedLeft.patch !== parsedRight.patch) {
    return parsedLeft.patch < parsedRight.patch ? -1 : 1;
  }
  if (parsedLeft.channel !== parsedRight.channel) {
    const rank = { alpha: 0, beta: 1, stable: 2 };
    return rank[parsedLeft.channel] < rank[parsedRight.channel] ? -1 : 1;
  }
  if (parsedLeft.channel === "alpha") {
    return Math.sign((parsedLeft.alphaNumber ?? 0) - (parsedRight.alphaNumber ?? 0));
  }
  if (parsedLeft.channel === "beta") {
    return Math.sign((parsedLeft.betaNumber ?? 0) - (parsedRight.betaNumber ?? 0));
  }
  return Math.sign((parsedLeft.correctionNumber ?? 0) - (parsedRight.correctionNumber ?? 0));
}

/** Returns whether an exact semver value is a prerelease, excluding stable correction releases. */
export function isPrereleaseSemverVersion(value: string): boolean {
  const trimmed = value.trim();
  const match = EXACT_SEMVER_VERSION_RE.exec(trimmed);
  return Boolean(match?.[4]) && !isRemoteClawStableCorrectionVersion(trimmed);
}

/**
 * Enforces explicit opt-in before an npm spec may resolve to a prerelease.
 * Bare specs and `latest` stay on stable releases unless the resolved version
 * is an RemoteClaw stable correction.
 */
export function isPrereleaseResolutionAllowed(params: {
  spec: ParsedRegistryNpmSpec;
  resolvedVersion?: string;
}): boolean {
  if (!params.resolvedVersion || !isPrereleaseSemverVersion(params.resolvedVersion)) {
    return true;
  }
  // Bare specs and `latest` should not drift into beta/rc builds; prereleases require a tag or
  // exact prerelease selector so automation remains stable.
  if (params.spec.selectorKind === "none") {
    return false;
  }
  if (params.spec.selectorKind === "exact-version") {
    return params.spec.selectorIsPrerelease;
  }
  return normalizeLowercaseStringOrEmpty(params.spec.selector) !== "latest";
}

/** Formats the install error shown when a registry spec resolves to a disallowed prerelease. */
export function formatPrereleaseResolutionError(params: {
  spec: ParsedRegistryNpmSpec;
  resolvedVersion: string;
}): string {
  const selectorHint =
    params.spec.selectorKind === "none" ||
    normalizeLowercaseStringOrEmpty(params.spec.selector) === "latest"
      ? `Use "${params.spec.name}@beta" (or another prerelease tag) or an exact prerelease version to opt in explicitly.`
      : `Use an explicit prerelease tag or exact prerelease version if you want prerelease installs.`;
  return `Resolved ${params.spec.raw} to prerelease version ${params.resolvedVersion}, but prereleases are only installed when explicitly requested. ${selectorHint}`;
}
