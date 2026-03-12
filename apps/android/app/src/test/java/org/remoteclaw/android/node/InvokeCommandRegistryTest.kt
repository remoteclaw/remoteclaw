package org.remoteclaw.android.node

import org.remoteclaw.android.protocol.RemoteClawCameraCommand
import org.remoteclaw.android.protocol.RemoteClawLocationCommand
import org.remoteclaw.android.protocol.RemoteClawNotificationsCommand
import org.remoteclaw.android.protocol.RemoteClawSmsCommand
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class InvokeCommandRegistryTest {
  @Test
  fun advertisedCommands_respectsFeatureAvailability() {
    val commands =
      InvokeCommandRegistry.advertisedCommands(
        cameraEnabled = false,
        locationEnabled = false,
        smsAvailable = false,
        debugBuild = false,
      )

    assertFalse(commands.contains(RemoteClawCameraCommand.Snap.rawValue))
    assertFalse(commands.contains(RemoteClawCameraCommand.Clip.rawValue))
    assertFalse(commands.contains(RemoteClawLocationCommand.Get.rawValue))
    assertTrue(commands.contains(RemoteClawNotificationsCommand.List.rawValue))
    assertFalse(commands.contains(RemoteClawSmsCommand.Send.rawValue))
    assertFalse(commands.contains("debug.logs"))
    assertFalse(commands.contains("debug.ed25519"))
    assertTrue(commands.contains("app.update"))
  }

  @Test
  fun advertisedCommands_includesFeatureCommandsWhenEnabled() {
    val commands =
      InvokeCommandRegistry.advertisedCommands(
        cameraEnabled = true,
        locationEnabled = true,
        smsAvailable = true,
        debugBuild = true,
      )

    assertTrue(commands.contains(RemoteClawCameraCommand.Snap.rawValue))
    assertTrue(commands.contains(RemoteClawCameraCommand.Clip.rawValue))
    assertTrue(commands.contains(RemoteClawLocationCommand.Get.rawValue))
    assertTrue(commands.contains(RemoteClawNotificationsCommand.List.rawValue))
    assertTrue(commands.contains(RemoteClawSmsCommand.Send.rawValue))
    assertTrue(commands.contains("debug.logs"))
    assertTrue(commands.contains("debug.ed25519"))
    assertTrue(commands.contains("app.update"))
  }
}
