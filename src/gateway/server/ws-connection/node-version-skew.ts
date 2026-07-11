import fs from "node:fs/promises";
import path from "node:path";
import { resolveStateDir } from "../../../config/paths.js";

/** Match production release versions (YYYY.M.PATCH or YYYY.M.PATCH-beta.N). */
const RELEASED_VERSION_RE = /^\d{4}\.\d+\.\d+/;

/**
 * True when `version` looks like a shipped release (calendar-versioned), false for
 * dev / prerelease placeholders (e.g. "dev", "0.0.0"). The version-skew guard only
 * fires between two released versions so a dev-versioned gateway never kicks a node.
 */
export function isReleasedVersion(version: string): boolean {
  return RELEASED_VERSION_RE.test(version);
}

const NODE_HOST_CONFIG_FILE = "node.json";

/**
 * Read this install's local node host id from `<stateDir>/node.json`, or `null` when
 * there is no local node host configured (file absent, unreadable, or without a
 * usable `nodeId`). Used to scope the version-skew guard to the co-located
 * same-install node — the local node host writes its `nodeId` here and reports it
 * back as the connect `instanceId`.
 */
export async function resolveLocalNodeId(): Promise<string | null> {
  try {
    const raw = await fs.readFile(path.join(resolveStateDir(), NODE_HOST_CONFIG_FILE), "utf8");
    const parsed = JSON.parse(raw) as { nodeId?: unknown };
    const nodeId = typeof parsed.nodeId === "string" ? parsed.nodeId.trim() : "";
    return nodeId.length > 0 ? nodeId : null;
  } catch {
    return null;
  }
}

/**
 * Decide whether a connecting node should be closed for a *released* client/gateway
 * version skew. The caller gates on `role === "node" && isLocalClient` (a cheap
 * pre-check that also avoids the node.json read for non-local connects); this
 * predicate encodes the version-skew-specific conditions:
 *   - the same-install local node is identifiable (`localNodeId` resolved) and the
 *     connecting client's `instanceId` matches it — co-located same-install node.
 *     SSH-tunneled remote nodes share loopback but carry a different instanceId, so
 *     they are exempt (closing them would not trigger a local supervisor restart), and
 *   - both the client and gateway report *released* versions that differ.
 *
 * Closing the co-located local node host lets its OS supervisor restart it on the
 * gateway's version; hence the narrow same-install scoping.
 */
export function shouldCloseNodeForVersionSkew(params: {
  localNodeId: string | null;
  clientInstanceId: string | undefined;
  clientVersion: string | undefined;
  gatewayVersion: string | undefined;
}): boolean {
  const clientInstanceId = params.clientInstanceId?.trim();
  if (!params.localNodeId || !clientInstanceId || clientInstanceId !== params.localNodeId) {
    return false;
  }
  const { clientVersion, gatewayVersion } = params;
  if (!clientVersion || !gatewayVersion || clientVersion === gatewayVersion) {
    return false;
  }
  return isReleasedVersion(clientVersion) && isReleasedVersion(gatewayVersion);
}
