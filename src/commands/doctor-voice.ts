import { validateVoiceCredentials } from "../channels/voice-credentials.js";
import { formatCliCommand } from "../cli/command-format.js";
import type { RemoteClawConfig } from "../config/config.js";
import { note } from "../terminal/note.js";

function isVoiceCallPluginEnabled(cfg: RemoteClawConfig): boolean {
  const entry = cfg.plugins?.entries?.["voice-call"];
  if (!entry) {
    return false;
  }
  return entry.enabled !== false;
}

export async function noteVoiceChannelHealth(cfg: RemoteClawConfig): Promise<void> {
  if (!isVoiceCallPluginEnabled(cfg)) {
    return;
  }

  const report = await validateVoiceCredentials(cfg);
  const issues: string[] = [];

  if (!report.stt.available) {
    issues.push(
      `- STT: no credentials found. Voice channels require a speech-to-text provider (openai, groq, deepgram, google, or mistral).`,
    );
  }

  if (!report.tts.available) {
    issues.push(
      `- TTS: no credentials found. Voice channels require a text-to-speech provider (openai, elevenlabs, or edge).`,
    );
  }

  if (issues.length > 0) {
    issues.push(
      `Configure auth via ${formatCliCommand("remoteclaw configure")} or set provider API keys.`,
    );
    note(issues.join("\n"), "Voice channel");
  }
}
