import type { RemoteClawConfig } from "../config/config.js";
import { compileSafeRegex } from "../security/safe-regex.js";
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

const DEFAULT_REDACT_PATTERNS: string[] = [
  // ENV-style assignments. Keep this case-sensitive so diagnostics like
  // `Unrecognized key: "llm"` do not lose the actual config key.
  String.raw`/\b[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|${PAYMENT_CREDENTIAL_ENV_KEYS})\b\s*[=:]\s*(["']?)([^\s"'\\]+)\1/g`,
  // Same, but for backslash-escaped quotes. The pattern above excludes `\` from the
  // value class, so a JSON-embedded shell command (`{"command":"export KEY=\"secret\""}`)
  // never matches it and would otherwise log the credential in cleartext.
  String.raw`/\b[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|${PAYMENT_CREDENTIAL_ENV_KEYS})\b\s*[=:]\s*\\+(["'])([^\s"'\\]+)\\+\1/g`,
  // URL query parameters. Kept separate from ENV-style assignments so lower-case URL
  // secrets (e.g. `?access_token=…`) stay redacted without hiding config-key diagnostics.
  // The key set here is a superset of the standalone pattern's key set below. That is what
  // makes the two patterns' disjoint domains lossless: every key redacted standalone is
  // also redacted at URL position, so the standalone pattern can safely refuse to fire
  // there. `id[-_]?token`, `app[-_]?secret`, `jwt`, and `credential` were added for that
  // containment (#2903); the first two also closed real leaks at URL position.
  String.raw`[?&](?:access[-_]?token|auth[-_]?token|hook[-_]?token|refresh[-_]?token|id[-_]?token|api[-_]?key|client[-_]?secret|app[-_]?secret|jwt|token|key|secret|password|pass|passwd|auth|credential|signature|${PAYMENT_CREDENTIAL_QUERY_KEYS})=([^&\s"'<>]+)`,
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
  // redundant. That is NOT established. The two patterns' value classes differ (`[^\s&#]+` here
  // vs `[^&\s"'<>]+` above), so a re-entered match need not span the same text as the original,
  // and nothing exercises that divergence — quotes and `#` are exactly where they part company.
  // Removing it is a separate question resting on an unproven premise; retained deliberately.
  //
  // Compound keys are enumerated explicitly (#2903) because `_` is a word character:
  // `auth_token=` has NO word boundary before `token`, so the generic `token` alternative
  // can never reach it and `\b` alone cannot fix that. Hyphenated spellings need no entry —
  // the hyphen IS a boundary, so generic `token` already catches `auth-token=`. The
  // boundary fix and the key list are complementary; neither alone closes the gap.
  //
  // Deliberately NOT here: `pass` (over-masks `pass=1`/`pass=true` in ordinary prose),
  // `authorization` and `private_key`. The latter two are ordering-sensitive: this pattern
  // runs BEFORE the dedicated Bearer and PEM patterns below, and its value class stops at
  // whitespace, so it would mask the `Bearer`/`-----BEGIN` marker those patterns match on
  // and let the actual credential through. Tracked in #2904.
  //
  // Idempotence — not re-masking a value some earlier pattern already masked — is deliberately
  // NOT enforced here. It is a property of the redactor (any pattern can re-enter any other's
  // output), not of this pattern, so the guard lives in `maskToken`; see `isAlreadyMasked`.
  // Two attempts to encode it in this regex both got the skip set wrong, in the same way: they
  // keyed on a proxy for "this value is a mask" rather than on the mask itself. Do not retry.
  //
  // The value class `[^\s&#]+` is byte-identical to HEAD's on purpose. It admits `,` and `=`,
  // so a whitespace-delimited run spans adjacent assignments: `token=<secret>,user=alice` masks
  // as one blob — eating the `user=alice` diagnostic, and making the mask tail (`…lice`) the
  // tail of `alice` rather than of the token. The 6+4 shape exists to let the same token be
  // correlated across log lines; a tail borrowed from neighbouring text breaks that. Structural,
  // not cosmetic, and out of scope here. Tracked in #2907.
  //
  // Known gap: a hyphenated key absent from the URL key set above (`?csrf-token=…`) leaks at
  // URL position — this pattern is correctly blocked there, and the URL pattern does not
  // know the key. Pre-existing at HEAD, not introduced here. The fix belongs in the URL key
  // set, where it is legible and works for BOTH separators. Tracked in #2905.
  //
  // Upstream shares this text-level gap and relies on structured tool-output redaction the
  // fork does not carry. (Fork-side, #2852.)
  String.raw`\b(?<![?&][-\w]*)(?:access_token|refresh_token|id_token|auth[-_]?token|hook[-_]?token|api[-_]?key|client[-_]?secret|app[-_]?secret|jwt|token|secret|password|passwd|credential|${PAYMENT_CREDENTIAL_QUERY_KEYS})=([^\s&#]+)`,
  // JSON fields.
  String.raw`"(?:apiKey|token|secret|password|passwd|accessToken|refreshToken|${PAYMENT_CREDENTIAL_JSON_KEYS})"\s*:\s*"([^"]+)"`,
  // CLI flags.
  String.raw`--(?:api[-_]?key|hook[-_]?token|token|secret|password|passwd|${PAYMENT_CREDENTIAL_QUERY_KEYS})\s+(["']?)([^\s"']+)\1`,
  // Authorization headers.
  String.raw`Authorization\s*[:=]\s*Bearer\s+([A-Za-z0-9._\-+=]+)`,
  String.raw`\bBearer\s+([A-Za-z0-9._\-+=]{18,})\b`,
  // PEM blocks.
  String.raw`-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]+?-----END [A-Z ]*PRIVATE KEY-----`,
  // Common token prefixes.
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
  String.raw`\bbot(\d{6,}:[A-Za-z0-9_-]{20,})\b`,
  String.raw`\b(\d{6,}:[A-Za-z0-9_-]{20,})\b`,
];

type RedactOptions = {
  mode?: RedactSensitiveMode;
  patterns?: string[];
};

function normalizeMode(value?: string): RedactSensitiveMode {
  return value === "off" ? "off" : DEFAULT_REDACT_MODE;
}

function parsePattern(raw: string): RegExp | null {
  if (!raw.trim()) {
    return null;
  }
  const match = raw.match(/^\/(.+)\/([gimsuy]*)$/);
  if (match) {
    const flags = match[2].includes("g") ? match[2] : `${match[2]}g`;
    return compileSafeRegex(match[1], flags);
  }
  return compileSafeRegex(raw, "gi");
}

function resolvePatterns(value?: string[]): RegExp[] {
  const source = value?.length ? value : DEFAULT_REDACT_PATTERNS;
  return source.map(parsePattern).filter((re): re is RegExp => Boolean(re));
}

const MASKED_TOKEN_LENGTH = DEFAULT_REDACT_KEEP_START + 1 + DEFAULT_REDACT_KEEP_END;

// Idempotence guard: `maskToken` must never mask its own output.
//
// Patterns apply in array order, each fed the previous one's output, and their domains overlap.
// The ENV pattern at index 0 is case-SENSITIVE, while bare `String.raw` entries compile with
// flags `gi`, so an `AUTH_TOKEN=` masked by index 0 is re-matched by `auth[-_]?token` under `i`.
// Without this guard the second pass masks a mask \u2014 and since a mask is exactly
// KEEP_START + 1 + KEEP_END = 11 chars while MIN_LENGTH is 18, `maskToken` would classify it as
// a short token and collapse the legible `abcdef\u2026ghij` to `***`.
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
