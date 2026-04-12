// Gutted in RemoteClaw fork (Middleware Boundary Principle)
// Only resolveSecretInputModeForEnvSelection and promptSecretRefForOnboarding restored
// (needed for wizard SecretRef workflows).

import type { RemoteClawConfig } from "../config/config.js";
import { isValidEnvSecretRefId, type SecretRef } from "../config/types.secrets.js";
import { resolveSecretRefString } from "../secrets/resolve.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import type { SecretInputMode } from "./onboard-types.js";

export type SecretInputModePromptCopy = {
  modeMessage?: string;
  plaintextLabel?: string;
  plaintextHint?: string;
  refLabel?: string;
  refHint?: string;
};
export type SecretRefSetupPromptCopy = {
  sourceMessage?: string;
  envVarPlaceholder?: string;
  envVarFormatError?: string;
  noProvidersMessage?: string;
};

export const ensureApiKeyFromEnvOrPrompt = (..._args: unknown[]) => Promise.resolve("" as string);
export const ensureApiKeyFromOptionEnvOrPrompt = (..._args: unknown[]) =>
  Promise.resolve("" as string);
export const maybeApplyApiKeyFromOption = (..._args: unknown[]) => undefined as unknown;
export const normalizeSecretInputModeInput = (..._args: unknown[]) => undefined as unknown;
export const normalizeTokenProviderInput = (..._args: unknown[]) => undefined as unknown;
export const promptSecretRefForSetup = (..._args: unknown[]) =>
  Promise.resolve({ ref: "", resolvedValue: undefined as string | undefined });
export const applyDefaultModelChoice = (..._args: unknown[]) => undefined as unknown;

export async function resolveSecretInputModeForEnvSelection(params: {
  prompter: Pick<WizardPrompter, "select">;
  explicitMode?: SecretInputMode;
  copy?: SecretInputModePromptCopy;
}): Promise<SecretInputMode> {
  if (params.explicitMode) {
    return params.explicitMode;
  }
  if (typeof params.prompter.select !== "function") {
    return "plaintext";
  }
  const selected = await params.prompter.select<SecretInputMode>({
    message: params.copy?.modeMessage ?? "How do you want to provide this API key?",
    initialValue: "plaintext",
    options: [
      {
        value: "plaintext",
        label: params.copy?.plaintextLabel ?? "Paste API key now",
        hint: params.copy?.plaintextHint ?? "Stores the key directly in RemoteClaw config",
      },
      {
        value: "ref",
        label: params.copy?.refLabel ?? "Use external secret provider",
        hint:
          params.copy?.refHint ??
          "Stores a reference to env or configured external secret providers",
      },
    ],
  });
  return selected === "ref" ? "ref" : "plaintext";
}

export async function promptSecretRefForOnboarding(params: {
  provider: string;
  config: RemoteClawConfig;
  prompter: WizardPrompter;
  preferredEnvVar?: string;
  copy?: SecretRefSetupPromptCopy;
  env?: NodeJS.ProcessEnv;
}): Promise<{ ref: SecretRef; resolvedValue: string }> {
  const env = params.env ?? process.env;
  const defaultEnvVar = params.preferredEnvVar ?? "";

  const envVarInput = await params.prompter.text({
    message: params.copy?.sourceMessage ?? "Environment variable name",
    placeholder: params.copy?.envVarPlaceholder ?? defaultEnvVar,
    initialValue: defaultEnvVar,
    validate: (value: string) =>
      isValidEnvSecretRefId(value.trim())
        ? undefined
        : "Must be an uppercase env var (e.g. MY_SECRET_KEY)",
  });

  const envVarName = String(envVarInput ?? "").trim() || defaultEnvVar;
  const ref: SecretRef = {
    source: "env",
    provider: "default",
    id: envVarName,
  };

  const resolvedValue = await resolveSecretRefString(ref, { config: params.config, env });
  return { ref, resolvedValue };
}
