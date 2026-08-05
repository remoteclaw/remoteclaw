// Relaunches the gateway through the managed Windows scheduled task.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { quoteCmdScriptArg } from "../daemon/cmd-argv.js";
import { resolveGatewayWindowsTaskName } from "../daemon/constants.js";
import { renderCmdRestartLogSetup } from "../daemon/restart-logs.js";
import { resolveTaskScriptPath } from "../daemon/schtasks.js";
import { formatErrorMessage } from "./errors.js";
import type { RestartAttempt } from "./restart.types.js";
import { resolvePreferredRemoteClawTmpDir } from "./tmp-remoteclaw-dir.js";
import { resolveWindowsCmdExePath, resolveWindowsSystem32Path } from "./windows-system-paths.js";

const TASK_RESTART_RETRY_LIMIT = 12;
const TASK_RESTART_RETRY_DELAY_SEC = 1;

function quotePowerShellSingleQuotedLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function resolveWindowsTaskName(env: NodeJS.ProcessEnv): string {
  const override = env.REMOTECLAW_WINDOWS_TASK_NAME?.trim();
  if (override) {
    return override;
  }
  return resolveGatewayWindowsTaskName(env.REMOTECLAW_PROFILE);
}

function buildScheduledTaskRestartScript(params: {
  quotedLogPath: string;
  quotedSchtasksPath: string;
  setupLines: string[];
  taskName: string;
  taskScriptPath?: string;
}): string {
  const { quotedLogPath, quotedSchtasksPath, setupLines, taskName, taskScriptPath } = params;
  const quotedTaskName = quoteCmdScriptArg(taskName);
  const queryTaskStateCommand = `(Get-ScheduledTask -TaskName ${quotePowerShellSingleQuotedLiteral(
    taskName,
  )} -ErrorAction SilentlyContinue).State`;
  const quotedQueryTaskStateCommand = quoteCmdScriptArg(queryTaskStateCommand);
  const lines = [
    "@echo off",
    "setlocal",
    ...setupLines,
    `>> ${quotedLogPath} 2>&1 echo [%DATE% %TIME%] remoteclaw restart attempt source=windows-task-handoff target=${quotedTaskName}`,
    `${quotedSchtasksPath} /Query /TN ${quotedTaskName} >> ${quotedLogPath} 2>&1`,
    "if errorlevel 1 goto fallback",
    "set /a attempts=0",
    ":retry",
    `timeout /t ${TASK_RESTART_RETRY_DELAY_SEC} /nobreak >nul`,
    "set /a attempts+=1",
    // Avoid racing with another restart path that already started the scheduled task.
    `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command ${quotedQueryTaskStateCommand} 2>nul | findstr /I /C:"Running" >nul 2>&1`,
    "if not errorlevel 1 goto cleanup",
    `${quotedSchtasksPath} /Run /TN ${quotedTaskName} >> ${quotedLogPath} 2>&1`,
    "if not errorlevel 1 goto cleanup",
    `if %attempts% GEQ ${TASK_RESTART_RETRY_LIMIT} goto fallback`,
    "goto retry",
    ":fallback",
    `>> ${quotedLogPath} 2>&1 echo [%DATE% %TIME%] remoteclaw restart fallback source=windows-task-handoff`,
  ];
  if (taskScriptPath) {
    const quotedScript = quoteCmdScriptArg(taskScriptPath);
    lines.push(`if exist ${quotedScript} (`, `  start "" /min cmd.exe /d /c ${quotedScript}`, ")");
  }
  lines.push(
    ":cleanup",
    `>> ${quotedLogPath} 2>&1 echo [%DATE% %TIME%] remoteclaw restart finished source=windows-task-handoff`,
    'del "%~f0" >nul 2>&1',
  );
  return lines.join("\r\n");
}

export function relaunchGatewayScheduledTask(env: NodeJS.ProcessEnv = process.env): RestartAttempt {
  const taskName = resolveWindowsTaskName(env);
  const taskScriptPath = resolveTaskScriptPath(env);
  // Pinned at emission time, for the same reason as every argv site: a binary named inside
  // generated script content resolves through the *script's* search path when it finally
  // runs, which no source scan of this repo can see. The helper below is spawned detached
  // through `cmd.exe` with no `cwd` or `env` override, so it inherits the parent's %PATH%
  // AND cwd — and `cmd.exe` resolves a bare name against the current directory first.
  // Identical treatment to `cli/update-cli/restart-helper.ts`; only the substrate differs
  // (a cmd script, so `quoteCmdScriptArg` — the escape hatch the log path and task name
  // already use — rather than a PowerShell literal).
  //
  // Scope, so this is not read as more than it closes: only the two `schtasks` invocations
  // are pinned. Still bare in the same emitted script, in emission order: `timeout` in the
  // `:retry` loop, `powershell.exe` and `findstr` on the task-state probe, and `cmd.exe` in
  // the startup fallback. `timeout` is the easiest of those to skip — it reads like a
  // `cmd.exe` builtin and is not one. It is `%SystemRoot%\System32\timeout.exe`, it sits
  // BETWEEN the two lines pinned here, and it resolves through this detached script's
  // inherited cwd and %PATH% exactly as they did. Treat that as an inventory of what is
  // KNOWN bare at time of writing, not a proof the set is closed: nothing scans emitted
  // script content for binary names, so a binary added to this script later joins the set
  // without failing anything.
  const schtasksPath = resolveWindowsSystem32Path("schtasks.exe", { ...process.env, ...env });
  const quotedSchtasksPath = quoteCmdScriptArg(schtasksPath);
  const scriptPath = path.join(
    resolvePreferredRemoteClawTmpDir(),
    `remoteclaw-schtasks-restart-${randomUUID()}.cmd`,
  );
  const quotedScriptPath = quoteCmdScriptArg(scriptPath);
  const restartLog = renderCmdRestartLogSetup({ ...process.env, ...env });
  try {
    fs.writeFileSync(
      scriptPath,
      `${buildScheduledTaskRestartScript({
        quotedLogPath: restartLog.quotedLogPath,
        quotedSchtasksPath,
        setupLines: restartLog.lines,
        taskName,
        taskScriptPath,
      })}\r\n`,
      "utf8",
    );
    const child = spawn(resolveWindowsCmdExePath(), ["/d", "/s", "/c", quotedScriptPath], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
    return {
      ok: true,
      method: "schtasks",
      // Reports the pinned path, not the bare name: an operator reading this after a failed
      // restart needs to see which binary the emitted script actually invoked.
      tried: [`${schtasksPath} /Run /TN "${taskName}"`, `cmd.exe /d /s /c ${quotedScriptPath}`],
    };
  } catch (err) {
    try {
      fs.unlinkSync(scriptPath);
    } catch {
      // Best-effort cleanup; keep the original restart failure.
    }
    return {
      ok: false,
      method: "schtasks",
      detail: formatErrorMessage(err),
      tried: [`${schtasksPath} /Run /TN "${taskName}"`],
    };
  }
}
