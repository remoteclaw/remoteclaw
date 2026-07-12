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
});
