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

type DeviceSessionAuthz = {
  callerDeviceId: string | null;
  callerScopes: string[];
  isAdminCaller: boolean;
};

type DeviceManagementAuthz = DeviceSessionAuthz & {
  normalizedTargetDeviceId: string;
};

function redactPairedDevice(device: { tokens?: Record<string, DeviceAuthToken> } & Record<string, unknown>) {
  const { tokens, approvedScopes: _approvedScopes, ...rest } = device;
  return {
    ...rest,
    tokens: summarizeDeviceTokens(tokens),
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

function resolveDeviceManagementAuthz(client: GatewayClient | null, targetDeviceId: string): DeviceManagementAuthz {
  return {
    ...resolveDeviceSessionAuthz(client),
    normalizedTargetDeviceId: targetDeviceId.trim(),
  };
}

function isCrossDeviceManagementDenied(authz: DeviceManagementAuthz): boolean {
  return Boolean(
    authz.callerDeviceId && authz.callerDeviceId !== authz.normalizedTargetDeviceId && !authz.isAdminCaller,
  );
}

function shouldReturnRotatedDeviceToken(authz: DeviceManagementAuthz): boolean {
  return Boolean(authz.callerDeviceId && authz.callerDeviceId === authz.normalizedTargetDeviceId);
}

export const deviceHandlers: GatewayRequestHandlers = {
  "device.pair.list": async ({ params, respond }) => {
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
    respond(
      true,
      {
        pending: list.pending,
        paired: list.paired.map((device) => redactPairedDevice(device)),
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
  "device.pair.reject": async ({ params, respond, context }) => {
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
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, DEVICE_TOKEN_ROTATION_DENIED_MESSAGE));
      return;
    }
    const pairedDevice = await getPairedDevice(deviceId);
    if (!pairedDevice) {
      context.logGateway.warn(
        `device token rotation denied device=${deviceId} role=${role} reason=unknown-device-or-role`,
      );
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, DEVICE_TOKEN_ROTATION_DENIED_MESSAGE));
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
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, DEVICE_TOKEN_ROTATION_DENIED_MESSAGE));
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
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, DEVICE_TOKEN_ROTATION_DENIED_MESSAGE));
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
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, DEVICE_TOKEN_REVOCATION_DENIED_MESSAGE));
      return;
    }
    const entry = await revokeDeviceToken({ deviceId, role, callerScopes: authz.callerScopes });
    if (!entry) {
      context.logGateway.warn(
        `device token revocation denied device=${deviceId} role=${role} reason=unknown-device-or-role`,
      );
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, DEVICE_TOKEN_REVOCATION_DENIED_MESSAGE));
      return;
    }
    context.logGateway.info(`device token revoked device=${deviceId} role=${entry.role}`);
    respond(true, { deviceId, role: entry.role, revokedAtMs: entry.revokedAtMs ?? Date.now() }, undefined);
  },
};
