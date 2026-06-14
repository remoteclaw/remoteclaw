import {
  approveDevicePairing,
  getPairedDevice,
  listDevicePairing,
  removePairedDevice,
  type DeviceAuthToken,
  rejectDevicePairing,
  revokeDeviceToken,
  rotateDeviceToken,
  summarizeDeviceTokens,
} from "../../infra/device-pairing.js";
import { normalizeDeviceAuthScopes } from "../../shared/device-auth.js";
import { resolveMissingRequestedScope } from "../../shared/operator-scope-compat.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateDevicePairApproveParams,
  validateDevicePairListParams,
  validateDevicePairRemoveParams,
  validateDevicePairRejectParams,
  validateDeviceTokenRevokeParams,
  validateDeviceTokenRotateParams,
} from "../protocol/index.js";
import type { GatewayClient, GatewayRequestHandlers } from "./types.js";

const DEVICE_TOKEN_ROTATION_DENIED_MESSAGE = "device token rotation denied";
const DEVICE_TOKEN_REVOCATION_DENIED_MESSAGE = "device token revocation denied";

type DeviceTokenRotateTarget = {
  pairedDevice: NonNullable<Awaited<ReturnType<typeof getPairedDevice>>>;
  normalizedRole: string;
};

type DeviceSessionAuthz = {
  callerDeviceId: string | null;
  callerScopes: string[];
  isAdminCaller: boolean;
};

type DeviceManagementAuthz = DeviceSessionAuthz & {
  normalizedTargetDeviceId: string;
};

const DEVICE_PAIR_APPROVAL_DENIED_MESSAGE = "device pairing approval denied";
const DEVICE_PAIR_REJECTION_DENIED_MESSAGE = "device pairing rejection denied";

function redactPairedDevice(
  device: { tokens?: Record<string, DeviceAuthToken> } & Record<string, unknown>,
) {
  const { tokens, approvedScopes: _approvedScopes, ...rest } = device;
  return {
    ...rest,
    tokens: summarizeDeviceTokens(tokens),
  };
}

function logDeviceTokenRotationDenied(params: {
  log: { warn: (message: string) => void };
  deviceId: string;
  role: string;
  reason:
    | RotateDeviceTokenDenyReason
    | "caller-missing-scope"
    | "unknown-device-or-role"
    | "device-ownership-mismatch";
  scope?: string | null;
}) {
  const suffix = params.scope ? ` scope=${params.scope}` : "";
  params.log.warn(
    `device token rotation denied device=${params.deviceId} role=${params.role} reason=${params.reason}${suffix}`,
  );
}

async function loadDeviceTokenRotateTarget(params: {
  deviceId: string;
  role: string;
  log: { warn: (message: string) => void };
}): Promise<DeviceTokenRotateTarget | null> {
  const normalizedRole = params.role.trim();
  const pairedDevice = await getPairedDevice(params.deviceId);
  if (!pairedDevice || !listApprovedPairedDeviceRoles(pairedDevice).includes(normalizedRole)) {
    logDeviceTokenRotationDenied({
      log: params.log,
      deviceId: params.deviceId,
      role: params.role,
      reason: "unknown-device-or-role",
    });
    return null;
  }
  return { pairedDevice, normalizedRole };
}

function resolveDeviceManagementAuthz(
  client: GatewayClient | null,
  targetDeviceId: string,
): DeviceManagementAuthz {
  return {
    ...resolveDeviceSessionAuthz(client),
    normalizedTargetDeviceId: targetDeviceId.trim(),
  };
}

function resolveDeviceSessionAuthz(client: GatewayClient | null): DeviceSessionAuthz {
  const callerScopes = Array.isArray(client?.connect?.scopes) ? client.connect.scopes : [];
  const rawCallerDeviceId = client?.connect?.device?.id;
  const callerDeviceId =
    client?.isDeviceTokenAuth && typeof rawCallerDeviceId === "string" && rawCallerDeviceId.trim()
      ? rawCallerDeviceId.trim()
      : null;
  return {
    callerDeviceId,
    callerScopes,
    isAdminCaller: callerScopes.includes("operator.admin"),
  };
}

