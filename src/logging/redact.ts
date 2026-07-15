import type { RemoteClawConfig } from "../config/config.js";
import { compileSafeRegexDetailed, type SafeRegexRejectReason } from "../security/safe-regex.js";
import { resolveNodeRequireFromMeta } from "./node-require.js";
import { replacePatternBounded } from "./redact-bounded.js";

const requireConfig = resolveNodeRequireFromMeta(import.meta.url);

export type RedactSensitiveMode = "off" | "tools";

const DEFAULT_REDACT_MODE: RedactSensitiveMode = "tools";
const DEFAULT_REDACT_MIN_LENGTH = 18;
const DEFAULT_REDACT_KEEP_START = 6;
const DEFAULT_REDACT_KEEP_END = 4;

// Payment-credential key fragments woven into the ENV/URL/JSON/CLI/standalone
// patterns below so card numbers, CVV/CVC codes, and payment tokens are redacted
// alongside API keys/secrets. (Ported from upstream #75230; the structured
// field-value helper it also added has no fork consumer and is omitted.)
const PAYMENT_CREDENTIAL_ENV_KEYS = String.raw`CARD[_-]?NUMBER|CARD[_-]?CVC|CARD[_-]?CVV|CVC|CVV|SECURITY[_-]?CODE|PAYMENT[_-]?CREDENTIAL|SHARED[_-]?PAYMENT[_-]?TOKEN`;
const PAYMENT_CREDENTIAL_QUERY_KEYS = String.raw`card[-_]?number|card[-_]?cvc|card[-_]?cvv|cvc|cvv|security[-_]?code|payment[-_]?credential|shared[-_]?payment[-_]?token`;
const PAYMENT_CREDENTIAL_JSON_KEYS = String.raw`cardNumber|card_number|cardCvc|card_cvc|cardCvv|card_cvv|cvc|cvv|securityCode|security_code|paymentCredential|payment_credential|sharedPaymentToken|shared_payment_token`;

