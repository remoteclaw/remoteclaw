package org.remoteclaw.android.node

import org.remoteclaw.android.protocol.RemoteClawCanvasA2UICommand
import org.remoteclaw.android.protocol.RemoteClawCanvasCommand
import org.remoteclaw.android.protocol.RemoteClawCameraCommand
import org.remoteclaw.android.protocol.RemoteClawDeviceCommand
import org.remoteclaw.android.protocol.RemoteClawLocationCommand
import org.remoteclaw.android.protocol.RemoteClawNotificationsCommand
import org.remoteclaw.android.protocol.RemoteClawScreenCommand
import org.remoteclaw.android.protocol.RemoteClawSmsCommand

enum class InvokeCommandAvailability {
  Always,
  CameraEnabled,
  LocationEnabled,
  SmsAvailable,
  DebugBuild,
}

data class InvokeCommandSpec(
  val name: String,
  val requiresForeground: Boolean = false,
  val availability: InvokeCommandAvailability = InvokeCommandAvailability.Always,
)

object InvokeCommandRegistry {
  val all: List<InvokeCommandSpec> =
    listOf(
      InvokeCommandSpec(
        name = RemoteClawCanvasCommand.Present.rawValue,
        requiresForeground = true,
      ),
      InvokeCommandSpec(
        name = RemoteClawCanvasCommand.Hide.rawValue,
        requiresForeground = true,
      ),
      InvokeCommandSpec(
        name = RemoteClawCanvasCommand.Navigate.rawValue,
        requiresForeground = true,
      ),
      InvokeCommandSpec(
        name = RemoteClawCanvasCommand.Eval.rawValue,
        requiresForeground = true,
      ),
      InvokeCommandSpec(
        name = RemoteClawCanvasCommand.Snapshot.rawValue,
        requiresForeground = true,
      ),
      InvokeCommandSpec(
        name = RemoteClawCanvasA2UICommand.Push.rawValue,
        requiresForeground = true,
      ),
      InvokeCommandSpec(
        name = RemoteClawCanvasA2UICommand.PushJSONL.rawValue,
        requiresForeground = true,
      ),
      InvokeCommandSpec(
        name = RemoteClawCanvasA2UICommand.Reset.rawValue,
        requiresForeground = true,
      ),
      InvokeCommandSpec(
        name = RemoteClawScreenCommand.Record.rawValue,
        requiresForeground = true,
      ),
      InvokeCommandSpec(
        name = RemoteClawCameraCommand.Snap.rawValue,
        requiresForeground = true,
        availability = InvokeCommandAvailability.CameraEnabled,
      ),
      InvokeCommandSpec(
        name = RemoteClawCameraCommand.Clip.rawValue,
        requiresForeground = true,
        availability = InvokeCommandAvailability.CameraEnabled,
      ),
      InvokeCommandSpec(
        name = RemoteClawLocationCommand.Get.rawValue,
        availability = InvokeCommandAvailability.LocationEnabled,
      ),
      InvokeCommandSpec(
        name = RemoteClawDeviceCommand.Permissions.rawValue,
      ),
      InvokeCommandSpec(
        name = RemoteClawDeviceCommand.Health.rawValue,
      ),
      InvokeCommandSpec(
        name = RemoteClawNotificationsCommand.List.rawValue,
      ),
      InvokeCommandSpec(
        name = RemoteClawNotificationsCommand.Actions.rawValue,
      ),
      InvokeCommandSpec(
        name = RemoteClawSmsCommand.Send.rawValue,
        availability = InvokeCommandAvailability.SmsAvailable,
      ),
      InvokeCommandSpec(
        name = "debug.logs",
        availability = InvokeCommandAvailability.DebugBuild,
      ),
      InvokeCommandSpec(
        name = "debug.ed25519",
        availability = InvokeCommandAvailability.DebugBuild,
      ),
      InvokeCommandSpec(name = "app.update"),
    )

  private val byNameInternal: Map<String, InvokeCommandSpec> = all.associateBy { it.name }

  fun find(command: String): InvokeCommandSpec? = byNameInternal[command]

  fun advertisedCommands(
    cameraEnabled: Boolean,
    locationEnabled: Boolean,
    smsAvailable: Boolean,
    debugBuild: Boolean,
  ): List<String> {
    return all
      .filter { spec ->
        when (spec.availability) {
          InvokeCommandAvailability.Always -> true
          InvokeCommandAvailability.CameraEnabled -> cameraEnabled
          InvokeCommandAvailability.LocationEnabled -> locationEnabled
          InvokeCommandAvailability.SmsAvailable -> smsAvailable
          InvokeCommandAvailability.DebugBuild -> debugBuild
        }
      }
      .map { it.name }
  }
}
