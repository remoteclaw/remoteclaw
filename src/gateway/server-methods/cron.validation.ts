import type {
  CronDelivery,
  CronFailureDestination,
  CronMessageChannel,
  CronPayload,
  CronSessionTarget,
} from "../../cron/types.js";
import {
  normalizeOptionalLowercaseString,
  normalizeOptionalString,
} from "../../shared/string-coerce.js";

/**
 * Thrown when a cron job's announce delivery target cannot be resolved
 * unambiguously at create/update time. The gateway cron handlers translate this
 * into an INVALID_REQUEST response so the caller learns immediately instead of
 * the job failing (or delivering to the wrong place) at fire time. See #2750.
 */
export class CronDeliveryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CronDeliveryValidationError";
  }
}

export function isCronDeliveryValidationError(
  value: unknown,
): value is CronDeliveryValidationError {
  return value instanceof CronDeliveryValidationError;
}

/**
 * An absent or `"last"` announce channel is an ambiguous reference: at fire time
 * it resolves to the single configured channel, but with more than one channel
 * configured there is no unambiguous target (mirrors
 * `infra/outbound/channel-selection.ts`).
 */
const AMBIGUOUS_CHANNEL = "last";

/** The minimal job shape the announce-delivery validator inspects. */
export type CronDeliveryValidationInput = {
  sessionTarget: CronSessionTarget;
  payload?: CronPayload | undefined;
  delivery?: CronDelivery | undefined;
};

type AnnounceTarget = {
  /** Field path used in the validation error message. */
  label: string;
  /** Effective announce channel (`"last"` when absent/unspecified). */
  channel: CronMessageChannel;
};

function normalizeChannel(value: unknown): CronMessageChannel | undefined {
  const normalized = normalizeOptionalLowercaseString(value);
  return normalized ? (normalized as CronMessageChannel) : undefined;
}

/**
 * Announce channel delivery is only honored for isolated-like session targets;
 * `main` jobs reject it at create (`assertDeliverySupport`) and strip it at
 * update (`applyJobPatch`), so there is no announce channel to validate there.
 */
function isIsolatedLikeSessionTarget(sessionTarget: CronSessionTarget): boolean {
  return (
    sessionTarget === "isolated" ||
    sessionTarget === "current" ||
    sessionTarget.startsWith("session:")
  );
}

function failureDestinationHasMeaningfulFields(
  failureDestination: CronFailureDestination,
): boolean {
  return Boolean(
    normalizeChannel(failureDestination.channel) ||
    normalizeOptionalString(failureDestination.to) ||
    normalizeOptionalString(failureDestination.accountId) ||
    normalizeOptionalLowercaseString(failureDestination.mode),
  );
}

/**
 * Collect the announce delivery targets (primary delivery + failure
 * destination) whose channel must resolve unambiguously.
 *
 * Mirrors the fork's runtime delivery resolution (`src/cron/delivery.ts`
 * `resolveCronDeliveryPlan` / `resolveFailureDestination`) and persistence rules
 * (`src/cron/service/jobs.ts`): an absent announce channel resolves to `"last"`,
 * a `webhook`/`none` target carries no announce channel, and announce delivery
 * applies only to isolated-like session targets.
 */
function collectAnnounceTargets(
  job: CronDeliveryValidationInput,
  options: { includeImplicit: boolean },
): AnnounceTarget[] {
  const targets: AnnounceTarget[] = [];
  const delivery = job.delivery;
  const hasDelivery = Boolean(delivery && typeof delivery === "object");

  if (!hasDelivery) {
    // Implicit announce: an isolated agentTurn with no delivery config defaults
    // to announce delivery at create time (`resolveInitialCronDelivery`).
    if (
      options.includeImplicit &&
      job.sessionTarget === "isolated" &&
      job.payload?.kind === "agentTurn"
    ) {
      targets.push({ label: "delivery.channel", channel: AMBIGUOUS_CHANNEL });
    }
    return targets;
  }

  if (!isIsolatedLikeSessionTarget(job.sessionTarget)) {
    return targets;
  }

  const resolved = delivery as CronDelivery;
  const mode = normalizeOptionalLowercaseString(resolved.mode);
  if (mode !== "none" && mode !== "webhook") {
    // "announce", "deliver", or unspecified — all resolve to announce delivery.
    targets.push({
      label: "delivery.channel",
      channel: normalizeChannel(resolved.channel) ?? AMBIGUOUS_CHANNEL,
    });
  }

  const failureDestination = resolved.failureDestination;
  if (
    failureDestination &&
    typeof failureDestination === "object" &&
    failureDestinationHasMeaningfulFields(failureDestination)
  ) {
    const failureMode = normalizeOptionalLowercaseString(failureDestination.mode);
    if (failureMode !== "webhook") {
      targets.push({
        label: "delivery.failureDestination.channel",
        channel: normalizeChannel(failureDestination.channel) ?? AMBIGUOUS_CHANNEL,
      });
    }
  }

  return targets;
}

function assertAnnounceTargetsUnambiguous(
  targets: readonly AnnounceTarget[],
  configuredAnnounceChannelIds: readonly string[],
): void {
  if (configuredAnnounceChannelIds.length <= 1) {
    // Zero or one configured channel always resolves unambiguously.
    return;
  }
  for (const target of targets) {
    if (target.channel === AMBIGUOUS_CHANNEL) {
      const sorted = [...configuredAnnounceChannelIds].toSorted();
      throw new CronDeliveryValidationError(
        `${target.label} is ambiguous because multiple channels are configured ` +
          `(${sorted.join(", ")}). Set ${target.label} explicitly to one of them.`,
      );
    }
  }
}

/**
 * Throw a {@link CronDeliveryValidationError} when a job's announce delivery (or
 * failure destination) channel is absent/`"last"` while more than one channel is
 * configured. Named channels and single/zero-channel setups are always accepted.
 *
 * @param options.includeImplicit when true, an isolated agentTurn with no
 *   delivery config is treated as an implicit announce delivery (matching create
 *   time). Updates pass `false` because they validate the explicit merged
 *   delivery only.
 */
export function assertValidCronAnnounceDelivery(
  job: CronDeliveryValidationInput,
  configuredAnnounceChannelIds: readonly string[],
  options: { includeImplicit: boolean },
): void {
  const targets = collectAnnounceTargets(job, options);
  assertAnnounceTargetsUnambiguous(targets, configuredAnnounceChannelIds);
}

/** `cron.add` guard: validates the normalized job being created. */
export function assertValidCronCreateDelivery(
  job: CronDeliveryValidationInput,
  configuredAnnounceChannelIds: readonly string[],
): void {
  assertValidCronAnnounceDelivery(job, configuredAnnounceChannelIds, {
    includeImplicit: true,
  });
}

/** `cron.update` guard: validates the effective delivery after the patch merge. */
export function assertValidCronUpdateDelivery(
  job: CronDeliveryValidationInput,
  configuredAnnounceChannelIds: readonly string[],
): void {
  assertValidCronAnnounceDelivery(job, configuredAnnounceChannelIds, {
    includeImplicit: false,
  });
}
