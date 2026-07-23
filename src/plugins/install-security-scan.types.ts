// Defines plugin install security scan result types.
import type { RemoteClawConfig } from "../config/types.remoteclaw.js";

/** Overrides that intentionally loosen install safety policy for trusted/operator paths. */
export type InstallSafetyOverrides = {
  config?: RemoteClawConfig;
  dangerouslyForceUnsafeInstall?: boolean;
  trustedSourceLinkedOfficialInstall?: boolean;
};