function resolveDeviceManagementAuthz(
  client: GatewayClient | null,
  targetDeviceId: string,
): DeviceManagementAuthz {
  return {
    ...resolveDeviceSessionAuthz(client),
    normalizedTargetDeviceId: targetDeviceId.trim(),
  };
}

function isCrossDeviceManagementDenied(authz: DeviceManagementAuthz): boolean {
  return Boolean(
    authz.callerDeviceId &&
    authz.callerDeviceId !== authz.normalizedTargetDeviceId &&
    !authz.isAdminCaller,
  );
}

function shouldReturnRotatedDeviceToken(authz: DeviceManagementAuthz): boolean {
  return Boolean(authz.callerDeviceId && authz.callerDeviceId === authz.normalizedTargetDeviceId);
}

export const deviceHandlers: GatewayRequestHandlers = {
  "device.pair.list": async ({ params, respond, client }) => {
    if (!validateDevicePairListParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid device.pair.list params: ${formatValidationErrors(validateDevicePairListParams.errors)}`,
        ),
      );
      return;
    }
    const list = await listDevicePairing();
    const authz = resolveDeviceSessionAuthz(client);
    const visibleList =
      authz.callerDeviceId && !authz.isAdminCaller
        ? {
            pending: list.pending.filter(
              (request) => request.deviceId.trim() === authz.callerDeviceId,
            ),
            paired: list.paired.filter((device) => device.deviceId.trim() === authz.callerDeviceId),
          }
        : list;
    respond(
      true,
      {
        pending: visibleList.pending,
        paired: visibleList.paired.map((device) => redactPairedDevice(device)),
      },
      undefined,
    );
  },
  "device.pair.approve": async ({ params, respond, context }) => {
    if (!validateDevicePairApproveParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid device.pair.approve params: ${formatValidationErrors(validateDevicePairApproveParams.errors)}`,
        ),
      );
      return;
    }
    const { requestId } = params as { requestId: string };
    const approved = await approveDevicePairing(requestId);
    if (!approved) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "unknown requestId"));
      return;
    }
    context.logGateway.info(
      `device pairing approved device=${approved.device.deviceId} role=${approved.device.role ?? "unknown"}`,
    );
    context.broadcast(
      "device.pair.resolved",
      {
        requestId,
        deviceId: approved.device.deviceId,
        decision: "approved",
        ts: Date.now(),
      },
      { dropIfSlow: true },
    );
    respond(true, { requestId, device: redactPairedDevice(approved.device) }, undefined);
  },
  "device.pair.reject": async ({ params, respond, context, client }) => {
    if (!validateDevicePairRejectParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid device.pair.reject params: ${formatValidationErrors(validateDevicePairRejectParams.errors)}`,
        ),
      );
      return;
    }
    const { requestId } = params as { requestId: string };
    const authz = resolveDeviceSessionAuthz(client);
    if (authz.callerDeviceId && !authz.isAdminCaller) {
      const pending = await getPendingDevicePairing(requestId);
      if (!pending) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, DEVICE_PAIR_REJECTION_DENIED_MESSAGE),
        );
        return;
      }
      if (pending.deviceId.trim() !== authz.callerDeviceId) {
        context.logGateway.warn(
          `device pairing rejection denied request=${requestId} reason=device-ownership-mismatch`,
        );
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, DEVICE_PAIR_REJECTION_DENIED_MESSAGE),
        );
        return;
      }
    }
    const rejected = await rejectDevicePairing(requestId);
    if (!rejected) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "unknown requestId"));
      return;
    }
    context.broadcast(
      "device.pair.resolved",
      {
        requestId,
        deviceId: rejected.deviceId,
        decision: "rejected",
        ts: Date.now(),
      },
      { dropIfSlow: true },
    );
    respond(true, rejected, undefined);
  },
  "device.pair.remove": async ({ params, respond, context }) => {
    if (!validateDevicePairRemoveParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid device.pair.remove params: ${formatValidationErrors(validateDevicePairRemoveParams.errors)}`,
        ),
      );
      return;
    }
    const { deviceId } = params as { deviceId: string };
    const removed = await removePairedDevice(deviceId);
    if (!removed) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "unknown deviceId"));
      return;
    }
    context.logGateway.info(`device pairing removed device=${removed.deviceId}`);
    respond(true, removed, undefined);
  },
  "device.token.rotate": async ({ params, respond, context, client }) => {
    if (!validateDeviceTokenRotateParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid device.token.rotate params: ${formatValidationErrors(validateDeviceTokenRotateParams.errors)}`,
        ),
      );
      return;
    }
    const { deviceId, role, scopes } = params as {
      deviceId: string;
      role: string;
      scopes?: string[];
    };
    const authz = resolveDeviceManagementAuthz(client, deviceId);
    if (isCrossDeviceManagementDenied(authz)) {
      context.logGateway.warn(
        `device token rotation denied device=${deviceId} role=${role} reason=device-ownership-mismatch`,
      );
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, DEVICE_TOKEN_ROTATION_DENIED_MESSAGE),
      );
      return;
    }
    const pairedDevice = await getPairedDevice(deviceId);
    if (!pairedDevice) {
      context.logGateway.warn(
        `device token rotation denied device=${deviceId} role=${role} reason=unknown-device-or-role`,
      );
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, DEVICE_TOKEN_ROTATION_DENIED_MESSAGE),
      );
      return;
    }
    const requestedScopes = normalizeDeviceAuthScopes(
      scopes ?? pairedDevice.tokens?.[role.trim()]?.scopes ?? pairedDevice.scopes,
    );
    const missingScope = resolveMissingRequestedScope({
      role,
      requestedScopes,
      allowedScopes: authz.callerScopes,
    });
    if (missingScope) {
      context.logGateway.warn(
        `device token rotation denied device=${deviceId} role=${role} reason=caller-missing-scope scope=${missingScope}`,
      );
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, DEVICE_TOKEN_ROTATION_DENIED_MESSAGE),
      );
      return;
    }
    const entry = await rotateDeviceToken({
      deviceId,
      role,
      scopes,
      callerScopes: authz.callerScopes,
    });
    if (!entry) {
      context.logGateway.warn(
        `device token rotation denied device=${deviceId} role=${role} reason=scope-outside-approved-baseline`,
      );
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, DEVICE_TOKEN_ROTATION_DENIED_MESSAGE),
      );
      return;
    }
    context.logGateway.info(
      `device token rotated device=${deviceId} role=${entry.role} scopes=${entry.scopes.join(",")}`,
    );
    respond(
      true,
      {
        deviceId,
        role: entry.role,
        ...(shouldReturnRotatedDeviceToken(authz) ? { token: entry.token } : {}),
        scopes: entry.scopes,
        rotatedAtMs: entry.rotatedAtMs ?? entry.createdAtMs,
      },
      undefined,
    );
  },
  "device.token.revoke": async ({ params, respond, context, client }) => {
    if (!validateDeviceTokenRevokeParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid device.token.revoke params: ${formatValidationErrors(validateDeviceTokenRevokeParams.errors)}`,
        ),
      );
      return;
    }
    const { deviceId, role } = params as { deviceId: string; role: string };
    const authz = resolveDeviceManagementAuthz(client, deviceId);
    if (isCrossDeviceManagementDenied(authz)) {
      context.logGateway.warn(
        `device token revocation denied device=${deviceId} role=${role} reason=device-ownership-mismatch`,
      );
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, DEVICE_TOKEN_REVOCATION_DENIED_MESSAGE),
      );
      return;
    }
    const entry = await revokeDeviceToken({ deviceId, role, callerScopes: authz.callerScopes });
    if (!entry) {
      context.logGateway.warn(
        `device token revocation denied device=${deviceId} role=${role} reason=unknown-device-or-role`,
      );
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, DEVICE_TOKEN_REVOCATION_DENIED_MESSAGE),
      );
      return;
    }
    context.logGateway.info(`device token revoked device=${deviceId} role=${entry.role}`);
    respond(
      true,
      { deviceId, role: entry.role, revokedAtMs: entry.revokedAtMs ?? Date.now() },
      undefined,
    );
  },
};
