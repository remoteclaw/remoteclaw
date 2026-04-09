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
  private val coreCapabilities =
    setOf(
      RemoteClawCapability.Canvas.rawValue,
      RemoteClawCapability.Screen.rawValue,
      RemoteClawCapability.Device.rawValue,
      RemoteClawCapability.Notifications.rawValue,
      RemoteClawCapability.System.rawValue,
      RemoteClawCapability.AppUpdate.rawValue,
      RemoteClawCapability.Photos.rawValue,
      RemoteClawCapability.Contacts.rawValue,
      RemoteClawCapability.Calendar.rawValue,
    )

  private val optionalCapabilities =
    setOf(
      RemoteClawCapability.Camera.rawValue,
      RemoteClawCapability.Location.rawValue,
      RemoteClawCapability.Sms.rawValue,
      RemoteClawCapability.VoiceWake.rawValue,
      RemoteClawCapability.Motion.rawValue,
    )

  private val coreCommands =
    setOf(
      RemoteClawDeviceCommand.Status.rawValue,
      RemoteClawDeviceCommand.Info.rawValue,
      RemoteClawDeviceCommand.Permissions.rawValue,
      RemoteClawDeviceCommand.Health.rawValue,
      RemoteClawNotificationsCommand.List.rawValue,
      RemoteClawNotificationsCommand.Actions.rawValue,
      RemoteClawSystemCommand.Notify.rawValue,
      RemoteClawPhotosCommand.Latest.rawValue,
      RemoteClawContactsCommand.Search.rawValue,
      RemoteClawContactsCommand.Add.rawValue,
      RemoteClawCalendarCommand.Events.rawValue,
      RemoteClawCalendarCommand.Add.rawValue,
      "app.update",
    )

  private val optionalCommands =
    setOf(
      RemoteClawCameraCommand.Snap.rawValue,
      RemoteClawCameraCommand.Clip.rawValue,
      RemoteClawCameraCommand.List.rawValue,
      RemoteClawLocationCommand.Get.rawValue,
      RemoteClawMotionCommand.Activity.rawValue,
      RemoteClawMotionCommand.Pedometer.rawValue,
      RemoteClawSmsCommand.Send.rawValue,
    )

  private val debugCommands = setOf("debug.logs", "debug.ed25519")

  @Test
  fun advertisedCapabilities_respectsFeatureAvailability() {
    val capabilities = InvokeCommandRegistry.advertisedCapabilities(defaultFlags())

    assertContainsAll(capabilities, coreCapabilities)
    assertMissingAll(capabilities, optionalCapabilities)
  }

  @Test
  fun advertisedCapabilities_includesFeatureCapabilitiesWhenEnabled() {
    val capabilities =
      InvokeCommandRegistry.advertisedCapabilities(
        defaultFlags(
          cameraEnabled = true,
          locationEnabled = true,
          smsAvailable = true,
          voiceWakeEnabled = true,
          motionActivityAvailable = true,
          motionPedometerAvailable = true,
        ),
      )

    assertContainsAll(capabilities, coreCapabilities + optionalCapabilities)
  }

  @Test
  fun advertisedCommands_respectsFeatureAvailability() {
    val commands = InvokeCommandRegistry.advertisedCommands(defaultFlags())

    assertContainsAll(commands, coreCommands)
    assertMissingAll(commands, optionalCommands + debugCommands)
  }

  @Test
  fun advertisedCommands_includesFeatureCommandsWhenEnabled() {
    val commands =
      InvokeCommandRegistry.advertisedCommands(
        defaultFlags(
          cameraEnabled = true,
          locationEnabled = true,
          smsAvailable = true,
          motionActivityAvailable = true,
          motionPedometerAvailable = true,
          debugBuild = true,
        ),
      )

    assertContainsAll(commands, coreCommands + optionalCommands + debugCommands)
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

  private fun defaultFlags(
    cameraEnabled: Boolean = false,
    locationEnabled: Boolean = false,
    smsAvailable: Boolean = false,
    voiceWakeEnabled: Boolean = false,
    motionActivityAvailable: Boolean = false,
    motionPedometerAvailable: Boolean = false,
    debugBuild: Boolean = false,
  ): NodeRuntimeFlags =
    NodeRuntimeFlags(
      cameraEnabled = cameraEnabled,
      locationEnabled = locationEnabled,
      smsAvailable = smsAvailable,
      voiceWakeEnabled = voiceWakeEnabled,
      motionActivityAvailable = motionActivityAvailable,
      motionPedometerAvailable = motionPedometerAvailable,
      debugBuild = debugBuild,
    )

  private fun assertContainsAll(actual: List<String>, expected: Set<String>) {
    expected.forEach { value -> assertTrue(actual.contains(value)) }
  }

  private fun assertMissingAll(actual: List<String>, forbidden: Set<String>) {
    forbidden.forEach { value -> assertFalse(actual.contains(value)) }
  }
}
