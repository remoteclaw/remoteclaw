import Foundation

// Stable identifier used for both the macOS LaunchAgent label and Nix-managed defaults suite.
// nix-remoteclaw writes app defaults into this suite to survive app bundle identifier churn.
let launchdLabel = "org.remoteclaw.mac"
let gatewayLaunchdLabel = "org.remoteclaw.gateway"
let onboardingVersionKey = "remoteclaw.onboardingVersion"
let onboardingSeenKey = "remoteclaw.onboardingSeen"
let currentOnboardingVersion = 7
let pauseDefaultsKey = "remoteclaw.pauseEnabled"
let iconAnimationsEnabledKey = "remoteclaw.iconAnimationsEnabled"
let swabbleEnabledKey = "remoteclaw.swabbleEnabled"
let swabbleTriggersKey = "remoteclaw.swabbleTriggers"
let voiceWakeTriggerChimeKey = "remoteclaw.voiceWakeTriggerChime"
let voiceWakeSendChimeKey = "remoteclaw.voiceWakeSendChime"
let showDockIconKey = "remoteclaw.showDockIcon"
let defaultVoiceWakeTriggers = ["remoteclaw"]
let voiceWakeMaxWords = 32
let voiceWakeMaxWordLength = 64
let voiceWakeMicKey = "remoteclaw.voiceWakeMicID"
let voiceWakeMicNameKey = "remoteclaw.voiceWakeMicName"
let voiceWakeLocaleKey = "remoteclaw.voiceWakeLocaleID"
let voiceWakeAdditionalLocalesKey = "remoteclaw.voiceWakeAdditionalLocaleIDs"
let voicePushToTalkEnabledKey = "remoteclaw.voicePushToTalkEnabled"
let talkEnabledKey = "remoteclaw.talkEnabled"
let iconOverrideKey = "remoteclaw.iconOverride"
let connectionModeKey = "remoteclaw.connectionMode"
let remoteTargetKey = "remoteclaw.remoteTarget"
let remoteIdentityKey = "remoteclaw.remoteIdentity"
let remoteProjectRootKey = "remoteclaw.remoteProjectRoot"
let remoteCliPathKey = "remoteclaw.remoteCliPath"
let canvasEnabledKey = "remoteclaw.canvasEnabled"
let cameraEnabledKey = "remoteclaw.cameraEnabled"
let systemRunPolicyKey = "remoteclaw.systemRunPolicy"
let systemRunAllowlistKey = "remoteclaw.systemRunAllowlist"
let systemRunEnabledKey = "remoteclaw.systemRunEnabled"
let locationModeKey = "remoteclaw.locationMode"
let locationPreciseKey = "remoteclaw.locationPreciseEnabled"
let peekabooBridgeEnabledKey = "remoteclaw.peekabooBridgeEnabled"
let deepLinkKeyKey = "remoteclaw.deepLinkKey"
let cliInstallPromptedVersionKey = "remoteclaw.cliInstallPromptedVersion"
let heartbeatsEnabledKey = "remoteclaw.heartbeatsEnabled"
let debugPaneEnabledKey = "remoteclaw.debugPaneEnabled"
let debugFileLogEnabledKey = "remoteclaw.debug.fileLogEnabled"
let appLogLevelKey = "remoteclaw.debug.appLogLevel"
let voiceWakeSupported: Bool = ProcessInfo.processInfo.operatingSystemVersion.majorVersion >= 26
