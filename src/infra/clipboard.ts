// Reads and writes clipboard text through platform command helpers.
import { runCommandWithTimeout } from "../process/exec.js";
import {
  resolveWindowsPowerShellPath,
  resolveWindowsSystem32Path,
} from "./windows-system-paths.js";
import { isWSL2Sync } from "./wsl.js";

// WSL interop needs a shell to launch Windows PE binaries; exec keeps the
// clipboard process as the timeout-owned child while values stay on stdin.
const WSL_CLIPBOARD_ARGV = ["/bin/sh", "-c", "exec /mnt/c/Windows/System32/clip.exe"];

export async function copyToClipboard(value: string): Promise<boolean> {
  // On Windows, pin the system binaries so %PATH% cannot decide which
  // clip.exe/powershell.exe runs (CWE-426). Off Windows these entries are
  // WSL-interop fallbacks reached through the Linux PATH, where an absolute
  // C:\ path would not resolve — so the bare names stay there.
  const isWindows = process.platform === "win32";
  const attempts: Array<{ argv: string[] }> = [
    ...(isWSL2Sync() ? [{ argv: WSL_CLIPBOARD_ARGV }] : []),
    { argv: ["pbcopy"] },
    { argv: ["xclip", "-selection", "clipboard"] },
    { argv: ["wl-copy"] },
    { argv: [isWindows ? resolveWindowsSystem32Path("clip.exe") : "clip.exe"] },
    {
      argv: [
        isWindows ? resolveWindowsPowerShellPath() : "powershell",
        "-NoProfile",
        "-Command",
        "Set-Clipboard",
      ],
    },
  ];
  for (const attempt of attempts) {
    try {
      const result = await runCommandWithTimeout(attempt.argv, {
        timeoutMs: 3_000,
        input: value,
      });
      if (result.code === 0 && !result.killed) {
        return true;
      }
    } catch {
      // keep trying the next fallback
    }
  }
  return false;
}
