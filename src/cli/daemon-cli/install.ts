import { buildGatewayInstallPlan } from "../../commands/daemon-install-helpers.js";
import {
  DEFAULT_GATEWAY_DAEMON_RUNTIME,
  isGatewayDaemonRuntime,
} from "../../commands/daemon-runtime.js";
import { readBestEffortConfig, resolveGatewayPort } from "../../config/config.js";
import { resolveIsNixMode } from "../../config/paths.js";
import { resolveGatewayService } from "../../daemon/service.js";
import { isNonFatalSystemdInstallProbeError } from "../../daemon/systemd.js";
import { defaultRuntime } from "../../runtime.js";
import { formatCliCommand } from "../command-format.js";
import {
  buildDaemonServiceSnapshot,
  createDaemonActionContext,
  installDaemonServiceAndEmit,
} from "./response.js";
import { parsePort } from "./shared.js";
import type { DaemonInstallOptions } from "./types.js";

function mergeInstallInvocationEnv(params: {
  env: NodeJS.ProcessEnv;
  existingServiceEnv?: Record<string, string>;
}): NodeJS.ProcessEnv {
  if (!params.existingServiceEnv || Object.keys(params.existingServiceEnv).length === 0) {
    return params.env;
  }
  return {
    ...params.existingServiceEnv,
    ...params.env,
  };
}

export async function runDaemonInstall(opts: DaemonInstallOptions) {
  const json = Boolean(opts.json);
  const { stdout, warnings, emit, fail } = createDaemonActionContext({ action: "install", json });

  if (resolveIsNixMode(process.env)) {
    fail("Nix mode detected; service install is disabled.");
    return;
  }

  const cfg = await readBestEffortConfig();
  const portOverride = parsePort(opts.port);
  if (opts.port !== undefined && portOverride === null) {
    fail("Invalid port");
    return;
  }
  const port = portOverride ?? resolveGatewayPort(cfg);
  if (!Number.isFinite(port) || port <= 0) {
    fail("Invalid port");
    return;
  }
  const runtimeRaw = opts.runtime ? String(opts.runtime) : DEFAULT_GATEWAY_DAEMON_RUNTIME;
  if (!isGatewayDaemonRuntime(runtimeRaw)) {
    fail('Invalid --runtime (use "node" or "bun")');
    return;
  }

  const service = resolveGatewayService();
  let loaded = false;
  let existingServiceEnv: Record<string, string> | undefined;
  try {
    loaded = await service.isLoaded({ env: process.env });
  } catch (err) {
    if (isNonFatalSystemdInstallProbeError(err)) {
      loaded = false;
    } else {
      fail(`Gateway service check failed: ${String(err)}`);
      return;
    }
  }
  if (loaded) {
    existingServiceEnv = (await service.readCommand(process.env).catch(() => null))?.environment;
  }
  const installEnv = mergeInstallInvocationEnv({
    env: process.env,
    existingServiceEnv,
  });
  if (loaded) {
    if (!opts.force) {
      emit({
        ok: true,
        result: "already-installed",
        message: `Gateway service already ${service.loadedText}.`,
        service: buildDaemonServiceSnapshot(service, loaded),
      });
      if (!json) {
        defaultRuntime.log(`Gateway service already ${service.loadedText}.`);
        defaultRuntime.log(
          `Reinstall with: ${formatCliCommand("remoteclaw gateway install --force")}`,
        );
      }
      return;
    }
  }

  // Gateway install token resolution is gutted in this fork; treat as
  // available with no warnings.
  const tokenResolution: { warnings: string[]; unavailableReason: string | null } = {
    warnings: [],
    unavailableReason: null,
  };
  if (tokenResolution.unavailableReason) {
    fail(`Gateway install blocked: ${tokenResolution.unavailableReason}`);
    return;
  }
  for (const warning of tokenResolution.warnings) {
    if (json) {
      warnings.push(warning);
    } else {
      defaultRuntime.log(warning);
    }
  }

  const { programArguments, workingDirectory, environment } = await buildGatewayInstallPlan({
    env: installEnv,
    port,
    runtime: runtimeRaw,
    warn: (message) => {
      if (json) {
        warnings.push(message);
      } else {
        defaultRuntime.log(message);
      }
    },
    config: cfg,
  });

  await installDaemonServiceAndEmit({
    serviceNoun: "Gateway",
    service,
    warnings,
    emit,
    fail,
    install: async () => {
      await service.install({
        env: installEnv,
        stdout,
        programArguments,
        workingDirectory,
        environment,
      });
    },
  });
}
