import { resolveEnvApiKey } from "../agents/model-auth.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import { formatApiKeyPreview } from "./auth-choice.api-key.js";

export function normalizeTokenProviderInput(
  tokenProvider: string | null | undefined,
): string | undefined {
  const normalized = String(tokenProvider ?? "")
    .trim()
    .toLowerCase();
  return normalized || undefined;
}

export async function maybeApplyApiKeyFromOption(params: {
  token: string | undefined;
  tokenProvider: string | undefined;
  expectedProviders: string[];
  normalize: (value: string) => string;
  setCredential: (apiKey: string) => Promise<void>;
}): Promise<string | undefined> {
  const tokenProvider = normalizeTokenProviderInput(params.tokenProvider);
  const expectedProviders = params.expectedProviders
    .map((provider) => normalizeTokenProviderInput(provider))
    .filter((provider): provider is string => Boolean(provider));
  if (!params.token || !tokenProvider || !expectedProviders.includes(tokenProvider)) {
    return undefined;
  }
  const apiKey = params.normalize(params.token);
  await params.setCredential(apiKey);
  return apiKey;
}

export async function ensureApiKeyFromOptionEnvOrPrompt(params: {
  token: string | undefined;
  tokenProvider: string | undefined;
  expectedProviders: string[];
  provider: string;
  envLabel: string;
  promptMessage: string;
  normalize: (value: string) => string;
  validate: (value: string) => string | undefined;
  prompter: WizardPrompter;
  setCredential: (apiKey: string) => Promise<void>;
  noteMessage?: string;
  noteTitle?: string;
}): Promise<string> {
  const optionApiKey = await maybeApplyApiKeyFromOption({
    token: params.token,
    tokenProvider: params.tokenProvider,
    expectedProviders: params.expectedProviders,
    normalize: params.normalize,
    setCredential: params.setCredential,
  });
  if (optionApiKey) {
    return optionApiKey;
  }

  if (params.noteMessage) {
    await params.prompter.note(params.noteMessage, params.noteTitle);
  }

  return await ensureApiKeyFromEnvOrPrompt({
    provider: params.provider,
    envLabel: params.envLabel,
    promptMessage: params.promptMessage,
    normalize: params.normalize,
    validate: params.validate,
    prompter: params.prompter,
    setCredential: params.setCredential,
  });
}

export async function ensureApiKeyFromEnvOrPrompt(params: {
  provider: string;
  envLabel: string;
  promptMessage: string;
  normalize: (value: string) => string;
  validate: (value: string) => string | undefined;
  prompter: WizardPrompter;
  setCredential: (apiKey: string) => Promise<void>;
}): Promise<string> {
  const envKey = resolveEnvApiKey(params.provider);
  if (envKey) {
    const useExisting = await params.prompter.confirm({
      message: `Use existing ${params.envLabel} (${envKey.source}, ${formatApiKeyPreview(envKey.apiKey)})?`,
      initialValue: true,
    });
    if (useExisting) {
      await params.setCredential(envKey.apiKey);
      return envKey.apiKey;
    }
  }

  const key = await params.prompter.text({
    message: params.promptMessage,
    validate: params.validate,
  });
  const apiKey = params.normalize(String(key ?? ""));
  await params.setCredential(apiKey);
  return apiKey;
}
