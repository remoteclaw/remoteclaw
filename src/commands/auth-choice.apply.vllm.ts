import type { ApplyAuthChoiceParams, ApplyAuthChoiceResult } from "./auth-choice.apply.js";
import { promptAndConfigureVllm } from "./vllm-setup.js";

export async function applyAuthChoiceVllm(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult | null> {
  if (params.authChoice !== "vllm") {
    return null;
  }

  const { config: nextConfig } = await promptAndConfigureVllm({
    cfg: params.config,
    prompter: params.prompter,
    agentDir: params.agentDir,
  });

  return { config: nextConfig };
}
