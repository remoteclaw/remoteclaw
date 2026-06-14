import { listChatChannels } from "../channels/chat-meta.js";
import { formatCliCommand } from "../cli/command-format.js";
import type { RemoteClawConfig } from "../config/config.js";
import { CONFIG_PATH } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import { note } from "../terminal/note.js";
import { sanitizeTerminalText } from "../terminal/safe-text.js";
import { shortenHomePath } from "../utils.js";
import { confirm, select } from "./configure.shared.js";
import { guardCancel } from "./onboard-helpers.js";

type ConfiguredChannelRemovalChoice = {
  id: string;
  label: string;
};

type ChannelRemovalSelectValue = { kind: "channel"; id: string } | { kind: "done" };
type ChannelRemovalOption = Parameters<
  typeof select<ChannelRemovalSelectValue>
>[0]["options"][number];
type ChannelRemovalChoiceOption = Extract<
  ChannelRemovalOption,
  { value: { kind: "channel"; id: string } }
>;
type ChannelRemovalDoneOption = Extract<ChannelRemovalOption, { value: { kind: "done" } }>;

const RESERVED_CHANNEL_CONFIG_KEYS = new Set(["defaults", "modelByChannel"]);
const DONE_VALUE: Extract<ChannelRemovalSelectValue, { kind: "done" }> = { kind: "done" };

function listConfiguredChannelRemovalChoices(
  cfg: RemoteClawConfig,
): ConfiguredChannelRemovalChoice[] {
  const channels = cfg.channels;
  if (!channels) {
    return [];
  }
  const labelsById = new Map(
    listChatChannels().map((meta) => [meta.id, formatChannelRemovalLabel(meta.label, meta.id)]),
  );
  return Object.keys(channels)
    .filter((id) => !RESERVED_CHANNEL_CONFIG_KEYS.has(id))
    .filter((id) => !isBlockedObjectKey(id))
    .map((id) => ({
      id,
      label: labelsById.get(id) ?? formatUnknownChannelRemovalLabel(id),
    }))
    .toSorted(compareChannelRemovalChoices);
}

function formatChannelRemovalLabel(label: string, fallback: string): string {
  return sanitizeTerminalText(label) || formatUnknownChannelRemovalLabel(fallback);
}

function formatUnknownChannelRemovalLabel(id: string): string {
  return sanitizeTerminalText(id) || "<invalid channel key>";
}

function compareChannelRemovalChoices(
  left: ConfiguredChannelRemovalChoice,
  right: ConfiguredChannelRemovalChoice,
): number {
  return (
    left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: "base" }) ||
    left.id.localeCompare(right.id, undefined, { numeric: true, sensitivity: "base" })
  );
}

export async function removeChannelConfigWizard(
  cfg: RemoteClawConfig,
  runtime: RuntimeEnv,
): Promise<RemoteClawConfig> {
  let next = { ...cfg };

  const listConfiguredChannels = () =>
    listChannelPlugins()
      .map((plugin) => plugin.meta)
      .filter((meta) => next.channels?.[meta.id] !== undefined);

  while (true) {
    const configured = listConfiguredChannelRemovalChoices(next);
    if (configured.length === 0) {
      note(
        [
          "No channel config found in remoteclaw.json.",
          `Tip: \`${formatCliCommand("remoteclaw channels status")}\` shows what is configured and enabled.`,
        ].join("\n"),
        "Remove channel",
      );
      return next;
    }

    const channelOptions = configured.map<ChannelRemovalChoiceOption>((meta) => ({
      value: { kind: "channel" as const, id: meta.id },
      label: meta.label,
      hint: "Deletes tokens + settings from config (credentials stay on disk)",
    }));
    const doneOption: ChannelRemovalDoneOption = { value: DONE_VALUE, label: "Done" };
    const options: ChannelRemovalOption[] = [...channelOptions, doneOption];
    const choice = guardCancel(
      await select<ChannelRemovalSelectValue>({
        message: "Remove which channel config?",
        options,
      }),
      runtime,
    );

    if (choice.kind === "done") {
      return next;
    }

    const channel = choice.id;
    const label = configured.find((entry) => entry.id === channel)?.label ?? channel;
    const confirmed = guardCancel(
      await confirm({
        message: `Delete ${label} configuration from ${shortenHomePath(CONFIG_PATH)}?`,
        initialValue: false,
      }),
      runtime,
    );
    if (!confirmed) {
      continue;
    }

    const nextChannels: Record<string, unknown> = { ...next.channels };
    delete nextChannels[channel];
    next = {
      ...next,
      channels: Object.keys(nextChannels).length
        ? (nextChannels as RemoteClawConfig["channels"])
        : undefined,
    };

    note(
      [`${label} removed from config.`, "Note: credentials/sessions on disk are unchanged."].join(
        "\n",
      ),
      "Channel removed",
    );
  }
}
