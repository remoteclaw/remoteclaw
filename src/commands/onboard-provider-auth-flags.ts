import type { AuthChoice, OnboardOptions } from "./onboard-types.js";

type OnboardProviderAuthOptionKey = keyof Pick<
  OnboardOptions,
  "anthropicApiKey" | "openaiApiKey" | "geminiApiKey" | "codexApiKey"
>;

export type OnboardProviderAuthFlag = {
  optionKey: OnboardProviderAuthOptionKey;
  authChoice: AuthChoice;
  cliFlag: `--${string}`;
  cliOption: `--${string} <key>`;
  description: string;
};

// Shared source for provider API-key flags used by CLI registration + non-interactive inference.
// Scoped to the four runtimes RemoteClaw actually consumes (Claude/OpenAI/Gemini/Codex) — all
// other provider keys were upstream artifacts with no live consumer in the fork.
export const ONBOARD_PROVIDER_AUTH_FLAGS: ReadonlyArray<OnboardProviderAuthFlag> = [
  {
    optionKey: "anthropicApiKey",
    authChoice: "apiKey",
    cliFlag: "--anthropic-api-key",
    cliOption: "--anthropic-api-key <key>",
    description: "Anthropic API key",
  },
  {
    optionKey: "openaiApiKey",
    authChoice: "openai-api-key",
    cliFlag: "--openai-api-key",
    cliOption: "--openai-api-key <key>",
    description: "OpenAI API key",
  },
  {
    optionKey: "geminiApiKey",
    authChoice: "gemini-api-key",
    cliFlag: "--gemini-api-key",
    cliOption: "--gemini-api-key <key>",
    description: "Gemini API key",
  },
  {
    optionKey: "codexApiKey",
    authChoice: "codex-api-key",
    cliFlag: "--codex-api-key",
    cliOption: "--codex-api-key <key>",
    description: "Codex API key",
  },
];
