// Gutted in RemoteClaw fork (Middleware Boundary Principle)

export type SecretInputModePromptCopy = Record<string, unknown>;
export type SecretRefSetupPromptCopy = Record<string, unknown>;

export const ensureApiKeyFromEnvOrPrompt = (..._args: unknown[]) => Promise.resolve("" as string);
export const ensureApiKeyFromOptionEnvOrPrompt = (..._args: unknown[]) =>
  Promise.resolve("" as string);
export const maybeApplyApiKeyFromOption = (..._args: unknown[]) => undefined as unknown;
export const normalizeSecretInputModeInput = (..._args: unknown[]) => undefined as unknown;
export const normalizeTokenProviderInput = (..._args: unknown[]) => undefined as unknown;
export const promptSecretRefForSetup = (..._args: unknown[]) => Promise.resolve({ ref: "" });
export const resolveSecretInputModeForEnvSelection = (..._args: unknown[]) =>
  Promise.resolve("plaintext" as string);
export const promptSecretRefForOnboarding = (..._args: unknown[]) => Promise.resolve({ ref: "" });
export const applyDefaultModelChoice = (..._args: unknown[]) => undefined as unknown;