// ORDER IS SEMANTIC — do not regroup by theme.
//
// `redactText` applies these SEQUENTIALLY in array order, feeding each pattern's `.replace()`
// output to the next. A GENERIC `key=value` pattern that runs early can therefore capture and mask
// the very ANCHOR a later, more specific pattern matches on — silently disabling it. That is not
// hypothetical: it is #2904. The ENV pattern used to run first, and its value class stops at the
// first space, so
//
//     PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----\n<base64 body>\n-----END RSA PRIVATE KEY-----
//
// had `-----BEGIN` captured as the ENV "value" and masked to `***`. That destroyed the PEM opener,
// the PEM pattern below could no longer match, and the entire base64 body shipped in CLEARTEXT.
//
// Hence: MOST-ANCHORED-FIRST, MOST-GENERIC-LAST.
//
//   1. PEM blocks              — multi-line, anchored on a `-----BEGIN` opener a generic can eat.
//   2. Authorization / Bearer  — anchored on a `Bearer` keyword a generic can eat.
//   3. Vendor-prefix tokens    — self-anchored on their own literal prefix (sk-, ghp_, AKIA, …).
//   4. ENV → URL → standalone → JSON → CLI — the generic `key=value` families.
//
// Reordering is SAFE where a generic and a specific pattern both match the same token, because
// `maskToken`'s idempotence guard (`isAlreadyMasked`) returns an already-masked value verbatim.
// `OPENAI_API_KEY=sk-1234567890abcdef` is masked by the vendor `sk-` pattern first; the later ENV
// pass then captures `sk-123…cdef`, recognises maskToken's own image, and leaves it alone instead
// of collapsing it to `***`. Whichever of the two runs first wins; the other is a no-op. Order
// therefore decides WHICH pattern masks a token, never WHETHER it is masked.
//
// Adding a pattern? Place it by ANCHOR STRENGTH, not by theme.
const DEFAULT_REDACT_PATTERNS: string[] = [
  // --- 1. PEM blocks ------------------------------------------------------------------------
  // FIRST on purpose (#2904). Any generic `key=value` family running ahead of this would mask the
  // `-----BEGIN` opener of a `PRIVATE_KEY=<pem>` line and leak the body. See the ORDER note above.
  String.raw`-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]+?-----END [A-Z ]*PRIVATE KEY-----`,
  // --- 2. Authorization headers / Bearer tokens ---------------------------------------------
  // Anchored on the `Bearer` keyword. A generic family running first would capture `Bearer` as the
  // VALUE of `authorization=…` and mask it, leaving the real token in cleartext behind it (#2904).
  String.raw`Authorization\s*[:=]\s*Bearer\s+([A-Za-z0-9._\-+=]+)`,
  String.raw`\bBearer\s+([A-Za-z0-9._\-+=]{18,})\b`,
  // --- 3. Vendor-prefix / self-anchored tokens ----------------------------------------------
  // Each anchors on its own literal prefix, so it is immune to key-name spelling — but NOT to a
  // generic pattern masking its value first. Running them here means the pattern that actually
  // understands a token's shape is the one that masks it, at every position it can appear.
  String.raw`\b(sk-[A-Za-z0-9_-]{8,})\b`,
  String.raw`\b(ghp_[A-Za-z0-9]{20,})\b`,
  String.raw`\b(github_pat_[A-Za-z0-9_]{20,})\b`,
  String.raw`\b(xox[baprs]-[A-Za-z0-9-]{10,})\b`,
  String.raw`\b(xapp-[A-Za-z0-9-]{10,})\b`,
  String.raw`\b(gsk_[A-Za-z0-9_-]{10,})\b`,
  String.raw`\b(AIza[0-9A-Za-z\-_]{20,})\b`,
  String.raw`\b(pplx-[A-Za-z0-9_-]{10,})\b`,
  String.raw`\b(npm_[A-Za-z0-9]{10,})\b`,
  // AWS long-term access-key IDs (literal AKIA + 16 upper-alphanumerics, 20 total).
  // Case-sensitive `/…/g` form (not the bare `gi` fallback form) since AWS key IDs are
  // uppercase — avoids over-masking mixed-case words that merely start "akia". (Fork-side, #2852.)
  String.raw`/\b(AKIA[0-9A-Z]{16})\b/g`,
  // Additional access-key and token-style prefixes (Tencent AKID, Alibaba LTAI,
  // HuggingFace hf_, Replicate r8_). Ported from upstream #58162.
  String.raw`\b(AKID[A-Za-z0-9]{10,})\b`,
  String.raw`\b(LTAI[A-Za-z0-9]{10,})\b`,
  String.raw`\b(hf_[A-Za-z0-9]{10,})\b`,
  String.raw`\b(r8_[A-Za-z0-9]{10,})\b`,
  // Telegram Bot API URLs embed the token as `/bot<token>/...` (no word-boundary before digits).
  // Distinct from the `bot[-_]?token` KEY added to the generic families below — that one is a
  // query/log key literally named `bot-token`; this one is the token's own `<digits>:<secret>` shape.
  String.raw`\bbot(\d{6,}:[A-Za-z0-9_-]{20,})\b`,
  String.raw`\b(\d{6,}:[A-Za-z0-9_-]{20,})\b`,
  // --- 4. Generic `key=value` families ------------------------------------------------------
  // ENV-style assignments. Keep this case-sensitive so diagnostics like
  // `Unrecognized key: "llm"` do not lose the actual config key.
  String.raw`/\b[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|${PAYMENT_CREDENTIAL_ENV_KEYS})\b\s*[=:]\s*(["']?)([^\s"'\\]+)\1/g`,
  // Same, but for backslash-escaped quotes. The pattern above excludes `\` from the
  // value class, so a JSON-embedded shell command (`{"command":"export KEY=\"secret\""}`)
  // never matches it and would otherwise log the credential in cleartext.
  String.raw`/\b[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|${PAYMENT_CREDENTIAL_ENV_KEYS})\b\s*[=:]\s*\\+(["'])([^\s"'\\]+)\\+\1/g`,
  // URL query parameters. Kept separate from ENV-style assignments so lower-case URL
  // secrets (e.g. `?access_token=…`) stay redacted without hiding config-key diagnostics.
  //
  // CONTAINMENT INVARIANT: this key set is a SUPERSET of the standalone pattern's key set below.
  // That is what makes the two patterns' disjoint domains lossless — the standalone pattern's
  // lookbehind refuses to fire at URL position, which is only safe because every key it would
  // redact is redacted HERE instead. `id[-_]?token`, `app[-_]?secret`, `jwt`, and `credential`
  // were added for that containment (#2903); the first two also closed real leaks at URL position.
  // ANY key added to the standalone set MUST be added here too or containment breaks — pinned by
  // the "#2903 losslessness" test.
  //
  // `authorization` and `private[-_]?key` are here for containment with the standalone set (#2904).
  //
  // The prefixed compounds (`csrf[-_]?token`, `session[-_]?token`, `webhook[-_]?secret`,
  // `signing[-_]?secret`, `bot[-_]?token`, `user[-_]?password`) close #2905: `?csrf-token=…` leaked
  // because `[?&]` anchors the alternation to the START of the key, so the generic `token`
  // alternative can never reach the `token` inside `csrf-token`. Enumerated EXPLICITLY rather than
  // via a broad `(?:[\w-]*[-_])?(?:token|secret|key)=` prefix, which would over-mask non-secrets:
  // `?public-key=`, `?sort-key=`, `?primary-key=`, `?partition-key=`, `?idempotency-key=`. Every
  // key on this list is an unambiguous credential; a hyphen/underscore-agnostic `[-_]?` covers both
  // spellings, so no lookbehind artefact is needed. Pinned by negative tests.
  String.raw`[?&](?:access[-_]?token|auth[-_]?token|hook[-_]?token|refresh[-_]?token|id[-_]?token|csrf[-_]?token|session[-_]?token|bot[-_]?token|api[-_]?key|private[-_]?key|client[-_]?secret|app[-_]?secret|webhook[-_]?secret|signing[-_]?secret|user[-_]?password|authorization|jwt|token|key|secret|password|pass|passwd|auth|credential|signature|${PAYMENT_CREDENTIAL_QUERY_KEYS})=([^&\s"'<>]+)`,
  // Standalone credential assignments outside URLs (e.g. `token=…` in a log line).
  //
  // Leading boundary is `\b` (#2902). The previous delimiter whitelist accepted only
  // whitespace/comma/semicolon/quote/backtick, so every other non-word delimiter leaked:
  // `(token=…)`, `[token=…]`, `{cmd:token=…}`, `:token=…`, `.token=…`, `--token=…`. `\b` is
  // a strict superset of that whitelist and still refuses to fire mid-word, so `mytoken=…`
  // stays untouched. It is zero-width, so it consumes nothing and needs no capture group —
  // the value is the only group, which is what `redactMatch` takes.
  //
  // `(?<![?&][-\w]*)` keeps this pattern's domain disjoint from the URL-query pattern above,
  // which runs first (patterns apply in array order, each fed the previous one's output).
  // Without the lookbehind, `\b` re-enters INSIDE a hyphenated query key — `?auth-token=`
  // has a word boundary at `-|token` — and re-matches the already-masked value. Blocking only
  // the single char before the key is not enough: a query key spans many chars, hence the
  // variable-length lookbehind. It is unbounded on purpose — a length cap would only change
  // behavior for keys longer than the cap, where it reverts to the broken re-entry. Cost is
  // not measurable: the lookbehind fails fast and prunes the alternation attempt entirely.
  //
  // `maskToken`'s idempotence guard now makes that re-entry harmless, so the lookbehind may be
  // redundant. That is NOT established. The two patterns' value classes still differ
  // (`[^\s&#,<>)\]}]+` here vs `[^&\s"'<>]+` above), so a re-entered match need not span the same
  // text as the original, and nothing exercises that divergence — quotes and `#` are exactly where
  // they part company. Removing it is a separate question resting on an unproven premise; retained
  // deliberately.
  //
  // Compound keys are enumerated explicitly (#2903, #2905) because `_` is a word character:
  // `auth_token=` has NO word boundary before `token`, so the generic `token` alternative
  // can never reach it and `\b` alone cannot fix that. Hyphenated spellings need no entry —
  // the hyphen IS a boundary, so generic `token` already catches `auth-token=`. The
  // boundary fix and the key list are complementary; neither alone closes the gap. The #2905
  // compounds are listed at BOTH positions: `csrf_token=<v>` leaks in a plain (non-URL) log line
  // for exactly this `_`-is-a-word-char reason, and containment (see the URL pattern) requires any
  // standalone key to exist at URL position too.
  //
  // `authorization` and `private[-_]?key` are now IN (#2904). They were previously excluded as
  // ordering-sensitive: this pattern used to run BEFORE the Bearer and PEM patterns, and its value
  // class stops at whitespace, so it masked the `Bearer` / `-----BEGIN` marker those patterns match
  // on and let the real credential through. The reorder (see the ORDER note at the top of this
  // array) puts PEM/Bearer FIRST, so both anchors are consumed before this pattern ever sees them —
  // which is what makes these two keys safe to add. `authorization=<opaque-token>` (no `Bearer`
  // keyword) and lowercase `private_key=<opaque>` were BOTH leaking in full at HEAD; they are the
  // leaks this closes.
  //
  // Still deliberately NOT here: `pass` — it over-masks `pass=1` / `pass=true` in ordinary prose.
  //
  // Idempotence — not re-masking a value some earlier pattern already masked — is deliberately
  // NOT enforced here. It is a property of the redactor (any pattern can re-enter any other's
  // output), not of this pattern, so the guard lives in `maskToken`; see `isAlreadyMasked`.
  // Two attempts to encode it in this regex both got the skip set wrong, in the same way: they
  // keyed on a proxy for "this value is a mask" rather than on the mask itself. Do not retry.
  //
  // VALUE CLASS `[^\s&#,<>)\]}]+` (#2907). HEAD's `[^\s&#]+` admitted `,` and the closing
  // delimiters, so a whitespace-delimited run spanned adjacent assignments:
  // `token=<secret>,user=alice` masked as ONE blob — eating the `user=alice` diagnostic and making
  // the mask tail (`…lice`) the tail of `alice` rather than of the token. The 6+4 shape exists to
  // let the same token be correlated across log lines; a tail borrowed from neighbouring text
  // breaks that. Excluding `,` `<` `>` `)` `]` `}` makes each credential assignment mask
  // INDEPENDENTLY and leaves the band as exactly maskToken's image.
  //
  // CORRECT-BY-POLICY TRADE: a run no longer sweeps a NON-credential neighbour into the mask, so
  // `token=abcdef…ghij,other=<highentropy>` now leaves `other=<highentropy>` in cleartext. That is
  // not a new leak — this redactor targets KNOWN credential keys, and `other` is not one, so
  // `other=<v>` is out of scope at EVERY position (a bare `other=<v>` was never masked either). The
  // old behavior was an accidental, position-dependent over-mask. The mask tail now also reveals
  // the token's real last-KEEP_END chars where an absorbed suffix previously hid them; maskToken's
  // 6+4 reveal is the deliberate product policy, so this is that policy applied honestly.
  //
  // The same exclusion has a SECOND reading that DOES cost confidentiality (unlike the benign
  // neighbour case above): a credential value whose OWN bytes contain one of the newly-excluded
  // delimiters (`,` `<` `>` `)` `]` `}`) is captured only UP TO that delimiter, so the remainder
  // ships in cleartext. `password=Tr0ub4dorExtra,LongPart9876` masks to `password=***,LongPart9876`
  // — `Tr0ub4dorExtra` is shorter than MIN_LENGTH so it collapses to `***`, and `,LongPart9876`
  // LEAKS. It is bounded to THIS lowercase-standalone form: the URL/ENV/JSON/CLI patterns keep their
  // own comma-admitting value classes, so the same value masks WHOLE at those positions. And no
  // standard high-entropy credential alphabet reaches it — base64, base64url, hex, JWT, and
  // vendor-prefixed tokens all exclude every one of `,` `<` `>` `)` `]` `}` — so the only value that
  // leaks here is a special-char passphrase logged UNQUOTED in a lowercase `key=value` line.
  //
  // `=` is KEPT in the class on purpose: base64 padding (`…==`) must stay INSIDE the captured value.
  // Excluding it would strand the padding in cleartext and truncate the mask.
  //
  // `"` `'` and `` ` `` are also KEPT, and that is load-bearing rather than an oversight: this
  // pattern is the SOLE handler of the quoted-value form `token="<secret>"` (the ENV pattern is
  // uppercase-only; the JSON pattern needs `"key":"value"`). The value class governs the value's
  // FIRST character as well as its rest, so excluding `"` would make the class fail to match at the
  // opening quote — the pattern would not fire at all and `token="<secret>"` would LEAK. Keeping
  // them costs only a borrowed quote in the mask tail of the (rarer) trailing-quote form; the
  // alternative costs a credential. Pinned by the `token="…"` test.
  //
  // The URL pattern's class above stays `[^&\s"'<>]+`, and the ENV pattern's stays `[^\s"'\\]+`.
  // They terminate correctly for their own positions (URL on `&`, ENV on quote/backslash) and are
  // deliberately NOT converged with this one: value classes differ BY POSITION.
  //
  // Upstream shares this text-level gap and relies on structured tool-output redaction the
  // fork does not carry. (Fork-side, #2852.)
  String.raw`\b(?<![?&][-\w]*)(?:access_token|refresh_token|id_token|auth[-_]?token|hook[-_]?token|csrf[-_]?token|session[-_]?token|bot[-_]?token|api[-_]?key|private[-_]?key|client[-_]?secret|app[-_]?secret|webhook[-_]?secret|signing[-_]?secret|user[-_]?password|authorization|jwt|token|secret|password|passwd|credential|${PAYMENT_CREDENTIAL_QUERY_KEYS})=([^\s&#,<>)\]}]+)`,
  // JSON fields.
  String.raw`"(?:apiKey|token|secret|password|passwd|accessToken|refreshToken|${PAYMENT_CREDENTIAL_JSON_KEYS})"\s*:\s*"([^"]+)"`,
  // CLI flags.
  String.raw`--(?:api[-_]?key|hook[-_]?token|token|secret|password|passwd|${PAYMENT_CREDENTIAL_QUERY_KEYS})\s+(["']?)([^\s"']+)\1`,
];

