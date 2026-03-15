package org.remoteclaw.android.node

import org.remoteclaw.android.protocol.RemoteClawCalendarCommand
import org.remoteclaw.android.protocol.RemoteClawCameraCommand
import org.remoteclaw.android.protocol.RemoteClawCapability
import org.remoteclaw.android.protocol.RemoteClawContactsCommand
import org.remoteclaw.android.protocol.RemoteClawDeviceCommand
import org.remoteclaw.android.protocol.RemoteClawLocationCommand
import org.remoteclaw.android.protocol.RemoteClawMotionCommand
import org.remoteclaw.android.protocol.RemoteClawNotificationsCommand
import org.remoteclaw.android.protocol.RemoteClawPhotosCommand
import org.remoteclaw.android.protocol.RemoteClawSmsCommand
import org.remoteclaw.android.protocol.RemoteClawSystemCommand
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
          motionActivityAvailable = false,
          motionPedometerAvailable = false,
          debugBuild = false,
        ),
      )

    assertTrue(capabilities.contains(RemoteClawCapability.Canvas.rawValue))
    assertTrue(capabilities.contains(RemoteClawCapability.Screen.rawValue))
    assertTrue(capabilities.contains(RemoteClawCapability.Device.rawValue))
    assertTrue(capabilities.contains(RemoteClawCapability.Notifications.rawValue))
    assertTrue(capabilities.contains(RemoteClawCapability.System.rawValue))
    assertTrue(capabilities.contains(RemoteClawCapability.AppUpdate.rawValue))
    assertFalse(capabilities.contains(RemoteClawCapability.Camera.rawValue))
    assertFalse(capabilities.contains(RemoteClawCapability.Location.rawValue))
    assertFalse(capabilities.contains(RemoteClawCapability.Sms.rawValue))
    assertFalse(capabilities.contains(RemoteClawCapability.VoiceWake.rawValue))
    assertTrue(capabilities.contains(RemoteClawCapability.Photos.rawValue))
    assertTrue(capabilities.contains(RemoteClawCapability.Contacts.rawValue))
    assertTrue(capabilities.contains(RemoteClawCapability.Calendar.rawValue))
    assertFalse(capabilities.contains(RemoteClawCapability.Motion.rawValue))
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
          motionActivityAvailable = true,
          motionPedometerAvailable = true,
          debugBuild = false,
        ),
      )

    assertTrue(capabilities.contains(RemoteClawCapability.Canvas.rawValue))
    assertTrue(capabilities.contains(RemoteClawCapability.Screen.rawValue))
    assertTrue(capabilities.contains(RemoteClawCapability.Device.rawValue))
    assertTrue(capabilities.contains(RemoteClawCapability.Notifications.rawValue))
    assertTrue(capabilities.contains(RemoteClawCapability.System.rawValue))
    assertTrue(capabilities.contains(RemoteClawCapability.AppUpdate.rawValue))
    assertTrue(capabilities.contains(RemoteClawCapability.Camera.rawValue))
    assertTrue(capabilities.contains(RemoteClawCapability.Location.rawValue))
    assertTrue(capabilities.contains(RemoteClawCapability.Sms.rawValue))
    assertTrue(capabilities.contains(RemoteClawCapability.VoiceWake.rawValue))
    assertTrue(capabilities.contains(RemoteClawCapability.Photos.rawValue))
    assertTrue(capabilities.contains(RemoteClawCapability.Contacts.rawValue))
    assertTrue(capabilities.contains(RemoteClawCapability.Calendar.rawValue))
    assertTrue(capabilities.contains(RemoteClawCapability.Motion.rawValue))
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
          motionActivityAvailable = false,
          motionPedometerAvailable = false,
          debugBuild = false,
        ),
      )

    assertFalse(commands.contains(RemoteClawCameraCommand.Snap.rawValue))
    assertFalse(commands.contains(RemoteClawCameraCommand.Clip.rawValue))
    assertFalse(commands.contains(RemoteClawCameraCommand.List.rawValue))
    assertFalse(commands.contains(RemoteClawLocationCommand.Get.rawValue))
    assertTrue(commands.contains(RemoteClawDeviceCommand.Status.rawValue))
    assertTrue(commands.contains(RemoteClawDeviceCommand.Info.rawValue))
    assertTrue(commands.contains(RemoteClawDeviceCommand.Permissions.rawValue))
    assertTrue(commands.contains(RemoteClawDeviceCommand.Health.rawValue))
    assertTrue(commands.contains(RemoteClawNotificationsCommand.List.rawValue))
    assertTrue(commands.contains(RemoteClawNotificationsCommand.Actions.rawValue))
    assertTrue(commands.contains(RemoteClawSystemCommand.Notify.rawValue))
    assertTrue(commands.contains(RemoteClawPhotosCommand.Latest.rawValue))
    assertTrue(commands.contains(RemoteClawContactsCommand.Search.rawValue))
    assertTrue(commands.contains(RemoteClawContactsCommand.Add.rawValue))
    assertTrue(commands.contains(RemoteClawCalendarCommand.Events.rawValue))
    assertTrue(commands.contains(RemoteClawCalendarCommand.Add.rawValue))
    assertFalse(commands.contains(RemoteClawMotionCommand.Activity.rawValue))
    assertFalse(commands.contains(RemoteClawMotionCommand.Pedometer.rawValue))
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
          motionActivityAvailable = true,
          motionPedometerAvailable = true,
          debugBuild = true,
        ),
      )

    assertTrue(commands.contains(RemoteClawCameraCommand.Snap.rawValue))
    assertTrue(commands.contains(RemoteClawCameraCommand.Clip.rawValue))
    assertTrue(commands.contains(RemoteClawCameraCommand.List.rawValue))
    assertTrue(commands.contains(RemoteClawLocationCommand.Get.rawValue))
    assertTrue(commands.contains(RemoteClawDeviceCommand.Status.rawValue))
    assertTrue(commands.contains(RemoteClawDeviceCommand.Info.rawValue))
    assertTrue(commands.contains(RemoteClawDeviceCommand.Permissions.rawValue))
    assertTrue(commands.contains(RemoteClawDeviceCommand.Health.rawValue))
    assertTrue(commands.contains(RemoteClawNotificationsCommand.List.rawValue))
    assertTrue(commands.contains(RemoteClawNotificationsCommand.Actions.rawValue))
    assertTrue(commands.contains(RemoteClawSystemCommand.Notify.rawValue))
    assertTrue(commands.contains(RemoteClawPhotosCommand.Latest.rawValue))
    assertTrue(commands.contains(RemoteClawContactsCommand.Search.rawValue))
    assertTrue(commands.contains(RemoteClawContactsCommand.Add.rawValue))
    assertTrue(commands.contains(RemoteClawCalendarCommand.Events.rawValue))
    assertTrue(commands.contains(RemoteClawCalendarCommand.Add.rawValue))
    assertTrue(commands.contains(RemoteClawMotionCommand.Activity.rawValue))
    assertTrue(commands.contains(RemoteClawMotionCommand.Pedometer.rawValue))
    assertTrue(commands.contains(RemoteClawSmsCommand.Send.rawValue))
    assertTrue(commands.contains("debug.logs"))
    assertTrue(commands.contains("debug.ed25519"))
    assertTrue(commands.contains("app.update"))
  }

  @Test
  fun advertisedCommands_onlyIncludesSupportedMotionCommands() {
    val commands =
      InvokeCommandRegistry.advertisedCommands(
        NodeRuntimeFlags(
          cameraEnabled = false,
          locationEnabled = false,
          smsAvailable = false,
          voiceWakeEnabled = false,
          motionActivityAvailable = true,
          motionPedometerAvailable = false,
          debugBuild = false,
        ),
      )

    assertTrue(commands.contains(RemoteClawMotionCommand.Activity.rawValue))
    assertFalse(commands.contains(RemoteClawMotionCommand.Pedometer.rawValue))
  }
}
