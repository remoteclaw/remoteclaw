package org.remoteclaw.android.node

import org.remoteclaw.android.protocol.RemoteClawCameraCommand
import org.remoteclaw.android.protocol.RemoteClawCapability
import org.remoteclaw.android.protocol.RemoteClawDeviceCommand
import org.remoteclaw.android.protocol.RemoteClawLocationCommand
import org.remoteclaw.android.protocol.RemoteClawNotificationsCommand
import org.remoteclaw.android.protocol.RemoteClawSmsCommand
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class InvokeCommandRegistryTest {
  @Test
  fun advertisedCapabilities_respectsFeatureAvailability() {
    val capabilities =
      InvokeCommandRegistry.advertisedCapabilities(
        NodeRuntimeFlags(
          cameraEnabled = false,
          locationEnabled = false,
          smsAvailable = false,
          voiceWakeEnabled = false,
          debugBuild = false,
        ),
      )

    assertTrue(capabilities.contains(RemoteClawCapability.Canvas.rawValue))
    assertTrue(capabilities.contains(RemoteClawCapability.Screen.rawValue))
    assertTrue(capabilities.contains(RemoteClawCapability.Device.rawValue))
    assertFalse(capabilities.contains(RemoteClawCapability.Camera.rawValue))
    assertFalse(capabilities.contains(RemoteClawCapability.Location.rawValue))
    assertFalse(capabilities.contains(RemoteClawCapability.Sms.rawValue))
    assertFalse(capabilities.contains(RemoteClawCapability.VoiceWake.rawValue))
  }

  @Test
  fun advertisedCapabilities_includesFeatureCapabilitiesWhenEnabled() {
    val capabilities =
      InvokeCommandRegistry.advertisedCapabilities(
        NodeRuntimeFlags(
          cameraEnabled = true,
          locationEnabled = true,
          smsAvailable = true,
          voiceWakeEnabled = true,
          debugBuild = false,
        ),
      )

    assertTrue(capabilities.contains(RemoteClawCapability.Canvas.rawValue))
    assertTrue(capabilities.contains(RemoteClawCapability.Screen.rawValue))
    assertTrue(capabilities.contains(RemoteClawCapability.Device.rawValue))
    assertTrue(capabilities.contains(RemoteClawCapability.Camera.rawValue))
    assertTrue(capabilities.contains(RemoteClawCapability.Location.rawValue))
    assertTrue(capabilities.contains(RemoteClawCapability.Sms.rawValue))
    assertTrue(capabilities.contains(RemoteClawCapability.VoiceWake.rawValue))
  }

  @Test
  fun advertisedCommands_respectsFeatureAvailability() {
    val commands =
      InvokeCommandRegistry.advertisedCommands(
        NodeRuntimeFlags(
          cameraEnabled = false,
          locationEnabled = false,
          smsAvailable = false,
          voiceWakeEnabled = false,
          debugBuild = false,
        ),
      )

    assertFalse(commands.contains(RemoteClawCameraCommand.Snap.rawValue))
    assertFalse(commands.contains(RemoteClawCameraCommand.Clip.rawValue))
    assertFalse(commands.contains(RemoteClawCameraCommand.List.rawValue))
    assertFalse(commands.contains(RemoteClawLocationCommand.Get.rawValue))
    assertTrue(commands.contains(RemoteClawDeviceCommand.Permissions.rawValue))
    assertTrue(commands.contains(RemoteClawDeviceCommand.Health.rawValue))
    assertTrue(commands.contains(RemoteClawNotificationsCommand.List.rawValue))
    assertTrue(commands.contains(RemoteClawNotificationsCommand.Actions.rawValue))
    assertFalse(commands.contains(RemoteClawSmsCommand.Send.rawValue))
    assertFalse(commands.contains("debug.logs"))
    assertFalse(commands.contains("debug.ed25519"))
    assertTrue(commands.contains("app.update"))
  }

  @Test
  fun advertisedCommands_includesFeatureCommandsWhenEnabled() {
    val commands =
      InvokeCommandRegistry.advertisedCommands(
        NodeRuntimeFlags(
          cameraEnabled = true,
          locationEnabled = true,
          smsAvailable = true,
          voiceWakeEnabled = false,
          debugBuild = true,
        ),
      )

    assertTrue(commands.contains(RemoteClawCameraCommand.Snap.rawValue))
    assertTrue(commands.contains(RemoteClawCameraCommand.Clip.rawValue))
    assertTrue(commands.contains(RemoteClawCameraCommand.List.rawValue))
    assertTrue(commands.contains(RemoteClawLocationCommand.Get.rawValue))
    assertTrue(commands.contains(RemoteClawDeviceCommand.Permissions.rawValue))
    assertTrue(commands.contains(RemoteClawDeviceCommand.Health.rawValue))
    assertTrue(commands.contains(RemoteClawNotificationsCommand.List.rawValue))
    assertTrue(commands.contains(RemoteClawNotificationsCommand.Actions.rawValue))
    assertTrue(commands.contains(RemoteClawSmsCommand.Send.rawValue))
    assertTrue(commands.contains("debug.logs"))
    assertTrue(commands.contains("debug.ed25519"))
    assertTrue(commands.contains("app.update"))
  }
}