type RedactOptions = {
  mode?: RedactSensitiveMode;
  patterns?: string[];
};

function normalizeMode(value?: string): RedactSensitiveMode {
  return value === "off" ? "off" : DEFAULT_REDACT_MODE;
}

// Human-readable text for each rejection reason, surfaced in the operator-facing
// diagnostic below. Keyed by the exhaustive SafeRegexRejectReason union, so a new
// reason added upstream fails the type-check here until it is described.
const REJECT_REASON_TEXT: Record<SafeRegexRejectReason, string> = {
  empty: "pattern is empty",
  "invalid-regex": "not a valid regular expression",
  "unsafe-nested-repetition": "rejected as ReDoS-prone (unsafe nested repetition)",
};

// A redaction pattern is a security control; a silently-dropped one weakens it with
// no operator-visible signal (#2906). Emit each distinct diagnostic once — enough to
// alert, not enough to spam a path called on every log line.
//
// enableConsoleCapture() (logging/console.ts) monkey-patches console.* to route back
// through redactSensitiveText -> resolvePatterns, so emitting a diagnostic re-enters
// this module. Two guards keep that bounded: the key is added BEFORE emit so the
// re-entrant call for the SAME diagnostic is deduped, and `emitting` suppresses
// emission (not resolution) during a re-entry, so a config with many distinct broken
// patterns cannot drive resolve depth past one re-entry. Resolution still runs on
// re-entry, so the diagnostic line itself is redacted. Mirrors
// loggingState.resolvingConsoleSettings in logging/console.ts.
const emittedRedactDiagnostics = new Set<string>();
let emittingRedactDiagnostic = false;

