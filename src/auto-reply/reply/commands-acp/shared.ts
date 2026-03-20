// Stubbed — the upstream ACP commands subsystem has been gutted in this fork.
// Provides the minimal export surface that shared.test.ts depends on.

export type ParseSteerResult =
  | { ok: true; value: { sessionToken: string; instruction: string } }
  | { ok: false; error: string };

const UNICODE_DASH_RE = /^[\u2013\u2014]/;

/**
 * Parses steer input tokens into a session token and instruction string.
 * Recognises `--session <key>` (with unicode em/en-dash normalisation)
 * and collects the rest as the instruction.
 */
export function parseSteerInput(tokens: string[]): ParseSteerResult {
  let sessionToken: string | undefined;
  const instructionParts: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    // Normalise unicode dashes to ASCII -- for flag detection only
    const normalised = token.replace(UNICODE_DASH_RE, "--");

    if (normalised === "--session" && i + 1 < tokens.length) {
      sessionToken = tokens[++i];
      continue;
    }

    instructionParts.push(token);
  }

  if (!sessionToken) {
    return { ok: false, error: "Missing --session flag" };
  }

  return {
    ok: true,
    value: {
      sessionToken,
      instruction: instructionParts.join(" "),
    },
  };
}
