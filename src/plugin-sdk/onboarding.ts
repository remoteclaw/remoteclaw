import type { RemoteClawConfig } from "../config/config.js";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "../routing/session-key.js";
import type { WizardPrompter } from "../wizard/prompts.js";

export type PromptAccountIdParams = {
  cfg: RemoteClawConfig;
  prompter: WizardPrompter;
  label: string;
  currentId?: string;
  listAccountIds: (cfg: RemoteClawConfig) => string[];
  defaultAccountId: string;
};

export async function promptAccountId(params: PromptAccountIdParams): Promise<string> {
  const existingIds = params.listAccountIds(params.cfg);
  const existingNormalized = new Set(existingIds.map((id) => normalizeAccountId(id)));
  const initial = params.currentId?.trim() || params.defaultAccountId || DEFAULT_ACCOUNT_ID;
  const choice = await params.prompter.select({
    message: `${params.label} account`,
    options: [
      ...existingIds.map((id) => ({
        value: id,
        label: id === DEFAULT_ACCOUNT_ID ? "default (primary)" : id,
      })),
      { value: "__new__", label: "Add a new account" },
    ],
    initialValue: initial,
  });

  if (choice !== "__new__") {
    return normalizeAccountId(choice);
  }

  const entered = await params.prompter.text({
    message: `New ${params.label} account id`,
    validate: (value) => {
      if (!value?.trim()) {
        return "Required";
      }
      // #586: reject ids that collide with an existing account — normalized, so
      // "Pelykh" is caught against an existing "pelykh". Otherwise the new tokens
      // silently overwrite the existing account's configuration.
      if (existingNormalized.has(normalizeAccountId(value))) {
        return `Account "${value.trim()}" already exists — pick a different id`;
      }
      return undefined;
    },
  });
  const normalized = normalizeAccountId(String(entered));
  if (String(entered).trim() !== normalized) {
    await params.prompter.note(
      `Normalized account id to "${normalized}".`,
      `${params.label} account`,
    );
  }
  return normalized;
}