function emitRedactDiagnosticOnce(key: string, emit: () => void): void {
  if (emittingRedactDiagnostic || emittedRedactDiagnostics.has(key)) {
    return;
  }
  emittedRedactDiagnostics.add(key);
  emittingRedactDiagnostic = true;
  try {
    emit();
  } finally {
    emittingRedactDiagnostic = false;
  }
}

type ParsedPattern = {
  regex: RegExp | null;
  reason: SafeRegexRejectReason | null;
};

function parsePatternDetailed(raw: string): ParsedPattern {
  if (!raw.trim()) {
    return { regex: null, reason: "empty" };
  }
  const match = raw.match(/^\/(.+)\/([gimsuy]*)$/);
  const result = match
    ? compileSafeRegexDetailed(match[1], match[2].includes("g") ? match[2] : `${match[2]}g`)
    : compileSafeRegexDetailed(raw, "gi");
  return { regex: result.regex, reason: result.reason };
}

function resolvePatterns(value?: string[]): RegExp[] {
  const callerSupplied = Boolean(value?.length);
  const source = value?.length ? value : DEFAULT_REDACT_PATTERNS;
  const compiled: RegExp[] = [];
  for (const raw of source) {
    const { regex, reason } = parsePatternDetailed(raw);
    if (regex) {
      compiled.push(regex);
      continue;
    }
    if (reason) {
      // (a) Never drop silently — name the offending pattern and why it was rejected.
      emitRedactDiagnosticOnce(`reject:${reason}:${raw}`, () => {
        console.warn(
          `[remoteclaw] logging.redactPatterns: ignoring pattern ${JSON.stringify(raw)} — ${REJECT_REASON_TEXT[reason]} (${reason}). It will NOT be used to redact logs.`,
        );
      });
    }
  }
  if (compiled.length > 0) {
    return compiled;
  }
  // (b) Fail closed. A caller-supplied set that resolves to empty degrades to the
  // built-in defaults, never to zero redaction (#2906): a broken redactPatterns
  // config must not silently disable a security control that still reads enabled.
  if (callerSupplied) {
    emitRedactDiagnosticOnce("fallback:defaults", () => {
      console.error(
        "[remoteclaw] logging.redactPatterns: every configured pattern was rejected — falling back to built-in default redaction patterns so logs are still redacted. Custom patterns are NOT applied until the reported patterns are fixed.",
      );
    });
    return resolvePatterns(undefined);
  }
  // Source was already the defaults and produced nothing — nothing to fall back to.
  return compiled;
}

