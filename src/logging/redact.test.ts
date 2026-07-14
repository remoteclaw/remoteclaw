import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  compileRedactPatternForTests,
  getDefaultRedactPatterns,
  redactSensitiveText,
  resetRedactDiagnosticsForTests,
} from "./redact.js";

const defaults = getDefaultRedactPatterns();

describe("redactSensitiveText", () => {
  it("masks env assignments while keeping the key", () => {
    const input = "OPENAI_API_KEY=sk-1234567890abcdef";
    const output = redactSensitiveText(input, {
      mode: "tools",
      patterns: defaults,
    });
    expect(output).toBe("OPENAI_API_KEY=sk-123…cdef");
  });

  it("masks JSON-escaped quoted env assignments while keeping the key", () => {
    const xai = "issue85049-xai-cleartext-token-ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";
    const brave = "issue85049-brave-cleartext-token-ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";
    const input = String.raw`raw_params={"command":"export XAI_API_KEY=\"${xai}\" && export BRAVE_API_KEY=\\\"${brave}\\\" && echo blocked"}`;
    const output = redactSensitiveText(input, {
      mode: "tools",
      patterns: defaults,
    });
    expect(output).toContain("XAI_API_KEY=");
    expect(output).toContain("BRAVE_API_KEY=");
    expect(output).not.toContain(xai);
    expect(output).not.toContain(brave);
    expect(output).toContain("issue8…7890");
  });

  it("masks CLI flags", () => {
    const input = "curl --token abcdef1234567890ghij https://api.test";
    const output = redactSensitiveText(input, {
      mode: "tools",
      patterns: defaults,
    });
    expect(output).toBe("curl --token abcdef…ghij https://api.test");
  });

  it("masks JSON fields", () => {
    const input = '{"token":"abcdef1234567890ghij"}';
    const output = redactSensitiveText(input, {
      mode: "tools",
      patterns: defaults,
    });
    expect(output).toBe('{"token":"abcdef…ghij"}');
  });

  it("masks bearer tokens", () => {
    const input = "Authorization: Bearer abcdef1234567890ghij";
    const output = redactSensitiveText(input, {
      mode: "tools",
      patterns: defaults,
    });
    expect(output).toBe("Authorization: Bearer abcdef…ghij");
  });

  it("masks bot-style tokens", () => {
    const input = "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef";
    const output = redactSensitiveText(input, {
      mode: "tools",
      patterns: defaults,
    });
    expect(output).toBe("123456…cdef");
  });

  it("masks bot API URL tokens", () => {
    const input =
      "GET https://api.example.test/bot123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef/getMe HTTP/1.1";
    const output = redactSensitiveText(input, {
      mode: "tools",
      patterns: defaults,
    });
    expect(output).toBe("GET https://api.example.test/bot123456…cdef/getMe HTTP/1.1");
  });

  it("masks sensitive URL query params while preserving non-sensitive params", () => {
    const input = "GET /_matrix/client/v3/sync?access_token=abcdef1234567890ghij&since=123";
    const output = redactSensitiveText(input, {
      mode: "tools",
      patterns: defaults,
    });
    expect(output).toBe("GET /_matrix/client/v3/sync?access_token=abcdef…ghij&since=123");
  });

  it("treats sensitive URL query param names case-insensitively", () => {
    const input = "connect https://gateway.example/ws?Access-Token=short-token&ok=1";
    const output = redactSensitiveText(input, {
      mode: "tools",
      patterns: defaults,
    });
    expect(output).toBe("connect https://gateway.example/ws?Access-Token=***&ok=1");
  });

  it("masks standalone credential assignments outside URLs", () => {
    const input = "connecting with token=abcdef1234567890ghij now";
    const output = redactSensitiveText(input, {
      mode: "tools",
      patterns: defaults,
    });
    expect(output).toBe("connecting with token=abcdef…ghij now");
  });

  it("redacts short tokens fully", () => {
    const input = "TOKEN=shortvalue";
    const output = redactSensitiveText(input, {
      mode: "tools",
      patterns: defaults,
    });
    expect(output).toBe("TOKEN=***");
  });

  it("redacts private key blocks", () => {
    const input = [
      "-----BEGIN PRIVATE KEY-----",
      "ABCDEF1234567890",
      "ZYXWVUT987654321",
      "-----END PRIVATE KEY-----",
    ].join("\n");
    const output = redactSensitiveText(input, {
      mode: "tools",
      patterns: defaults,
    });
    expect(output).toBe(
      ["-----BEGIN PRIVATE KEY-----", "…redacted…", "-----END PRIVATE KEY-----"].join("\n"),
    );
  });

  it("honors custom patterns with flags", () => {
    const input = "token=abcdef1234567890ghij";
    const output = redactSensitiveText(input, {
      mode: "tools",
      patterns: ["/token=([A-Za-z0-9]+)/i"],
    });
    expect(output).toBe("token=abcdef…ghij");
  });

  it("falls back to defaults (not zero redaction) for an unsafe nested-repetition custom pattern", () => {
    // A lone ReDoS-rejected pattern used to resolve to [] and disable redaction
    // entirely (#2906). It now degrades to the built-in defaults, so a real secret
    // in the same text is still masked rather than returned verbatim.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const output = redactSensitiveText("OPENAI_API_KEY=sk-1234567890abcdef", {
        mode: "tools",
        patterns: ["(a+)+$"],
      });
      expect(output).toBe("OPENAI_API_KEY=sk-123…cdef");
      expect(output).not.toContain("sk-1234567890abcdef");
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }
  });

  it("redacts large payloads with bounded regex passes", () => {
    const input = `${"x".repeat(40_000)} OPENAI_API_KEY=sk-1234567890abcdef ${"y".repeat(40_000)}`;
    const output = redactSensitiveText(input, {
      mode: "tools",
      patterns: defaults,
    });
    expect(output).toContain("OPENAI_API_KEY=sk-123…cdef");
  });

  it("skips redaction when mode is off", () => {
    const input = "OPENAI_API_KEY=sk-1234567890abcdef";
    const output = redactSensitiveText(input, {
      mode: "off",
      patterns: defaults,
    });
    expect(output).toBe(input);
  });

  it("masks hook-token CLI flags", () => {
    const input = "remoteclaw --hook-token abcdef1234567890ghij start";
    const output = redactSensitiveText(input, {
      mode: "tools",
      patterns: defaults,
    });
    expect(output).toBe("remoteclaw --hook-token abcdef…ghij start");
  });

  it("masks payment credential JSON fields without redacting unrelated amounts", () => {
    const input =
      '{"card_number":"4242424242424242","cvc":"123","sharedPaymentToken":"spt_abcdefghijklmnopqrstuvwxyz","payment_credential":"paycred_abcdefghijklmnopqrstuvwxyz","amount":"4200"}';
    const output = redactSensitiveText(input, {
      mode: "tools",
      patterns: defaults,
    });
    expect(output).toBe(
      '{"card_number":"***","cvc":"***","sharedPaymentToken":"spt_ab…wxyz","payment_credential":"paycre…wxyz","amount":"4200"}',
    );
  });

  it("masks payment credential assignments and flags", () => {
    const input = [
      "LINK_CARD_NUMBER=4242424242424242",
      "LINK_CVC=123",
      "shared_payment_token=spt_abcdefghijklmnopqrstuvwxyz",
      "--payment-credential paycred_abcdefghijklmnopqrstuvwxyz",
      "--card-number 4000056655665556",
    ].join("\n");
    const output = redactSensitiveText(input, {
      mode: "tools",
      patterns: defaults,
    });
    expect(output).toContain("LINK_CARD_NUMBER=***");
    expect(output).toContain("LINK_CVC=***");
    expect(output).toContain("shared_payment_token=spt_ab…wxyz");
    expect(output).toContain("--payment-credential paycre…wxyz");
    expect(output).toContain("--card-number ***");
  });

  it("masks payment credential URL query parameters", () => {
    const input =
      "POST /authorize?shared_payment_token=spt_abcdefghijklmnopqrstuvwxyz&card_number=4242424242424242&amount=4200";
    const output = redactSensitiveText(input, {
      mode: "tools",
      patterns: defaults,
    });
    expect(output).toBe(
      "POST /authorize?shared_payment_token=spt_ab…wxyz&card_number=***&amount=4200",
    );
  });

  it("masks Tencent Cloud SecretId (AKID prefix)", () => {
    const input = "SecretId is AKIDZ8EXAMPLEFAKE01KEY99TEST";
    const output = redactSensitiveText(input, {
      mode: "tools",
      patterns: defaults,
    });
    expect(output).toBe("SecretId is AKIDZ8…TEST");
  });

  it("masks Alibaba Cloud AccessKey ID (LTAI prefix)", () => {
    const input = "AccessKeyId=LTAI5tExampleFakeKeyXyz9";
    const output = redactSensitiveText(input, {
      mode: "tools",
      patterns: defaults,
    });
    expect(output).toBe("AccessKeyId=LTAI5t…Xyz9");
  });

  it("masks HuggingFace tokens (hf_ prefix)", () => {
    const input = "hf_ABCDEFghijklmnopqrstuv";
    const output = redactSensitiveText(input, {
      mode: "tools",
      patterns: defaults,
    });
    expect(output).toBe("hf_ABC…stuv");
  });

  it("masks Replicate tokens (r8_ prefix)", () => {
    const input = "r8_ABCDEFghijklmnopqrstuv";
    const output = redactSensitiveText(input, {
      mode: "tools",
      patterns: defaults,
    });
    expect(output).toBe("r8_ABC…stuv");
  });

  it("masks AWS long-term access-key IDs (AKIA prefix)", () => {
    const input = "AccessKeyId is AKIAIOSFODNN7EXAMPLE";
    const output = redactSensitiveText(input, {
      mode: "tools",
      patterns: defaults,
    });
    expect(output).toBe("AccessKeyId is AKIAIO…MPLE");
  });

  it("does not over-mask an AKIA sequence that appears mid-word", () => {
    const input = "prefixAKIAIOSFODNN7EXAMPLE stays visible";
    const output = redactSensitiveText(input, {
      mode: "tools",
      patterns: defaults,
    });
    expect(output).toBe(input);
  });

  it("does not mask a lowercase akia-prefixed token (case-sensitive form)", () => {
    const input = "value akiaiosfodnn7example stays";
    const output = redactSensitiveText(input, {
      mode: "tools",
      patterns: defaults,
    });
    expect(output).toBe(input);
  });

  it("redacts quote/backtick-adjacent lowercase credential keys in key=value form (#2852)", () => {
    // A lowercase key touching a quote/backtick fell through both the ENV pattern
    // (uppercase-only) and the standalone pattern (leading boundary excluded quote chars),
    // leaking the value. The broadened boundary now redacts these.
    const secret = "abcdef1234567890ghij";
    const cases = [
      `"token=${secret}"`,
      `{"cmd":"token=${secret}"}`,
      `\`token=${secret}\``,
      `'password=${secret}'`,
    ];
    for (const input of cases) {
      const output = redactSensitiveText(input, {
        mode: "tools",
        patterns: defaults,
      });
      expect(output).not.toContain("1234567890");
    }
  });

  it("keeps existing credential-assignment forms redacted after boundary broadening (#2852)", () => {
    const bare = redactSensitiveText("token=abcdef1234567890ghij", {
      mode: "tools",
      patterns: defaults,
    });
    expect(bare).toBe("token=abcdef…ghij");
    const quotedValue = redactSensitiveText('token="abcdef1234567890ghij"', {
      mode: "tools",
      patterns: defaults,
    });
    expect(quotedValue).not.toContain("1234567890");
    const jsonColon = redactSensitiveText('{"token":"abcdef1234567890ghij"}', {
      mode: "tools",
      patterns: defaults,
    });
    expect(jsonColon).not.toContain("1234567890");
  });

  it("does not over-mask quoted credential-key references without an assignment (#2852)", () => {
    const diagnostic = 'Unrecognized key: "token"';
    expect(
      redactSensitiveText(diagnostic, {
        mode: "tools",
        patterns: defaults,
      }),
    ).toBe(diagnostic);
    const fieldRef = 'the "token" field is required';
    expect(
      redactSensitiveText(fieldRef, {
        mode: "tools",
        patterns: defaults,
      }),
    ).toBe(fieldRef);
  });

  const SECRET = "abcdef1234567890ghij";
  const redact = (input: string) =>
    redactSensitiveText(input, { mode: "tools", patterns: defaults });

  it("redacts standalone credential assignments after any non-word delimiter (#2902)", () => {
    // The previous leading boundary was a delimiter whitelist accepting only
    // whitespace/comma/semicolon/quote/backtick, so every other delimiter leaked. `\b` is a
    // strict superset of that whitelist. Confidentiality is what this closes: no case leaks.
    const cases = [
      `(token=${SECRET})`,
      `[token=${SECRET}]`,
      `{cmd:token=${SECRET}}`,
      `call:token=${SECRET}`,
      `opts.token=${SECRET}`,
      `--token=${SECRET}`,
      `<token=${SECRET}>`,
      `/token=${SECRET}`,
    ];
    for (const input of cases) {
      expect(redact(input), `leaked: ${input}`).not.toContain(SECRET);
    }
  });

  it("masks to an exact start…end band when no delimiter trails the value (#2902)", () => {
    // Delimiters outside the value class `[^\s&#]+` do not enter the capture, so the band is
    // exactly maskToken's image.
    const cases = [
      `call:token=${SECRET}`,
      `opts.token=${SECRET}`,
      `--token=${SECRET}`,
      `/token=${SECRET}`,
    ];
    for (const input of cases) {
      expect(redact(input), `wrong band: ${input}`).toBe(input.replace(SECRET, "abcdef…ghij"));
    }
  });

  it("masks to an exact band when a closing delimiter trails the value (#2907)", () => {
    // FLIPPED BY #2907. HEAD's value class `[^\s&#]+` admitted `)` `]` `}` `>`, so a closing
    // delimiter was captured INTO the value and supplied the mask's last KEEP_END chars:
    // `(token=<secret>)` -> `(token=abcdef…hij)`. The secret was still masked — confidentiality
    // held — but the tail was NOT the token's tail, so the same token masked DIFFERENTLY depending
    // on the punctuation around it, breaking the cross-line correlation the 6+4 shape exists to
    // provide. It landed hardest on exactly the bracket delimiters #2902 had just fixed.
    // The narrowed class excludes them, so the band is now exactly maskToken's image.
    expect(redact(`(token=${SECRET})`)).toBe("(token=abcdef…ghij)");
    expect(redact(`[token=${SECRET}]`)).toBe("[token=abcdef…ghij]");
    expect(redact(`<token=${SECRET}>`)).toBe("<token=abcdef…ghij>");
  });

  it("still refuses to fire mid-word after boundary broadening (#2902)", () => {
    // `\b` is a superset of the old whitelist but is still a word boundary, so a longer word
    // merely ENDING in a credential key is untouched.
    for (const input of [`mytoken=${SECRET}`, `xsecret=${SECRET}`]) {
      expect(redact(input), `over-masked: ${input}`).toBe(input);
    }
  });

  it("redacts compound lowercase credential keys at standalone position (#2903)", () => {
    // `_` is a word character, so `auth_token=` has NO word boundary before `token`: the generic
    // `token` alternative can never reach it and the #2902 boundary fix alone cannot help. These
    // keys are enumerated explicitly. Hyphenated spellings need no entry — the hyphen IS a
    // boundary, so generic `token` already catches `auth-token=`. Both spellings pinned anyway.
    const keys = [
      "id_token",
      "auth_token",
      "auth-token",
      "authtoken",
      "hook_token",
      "hook-token",
      "client_secret",
      "client-secret",
      "app_secret",
      "app-secret",
      "jwt",
      "credential",
    ];
    for (const key of keys) {
      expect(redact(`connecting with ${key}=${SECRET} now`), `leaked: ${key}`).toBe(
        `connecting with ${key}=abcdef…ghij now`,
      );
    }
  });

  it("keeps the standalone key set contained in the URL key set (#2903 losslessness)", () => {
    // The standalone pattern refuses to fire at URL position (its lookbehind blocks `?`/`&`).
    // That is only lossless because the URL pattern's key set is a SUPERSET: every key the
    // standalone pattern would redact must still be redacted at URL position by the URL pattern.
    //
    // This is the invariant that governs every future key addition: a key added to the standalone
    // set and NOT to the URL set silently stops being redacted the moment it appears in a query
    // string. The `authorization` / `private_key` keys (#2904) and the prefixed compounds (#2905)
    // are listed here because they were added to the standalone set, so they MUST hold at URL
    // position too. Extend this list whenever the standalone key set grows.
    const standaloneKeys = [
      "access_token",
      "refresh_token",
      "id_token",
      "auth_token",
      "auth-token",
      "authtoken",
      "hook_token",
      "hook-token",
      "hooktoken",
      "api_key",
      "api-key",
      "apikey",
      "client_secret",
      "client-secret",
      "clientsecret",
      "app_secret",
      "app-secret",
      "appsecret",
      "jwt",
      "token",
      "secret",
      "password",
      "passwd",
      "credential",
      "card_number",
      "card_cvc",
      "card_cvv",
      "cvc",
      "cvv",
      "security_code",
      "payment_credential",
      "shared_payment_token",
      // Added to the standalone set by #2904 — containment requires them here.
      "authorization",
      "private_key",
      "private-key",
      "privatekey",
      // Added to the standalone set by #2905 — containment requires them here.
      "csrf_token",
      "csrf-token",
      "session_token",
      "session-token",
      "webhook_secret",
      "webhook-secret",
      "signing_secret",
      "signing-secret",
      "bot_token",
      "bot-token",
      "user_password",
      "user-password",
    ];
    for (const key of standaloneKeys) {
      expect(redact(`GET /x?${key}=${SECRET}&ok=1`), `URL-position leak: ${key}`).not.toContain(
        SECRET,
      );
    }
  });

  it("does not collapse the URL-masked band when the standalone pattern re-enters", () => {
    // `?auth-token=` has a word boundary at `-|token`, so the standalone pattern's `\b` can
    // re-enter INSIDE the query key. The value there is already masked; re-masking would collapse
    // the legible 11-char band to `***` (11 < DEFAULT_REDACT_MIN_LENGTH) and destroy the token
    // correlation the `start…end` shape exists for. The band must survive intact.
    for (const key of ["auth-token", "access-token", "hook-token", "client-secret", "api-key"]) {
      const output = redact(`GET /x?${key}=${SECRET}&ok=1`);
      expect(output, `collapsed: ${key}`).toBe(`GET /x?${key}=abcdef…ghij&ok=1`);
      expect(output, `collapsed: ${key}`).not.toContain("***");
    }
  });

  it("holds ENV-position parity for the keys #2903 adds to the standalone pattern", () => {
    // These already carry a KEY/TOKEN/SECRET suffix, so the ENV pattern masked them at HEAD and
    // `_` blocked standalone re-entry. Adding them to the standalone pattern makes it re-match
    // under `i` — without maskToken's idempotence guard each would REGRESS from `abcdef…ghij` to
    // `***`. Parity here IS the guard working; this test fails if the guard is removed.
    for (const key of ["AUTH_TOKEN", "ID_TOKEN", "HOOK_TOKEN", "CLIENT_SECRET", "APP_SECRET"]) {
      expect(redact(`${key}=${SECRET}`), `regressed: ${key}`).toBe(`${key}=abcdef…ghij`);
    }
  });

  it("applies maskToken's stated reveal at ENV position (exposure increase — see PR)", () => {
    // Each of these is matched by BOTH the case-sensitive ENV pattern and the case-insensitive
    // standalone pattern, so at HEAD the second pass re-masked the mask and collapsed it to
    // `***`. The idempotence guard stops that, so each now reveals KEEP_START+KEEP_END chars —
    // the same as every other position. This INCREASES what appears in logs: 0 bytes -> 10.
    // Deliberate: the `***` was an accident of 11 < 18, never a policy. Payment keys are
    // included; an 18-19 digit PAN at CARD_NUMBER= logs as first6…last4.
    const keys = [
      "TOKEN",
      "SECRET",
      "PASSWORD",
      "PASSWD",
      "API_KEY",
      "APIKEY",
      "ACCESS_TOKEN",
      "REFRESH_TOKEN",
      "CARD_NUMBER",
      "CARD_CVC",
      "CARD_CVV",
      "CVC",
      "CVV",
      "SECURITY_CODE",
      "PAYMENT_CREDENTIAL",
      "SHARED_PAYMENT_TOKEN",
    ];
    for (const key of keys) {
      expect(redact(`${key}=${SECRET}`), `not applied: ${key}`).toBe(`${key}=abcdef…ghij`);
    }
  });

  it("closes the ENV-position cleartext leak for suffix-less credential keys (#2903)", () => {
    // `JWT`/`CREDENTIAL` carry no KEY/TOKEN/SECRET/PASSWORD suffix for the ENV pattern to match
    // on, so at HEAD they leaked in FULL at ENV position. Adding them to the standalone pattern
    // closes that — a leak fix, not an exposure change.
    for (const key of ["JWT", "CREDENTIAL"]) {
      expect(redact(`${key}=${SECRET}`), `still leaking: ${key}`).toBe(`${key}=abcdef…ghij`);
    }
  });

  it("masks a fresh secret in a run that already contains a mask", () => {
    // Any idempotence guard keyed on "this RUN contains U+2026" would be disarmed by an
    // already-masked NEIGHBOUR and let the fresh secret through in full. maskToken's guard keys on
    // the TOKEN itself, so the rest of the run is irrelevant to it — which is what this pins.
    expect(redact(`token=${SECRET},other=abcdef…ghij`)).not.toContain(SECRET);

    // REFRAMED BY #2907. The neighbour is now a CREDENTIAL key, so it is in scope and masks on its
    // own merit. This assertion previously read `other=${SECRET}` and only passed because the wide
    // value class swept the NON-credential `other=` neighbour into the token's mask — it was
    // asserting an accident of the run-spanning bug, not the guard. Post-narrowing `other=<v>` is
    // out of scope at every position, so a credential key is the honest way to test the guard.
    expect(redact(`token=abcdef…ghij,secret=${SECRET}`)).not.toContain(SECRET);
  });

  it("masks each credential assignment independently and keeps the neighbour diagnostic (#2907)", () => {
    // The positive demonstration of #2907. HEAD's value class admitted `,`, so the run spanned into
    // the next assignment and `token=<secret>,user=alice` masked as ONE blob — eating the
    // `user=alice` diagnostic AND borrowing the mask tail (`…lice`) from `alice` rather than from
    // the token. Narrowed: the run stops at the comma, the token's own tail is revealed, and the
    // non-credential neighbour survives intact.
    expect(redact(`token=${SECRET},user=alice`)).toBe("token=abcdef…ghij,user=alice");
  });

  it("masks only the credential in a comma-separated run of assignments (#2907)", () => {
    // Same property across a longer run: every non-credential diagnostic beside the secret is
    // preserved verbatim instead of being swallowed into one blob.
    expect(redact(`token=${SECRET},retries=3,region=eu-west-1`)).toBe(
      "token=abcdef…ghij,retries=3,region=eu-west-1",
    );
  });

  it("keeps base64 padding inside the captured value (#2907 value class keeps `=`)", () => {
    // `=` is deliberately KEPT in the narrowed value class. Excluding it would terminate the
    // capture at the padding — stranding `=`/`==` in cleartext beside a truncated mask.
    const padded = "YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo=";
    const output = redact(`token=${padded}`);
    expect(output).not.toContain(padded);
    // Padding sits INSIDE the mask's revealed tail, not stranded next to it.
    expect(output).toMatch(/^token=[A-Za-z0-9]{6}…[A-Za-z0-9]{3}=$/);
  });

  it("keeps the quoted-value form redacted (#2907 value class keeps quotes)", () => {
    // `"` `'` and backtick are deliberately KEPT in the narrowed value class. This pattern is the
    // SOLE handler of `token="<secret>"` — the ENV pattern is uppercase-only and the JSON pattern
    // needs `"key":"value"`. A character class governs the value's FIRST character as well as its
    // rest, so excluding `"` would make the class fail to match AT the opening quote: the pattern
    // would not fire at all and the secret would ship in cleartext. Pinned so that trade cannot be
    // silently reversed while chasing a tidier mask tail.
    for (const input of [`token="${SECRET}"`, `token='${SECRET}'`, `token=\`${SECRET}\``]) {
      expect(redact(input), `leaked: ${input}`).not.toContain(SECRET);
    }
  });

  it("skips exactly maskToken's own image and nothing wider (idempotence guard)", () => {
    // Skip set = exactly maskToken's output shape: length KEEP_START+1+KEEP_END (11) with U+2026
    // at index KEEP_START (6). That is the tightest guard available — and tightest is not empty:
    // an 11-char credential of exactly that shape is returned verbatim instead of `***`. No
    // credential alphabet (base64url, hex, JWT, PEM body) contains U+2026, so the set is empty in
    // practice, not in principle. Pinned so the trade fails loudly if that ever stops holding.
    expect(redact("password=abcdef…ghij")).toBe("password=abcdef…ghij");

    // Right length, no U+2026 at index 6 -> not a mask -> masked normally.
    expect(redact("password=abcdefXghij")).toBe("password=***");
    // U+2026 present, wrong length -> not a mask -> masked normally.
    expect(redact("password=ab…cd")).toBe("password=***");
    // U+2026 present, wrong index -> not a mask -> masked normally.
    expect(redact("password=abcde…fghij")).toBe("password=***");
    // Long value that merely contains U+2026 -> not a mask -> masked normally.
    expect(redact("password=abcdef…ghijklmnopqrstuv")).toBe("password=abcdef…stuv");
  });

  it("redacts prefixed URL-query credential keys (#2905)", () => {
    // FLIPPED BY #2905. `?csrf-token=` used to leak IN FULL at URL position: `[?&]` anchors the URL
    // pattern's alternation to the START of the key, so the generic `token` alternative could never
    // reach the `token` inside `csrf-token`, and the standalone pattern is correctly blocked from
    // URL position by its lookbehind. Neither pattern knew the key. It is now enumerated in the URL
    // key set, so it masks — and the non-secret `&ok=1` beside it is still preserved.
    const output = redact(`GET /x?csrf-token=${SECRET}&ok=1`);
    expect(output).not.toContain(SECRET);
    expect(output).toBe("GET /x?csrf-token=abcdef…ghij&ok=1");
  });

  it("redacts prefixed compound credential keys at BOTH positions, both separators (#2905)", () => {
    // At URL position `[?&]` anchors the alternation to the START of the key, so a generic
    // `token`/`secret`/`password` alternative can never reach the one inside `csrf-token` /
    // `webhook-secret` / `user-password` — the compound must be enumerated.
    //
    // At STANDALONE position the UNDERSCORE spelling is the one that leaks: `_` is a word char, so
    // `csrf_token=` has no `\b` before `token` for the generic alternative to reach through. The
    // hyphen spelling does have one (the hyphen IS a boundary), so it was already caught there —
    // pinned anyway, because the two spellings must not diverge.
    const keys = [
      "csrf-token",
      "csrf_token",
      "session-token",
      "session_token",
      "webhook-secret",
      "webhook_secret",
      "signing-secret",
      "signing_secret",
      "bot-token",
      "bot_token",
      "user-password",
      "user_password",
    ];
    for (const key of keys) {
      expect(redact(`GET /x?${key}=${SECRET}&ok=1`), `URL-position leak: ${key}`).toBe(
        `GET /x?${key}=abcdef…ghij&ok=1`,
      );
      expect(redact(`connecting with ${key}=${SECRET} now`), `standalone leak: ${key}`).toBe(
        `connecting with ${key}=abcdef…ghij now`,
      );
    }
  });

  it("does not over-mask non-credential prefixed keys (#2905 explicit-list discipline)", () => {
    // #2905 is closed with an EXPLICIT list of unambiguous credential compounds. The shorter fix —
    // a broad `[?&](?:[\w-]*[-_])?(?:token|secret|key)=` prefix — would also have swallowed these
    // ordinary, non-secret parameters, masking routine diagnostics into uselessness. That is the
    // trade this test pins: the list must stay explicit, and must not grow an ambiguous key.
    for (const key of [
      "public-key",
      "sort-key",
      "primary-key",
      "partition-key",
      "idempotency-key",
    ]) {
      const input = `GET /x?${key}=${SECRET}&ok=1`;
      expect(redact(input), `over-masked: ${key}`).toBe(input);
    }
  });

  it("keeps a PEM body redacted when the block is the value of a PRIVATE_KEY= assignment (#2904)", () => {
    // THE live leak #2904 closes, and the reason the array is ordered anchored-first.
    //
    // The ENV pattern used to run FIRST, and its value class stops at the first space — so it
    // captured `-----BEGIN` as the "value" of `PRIVATE_KEY=` and masked it to `***`. That destroyed
    // the PEM opener; the PEM pattern could no longer match its own block; and the entire base64
    // body shipped in CLEARTEXT. PEM now runs before every generic family, so the block is redacted
    // before anything can chew its opener.
    const body = "MIIEowIBAAKCAQEAxGZ1kQm9SxWfBnP0tOQiL7VnJ3hYdKcRbFgUvNzMpAeIoQwT";
    const input = [
      "PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----",
      body,
      "-----END RSA PRIVATE KEY-----",
    ].join("\n");
    const output = redact(input);
    // The body is the thing that must never appear. The trailing ENV pass may additionally mask the
    // now-orphaned `-----BEGIN` opener token to `***` — harmless, the body is already redacted.
    expect(output).not.toContain(body);
    expect(output).toContain("…redacted…");
  });

  it("still redacts a bare PEM block after the reorder (#2904)", () => {
    const input = [
      "-----BEGIN PRIVATE KEY-----",
      "ABCDEF1234567890",
      "ZYXWVUT987654321",
      "-----END PRIVATE KEY-----",
    ].join("\n");
    expect(redact(input)).toBe(
      ["-----BEGIN PRIVATE KEY-----", "…redacted…", "-----END PRIVATE KEY-----"].join("\n"),
    );
  });

  it("masks an authorization= assignment at standalone position (#2904)", () => {
    // `authorization` is newly IN the standalone key set — the reorder is what made it safe. It was
    // excluded before because this pattern ran BEFORE the Bearer pattern and its value class stops
    // at whitespace, so it masked the `Bearer` KEYWORD and let the real token through behind it.
    //
    // Bearer form: the Authorization pattern (now first) masks the token; the standalone pattern
    // then masks the residual `Bearer` keyword to `***`. Belt and braces — no token leak.
    const bearer = redact(`authorization=Bearer ${SECRET}`);
    expect(bearer).not.toContain(SECRET);
    expect(bearer).toBe("authorization=*** abcdef…ghij");

    // Opaque form (NO `Bearer` keyword). THIS one leaked in full at HEAD: the Authorization pattern
    // requires the `Bearer` keyword, and `authorization` was not a standalone key, so nothing
    // matched it at all.
    const opaque = redact(`authorization=${SECRET}`);
    expect(opaque).not.toContain(SECRET);
    expect(opaque).toBe("authorization=abcdef…ghij");
  });

  it("keeps the Authorization: Bearer header form masked after the reorder (#2904)", () => {
    // The reorder moved this pattern from last-ish to near-first. It must still behave identically.
    expect(redact(`Authorization: Bearer ${SECRET}`)).toBe("Authorization: Bearer abcdef…ghij");
    expect(redact(`Bearer ${SECRET}`)).toBe("Bearer abcdef…ghij");
  });

  it("masks lowercase private_key= at standalone and URL position (#2904)", () => {
    // Lowercase `private_key=<opaque>` leaked IN FULL at HEAD: the ENV pattern is uppercase-only,
    // and `_` is a word char so the standalone pattern had no `\b` before `key` to reach it with —
    // and it carried no bare `key` alternative anyway. `private[-_]?key` closes both spellings.
    expect(redact(`private_key=${SECRET}`)).toBe("private_key=abcdef…ghij");
    expect(redact(`private-key=${SECRET}`)).toBe("private-key=abcdef…ghij");
    // Containment: both new keys must also mask at URL position (see the losslessness test).
    expect(redact(`GET /x?private_key=${SECRET}&ok=1`)).toBe("GET /x?private_key=abcdef…ghij&ok=1");
    expect(redact(`GET /x?authorization=${SECRET}&ok=1`)).toBe(
      "GET /x?authorization=abcdef…ghij&ok=1",
    );
  });

  it("masks a vendor-prefixed token exactly once under the new order (#2904 reorder safety)", () => {
    // The vendor `sk-` pattern now runs BEFORE the generic families, so the generic pass sees an
    // ALREADY-MASKED value. maskToken's idempotence guard returns it verbatim rather than
    // collapsing the legible 11-char band to `***` (11 < DEFAULT_REDACT_MIN_LENGTH = 18). Parity
    // across all three positions IS that guard holding across the new order — this test fails if
    // the reorder is landed without it.
    const vendor = "sk-1234567890abcdef";
    const outputs = [
      redact(`api_key=${vendor}`),
      redact(`API_KEY=${vendor}`),
      redact(`{"apiKey":"${vendor}"}`),
    ];
    expect(outputs[0]).toBe("api_key=sk-123…cdef");
    expect(outputs[1]).toBe("API_KEY=sk-123…cdef");
    expect(outputs[2]).toBe('{"apiKey":"sk-123…cdef"}');
    for (const output of outputs) {
      expect(output, `collapsed to ***: ${output}`).not.toContain("***");
      expect(output, `leaked: ${output}`).not.toContain(vendor);
    }
  });
});

