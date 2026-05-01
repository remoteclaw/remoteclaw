import { formatCliCommand } from "../cli/command-format.js";
import type { PairingChannel } from "./pairing-store.js";

export function buildPairingReply(params: { channel: PairingChannel; idLine: string; code: string }): string {
  const { channel, idLine, code } = params;
  const approveCommand = formatCliCommand(`remoteclaw pairing approve ${channel} ${code}`);
  return [
    "RemoteClaw: access not configured.",
    "",
    idLine,
    "Pairing code:",
    "```",
    code,
    "```",
    "",
    "Ask the bot owner to approve with:",
    formatCliCommand(`remoteclaw pairing approve ${channel} ${code}`),
    "```",
    approveCommand,
    "```",
  ].join("\n");
}