const MASKED_TOKEN_LENGTH = DEFAULT_REDACT_KEEP_START + 1 + DEFAULT_REDACT_KEEP_END;

// Idempotence guard: `maskToken` must never mask its own output.
//
// Patterns apply in array order, each fed the previous one's output, and their domains overlap.
// The ENV pattern is case-SENSITIVE, while bare `String.raw` entries compile with flags `gi`, so an
// `AUTH_TOKEN=` masked by the ENV pattern is re-matched by `auth[-_]?token` under `i` in the
// standalone pattern that follows it. Without this guard the second pass masks a mask \u2014 and since a
// mask is exactly KEEP_START + 1 + KEEP_END = 11 chars while MIN_LENGTH is 18, `maskToken` would
// classify it as a short token and collapse the legible `abcdef\u2026ghij` to `***`.
//
// This guard is also what makes the anchored-first pattern ORDER safe (see the note above
// DEFAULT_REDACT_PATTERNS): a vendor-prefix pattern and a generic `key=value` pattern routinely
// match the SAME token, and whichever runs second must not re-mask the first one's output.
//
// That collapse is an accident of two unrelated constants, not a policy. Nobody decided an
// ENV-assigned secret should reveal 0 bytes where a URL-assigned one reveals 10; it falls out of
// 11 < 18, and it silently flips if either constant moves. Revealing KEEP_START + KEEP_END chars
// at or above MIN_LENGTH is the deliberate decision. The guard makes every position obey it.
//
// It lives here rather than in a pattern's regex because "don't re-mask a mask" is a property of
// the redactor, not of any one pattern \u2014 and because keying on `maskToken`'s own constants tracks
// them instead of restating them. A regex-side guard hardcoding 6/4 would silently disarm the
// moment either constant changed, which is a worse failure than the one it prevents.
//
// The skip set is exactly `maskToken`'s image: 11 chars with U+2026 at index KEEP_START. That is
// the tightest guard available \u2014 and tightest is not empty. An 11-char credential with U+2026 at
// exactly index 6 is returned verbatim instead of `***`. No credential alphabet (base64url, hex,
// JWT, PEM body) contains U+2026, so the set is empty in practice, not in principle. Pinned by
// test, so the trade fails loudly if it ever stops being acceptable.
function isAlreadyMasked(token: string): boolean {
  return token.length === MASKED_TOKEN_LENGTH && token[DEFAULT_REDACT_KEEP_START] === "\u2026";
}