describe("redactSensitiveText — redactPatterns compilation guard (#2906)", () => {
  const SECRET = "abcdef1234567890ghij";
  const ENV_LINE = "OPENAI_API_KEY=sk-1234567890abcdef";

  beforeEach(() => {
    // The once-per-process diagnostic dedupe is module state; reset it so each test
    // observes the diagnostics for its own input regardless of execution order.
    resetRedactDiagnosticsForTests();
  });

  it("falls back to built-in defaults when every caller pattern is uncompilable", () => {
    // A non-empty redactPatterns list REPLACES the defaults. Before the fix an
    // all-uncompilable list resolved to [] and redactSensitiveText returned its input
    // verbatim — redaction silently disabled while redactSensitive still read enabled.
    // It must degrade to the defaults instead, which still mask the secret.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const output = redactSensitiveText(ENV_LINE, {
        mode: "tools",
        patterns: ["(unclosed-group"],
      });
      expect(output).toBe("OPENAI_API_KEY=sk-123…cdef");
      expect(output).not.toContain("sk-1234567890abcdef");
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }
  });

  it("does not return input verbatim when the sole caller pattern is uncompilable", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const output = redactSensitiveText(`connecting with token=${SECRET} now`, {
        mode: "tools",
        patterns: ["[unterminated-class"],
      });
      expect(output).not.toContain(SECRET);
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }
  });

  it("emits a WARN diagnostic naming the rejected pattern and reason (invalid regex)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      redactSensitiveText(ENV_LINE, { mode: "tools", patterns: ["(bad-regex"] });
      expect(warn).toHaveBeenCalledTimes(1);
      const message = String(warn.mock.calls[0]?.[0] ?? "");
      expect(message).toContain("logging.redactPatterns");
      expect(message).toContain("(bad-regex");
      expect(message).toContain("invalid-regex");
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }
  });

  it("emits a diagnostic for a ReDoS-rejected (unsafe nested repetition) pattern", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      redactSensitiveText(ENV_LINE, { mode: "tools", patterns: ["(a+)+$"] });
      expect(warn).toHaveBeenCalledTimes(1);
      const message = String(warn.mock.calls[0]?.[0] ?? "");
      expect(message).toContain("(a+)+$");
      expect(message).toContain("unsafe-nested-repetition");
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }
  });

  it("emits an ERROR when the whole set is rejected and it falls back to defaults", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      redactSensitiveText(ENV_LINE, { mode: "tools", patterns: ["(fallback-probe"] });
      expect(error).toHaveBeenCalledTimes(1);
      const message = String(error.mock.calls[0]?.[0] ?? "");
      expect(message).toContain("falling back to built-in default redaction patterns");
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }
  });

  it("keeps compiled caller patterns and warns only about the rejected one (partial failure)", () => {
    // One good pattern + one broken. The good one must still apply; the broken one is
    // reported but does NOT trigger fallback (the resolved set is non-empty).
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const output = redactSensitiveText(`token=${SECRET}`, {
        mode: "tools",
        patterns: ["/token=([A-Za-z0-9]+)/i", "(broken-partial"],
      });
      expect(output).toBe("token=abcdef…ghij");
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0] ?? "")).toContain("(broken-partial");
      // Non-empty resolved set -> no fallback -> no error.
      expect(error).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }
  });

  it("emits each distinct diagnostic only once across repeated calls", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      for (let i = 0; i < 5; i += 1) {
        redactSensitiveText(ENV_LINE, { mode: "tools", patterns: ["(dedupe-probe"] });
      }
      expect(warn).toHaveBeenCalledTimes(1);
      expect(error).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }
  });

  it("bounds re-entry depth to one when captured console routes diagnostics back through redaction", () => {
    // enableConsoleCapture() patches console.* to re-run redactSensitiveText on each
    // console line. Emitting a diagnostic from inside resolvePatterns therefore
    // re-enters it. Without the `emitting` guard, a config of N distinct broken
    // patterns recurses to depth ~N (stack-overflow risk); the guard suppresses
    // emission during a re-entry, so depth never exceeds 1 regardless of N. Measuring
    // depth (not relying on an actual overflow) makes this environment-independent.
    const broken = Array.from({ length: 6 }, (_, i) => `(broken-${i}`);
    let depth = 0;
    let maxDepth = 0;
    let warnCalls = 0;
    let errorCalls = 0;
    const reenter = (msg?: unknown) => {
      depth += 1;
      maxDepth = Math.max(maxDepth, depth);
      try {
        // mimic console.ts forward(): re-redact the console line with the same config
        redactSensitiveText(String(msg), { mode: "tools", patterns: broken });
      } finally {
        depth -= 1;
      }
    };
    const warn = vi.spyOn(console, "warn").mockImplementation((msg?: unknown) => {
      warnCalls += 1;
      reenter(msg);
    });
    const error = vi.spyOn(console, "error").mockImplementation((msg?: unknown) => {
      errorCalls += 1;
      reenter(msg);
    });
    try {
      expect(() =>
        redactSensitiveText("OPENAI_API_KEY=sk-1234567890abcdef", {
          mode: "tools",
          patterns: broken,
        }),
      ).not.toThrow();
      expect(maxDepth).toBeLessThanOrEqual(1);
      expect(warnCalls).toBe(broken.length);
      expect(errorCalls).toBe(1);
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }
  });

  it("compiles every built-in DEFAULT_REDACT_PATTERNS entry to a non-null RegExp", () => {
    // A dropped default silently weakens the shipped redaction posture with no operator
    // signal; this makes such a regression loud at CI (#2906). Confined to a read of
    // getDefaultRedactPatterns(); it does not touch the pattern array itself.
    const failures = getDefaultRedactPatterns()
      .map((raw) => ({ raw, ...compileRedactPatternForTests(raw) }))
      .filter((entry) => entry.regex === null);
    expect(
      failures,
      `these DEFAULT_REDACT_PATTERNS entries do not compile: ${JSON.stringify(
        failures.map((entry) => ({ pattern: entry.raw, reason: entry.reason })),
      )}`,
    ).toEqual([]);
  });
});
