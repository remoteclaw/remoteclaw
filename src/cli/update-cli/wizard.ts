import { confirm, isCancel } from "@clack/prompts";
import { readConfigFileSnapshot } from "../../config/config.js";
import {
  formatUpdateChannelLabel,
  normalizeUpdateChannel,
  resolveEffectiveUpdateChannel,
} from "../../infra/update-channels.js";
import { defaultRuntime } from "../../runtime.js";
import { selectStyled } from "../../terminal/prompt-select-styled.js";
import { stylePromptMessage } from "../../terminal/prompt-style.js";
import { theme } from "../../terminal/theme.js";
import { parseTimeoutMsOrExit, type UpdateWizardOptions } from "./shared.js";
import { updateCommand } from "./update-command.js";

export async function updateWizardCommand(opts: UpdateWizardOptions = {}): Promise<void> {
  if (!process.stdin.isTTY) {
    defaultRuntime.error(
      "Update wizard requires a TTY. Use `remoteclaw update --channel <stable|beta|next>` instead.",
    );
    defaultRuntime.exit(1);
    return;
  }

  const timeoutMs = parseTimeoutMsOrExit(opts.timeout);
  if (timeoutMs === null) {
    return;
  }

  const configSnapshot = await readConfigFileSnapshot();

  const configChannel = configSnapshot.valid
    ? normalizeUpdateChannel(configSnapshot.config.update?.channel)
    : null;
  const channelInfo = resolveEffectiveUpdateChannel({
    configChannel,
  });
  const channelLabel = formatUpdateChannelLabel({
    channel: channelInfo.channel,
    source: channelInfo.source,
  });

  const pickedChannel = await selectStyled({
    message: "Update channel",
    options: [
      {
        value: "keep",
        label: `Keep current (${channelInfo.channel})`,
        hint: channelLabel,
      },
      {
        value: "stable",
        label: "Stable",
        hint: "Tagged releases (npm latest)",
      },
      {
        value: "beta",
        label: "Beta",
        hint: "Prereleases (npm beta)",
      },
      {
        value: "next",
        label: "Next",
        hint: "Latest from main (npm next)",
      },
    ],
    initialValue: "keep",
  });

  if (isCancel(pickedChannel)) {
    defaultRuntime.log(theme.muted("Update cancelled."));
    defaultRuntime.exit(0);
    return;
  }

  const requestedChannel = pickedChannel === "keep" ? null : pickedChannel;

  const restart = await confirm({
    message: stylePromptMessage("Restart the gateway service after update?"),
    initialValue: true,
  });
  if (isCancel(restart)) {
    defaultRuntime.log(theme.muted("Update cancelled."));
    defaultRuntime.exit(0);
    return;
  }

  try {
    await updateCommand({
      channel: requestedChannel ?? undefined,
      restart: Boolean(restart),
      timeout: opts.timeout,
    });
  } catch (err) {
    defaultRuntime.error(String(err));
    defaultRuntime.exit(1);
  }
}