function maskToken(token: string): string {
  if (isAlreadyMasked(token)) {
    return token;
  }
  if (token.length < DEFAULT_REDACT_MIN_LENGTH) {
    return "***";
  }
  const start = token.slice(0, DEFAULT_REDACT_KEEP_START);
  const end = token.slice(-DEFAULT_REDACT_KEEP_END);
  return `${start}…${end}`;
}

function redactPemBlock(block: string): string {
  const lines = block.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) {
    return "***";
  }
  return `${lines[0]}\n…redacted…\n${lines[lines.length - 1]}`;
}

function redactMatch(match: string, groups: string[]): string {
  if (match.includes("PRIVATE KEY-----")) {
    return redactPemBlock(match);
  }
  const token =
    groups.filter((value) => typeof value === "string" && value.length > 0).at(-1) ?? match;
  const masked = maskToken(token);
  if (token === match) {
    return masked;
  }
  return match.replace(token, masked);
}

function redactText(text: string, patterns: RegExp[]): string {
  let next = text;
  for (const pattern of patterns) {
    next = replacePatternBounded(next, pattern, (...args: string[]) =>
      redactMatch(args[0], args.slice(1, -2)),
    );
  }
  return next;
}

function resolveConfigRedaction(): RedactOptions {
  let cfg: RemoteClawConfig["logging"] | undefined;
  try {
    const loaded = requireConfig?.("../config/config.js") as
      | {
          loadConfig?: () => RemoteClawConfig;
        }
      | undefined;
    cfg = loaded?.loadConfig?.().logging;
  } catch {
    cfg = undefined;
  }
  return {
    mode: normalizeMode(cfg?.redactSensitive),
    patterns: cfg?.redactPatterns,
  };
}

