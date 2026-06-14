import chalk from "chalk";
import { formatCliCommand } from "../cli/command-format.js";
import { theme } from "../terminal/theme.js";

export const SECURITY_NOTE_TITLE = "Security disclaimer";

export const SECURITY_CONFIRM_MESSAGE =
  "I understand this is personal-by-default and shared/multi-user use requires lock-down. Continue?";

const heading = (text: string) => chalk.bold(text);

export const SECURITY_NOTE_MESSAGE = [
  theme.warn("⚠ RemoteClaw is in Beta - expect sharp edges"),
  "- By default, RemoteClaw is a personal agent: one trusted operator boundary.",
  "- This bot can read files and run actions if tools are enabled.",
  "- A bad prompt can trick it into doing unsafe things.",
  "",
  heading("How RemoteClaw treats trust"),
  "- RemoteClaw is not a hostile multi-tenant boundary by default.",
  "- If multiple users can message one tool-enabled agent, they share that delegated tool authority.",
  "",
  heading("When not to run RemoteClaw"),
  "- If you’re not comfortable with security hardening and access control, don’t run RemoteClaw.",
  "- Ask someone experienced to help before enabling tools or exposing it to the internet.",
  "",
  heading("Recommended baseline"),
  "- Pairing/allowlists + mention gating.",
  "- Multi-user/shared inbox: split trust boundaries (separate gateway/credentials, ideally separate OS users/hosts).",
  "- Sandbox + least-privilege tools.",
  "- Shared inboxes: isolate DM sessions (session.dmScope: per-channel-peer) and keep tool access minimal.",
  "- Keep secrets out of the agent’s reachable filesystem.",
  "- Use the strongest available model for any bot with tools or untrusted inboxes.",
  "",
  heading("Run regularly"),
  formatCliCommand("remoteclaw security audit --deep"),
  formatCliCommand("remoteclaw security audit --fix"),
  "",
  heading("Learn more"),
  "- https://docs.remoteclaw.org/gateway/security",
].join("\n");
