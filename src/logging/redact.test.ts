import { describe, expect, it } from "vitest";
import { getDefaultRedactPatterns, redactSensitiveText } from "./redact.js";

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

  it("ignores unsafe nested-repetition custom patterns", () => {
    const input = `${"a".repeat(28)}!`;
    const output = redactSensitiveText(input, {
      mode: "tools",
      patterns: ["(a+)+$"],
    });
    expect(output).toBe(input);
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

  it("borrows the mask tail from a trailing closing delimiter (#2907, pinned as-is)", () => {
    // The value class admits `)` `]` `}` `>`, so a closing delimiter is captured INTO the value
    // and supplies the mask's last KEEP_END chars: `(token=<secret>)` -> `(token=abcdef…hij)`.
    // The secret is still masked — confidentiality holds — but the tail is NOT the token's tail,
    // so the same token masks differently depending on surrounding punctuation. That breaks the
    // cross-line correlation the 6+4 shape exists to provide. It lands hardest on exactly the
    // bracket delimiters #2902 fixes. Value class deliberately byte-identical here; see #2907.
    expect(redact(`(token=${SECRET})`)).toBe("(token=abcdef…hij)");
    expect(redact(`[token=${SECRET}]`)).toBe("[token=abcdef…hij]");
    expect(redact(`<token=${SECRET}>`)).toBe("<token=abcdef…hij>");
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
    // That is only lossless because the URL pattern's key set is a superset: every key the
    // standalone pattern would redact must still be redacted at URL position by the URL pattern.
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
    // The value class admits `,` and `=`, so a whitespace-delimited run spans adjacent
    // assignments (#2907). Any guard keyed on "this RUN contains U+2026" is therefore disarmed by
    // an already-masked NEIGHBOUR and lets the fresh secret through in full. maskToken's guard
    // keys on the token itself, so the rest of the run is irrelevant to it.
    expect(redact(`token=${SECRET},other=abcdef…ghij`)).not.toContain(SECRET);
    expect(redact(`token=abcdef…ghij,other=${SECRET}`)).not.toContain(SECRET);
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

  it("does not redact prefixed URL-query credential keys (known gap, #2905)", () => {
    // `?csrf-token=` leaks at URL position: the URL pattern does not know the key, and the
    // standalone pattern is correctly blocked from URL position by its lookbehind. Pre-existing
    // at HEAD — NOT introduced here. The fix belongs in the URL key set, where it is legible and
    // covers both separators. This pins current behavior so #2905 flips it deliberately.
    const input = `GET /x?csrf-token=${SECRET}&ok=1`;
    expect(redact(input)).toBe(input);
  });
});