export function redactSensitiveText(text: string, options?: RedactOptions): string {
  if (!text) {
    return text;
  }
  const resolved = options ?? resolveConfigRedaction();
  if (normalizeMode(resolved.mode) === "off") {
    return text;
  }
  const patterns = resolvePatterns(resolved.patterns);
  if (!patterns.length) {
    return text;
  }
  return redactText(text, patterns);
}

export function redactToolDetail(detail: string): string {
  const resolved = resolveConfigRedaction();
  if (normalizeMode(resolved.mode) !== "tools") {
    return detail;
  }
  return redactSensitiveText(detail, resolved);
}

export function getDefaultRedactPatterns(): string[] {
  return [...DEFAULT_REDACT_PATTERNS];
}

// Test-only: reset the once-per-process diagnostic dedupe so each test observes the
// diagnostics for its own input, independent of order. Mirrors the
// setConsoleConfigLoaderForTests test-hook convention in logging/console.ts.
export function resetRedactDiagnosticsForTests(): void {
  emittedRedactDiagnostics.clear();
  emittingRedactDiagnostic = false;
}

// Test-only: compile one pattern string through the redactor's own parsing path,
// exposing the null-or-RegExp result plus rejection reason. Used by the CI guard
// asserting every DEFAULT_REDACT_PATTERNS entry compiles (#2906) — a dropped default
// silently weakens the shipped redaction posture.
export function compileRedactPatternForTests(raw: string): ParsedPattern {
  return parsePatternDetailed(raw);
}
