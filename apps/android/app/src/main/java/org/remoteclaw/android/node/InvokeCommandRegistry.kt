package org.remoteclaw.android.node

import org.remoteclaw.android.protocol.RemoteClawCalendarCommand
import org.remoteclaw.android.protocol.RemoteClawCanvasA2UICommand
import org.remoteclaw.android.protocol.RemoteClawCanvasCommand
import org.remoteclaw.android.protocol.RemoteClawCameraCommand
import org.remoteclaw.android.protocol.RemoteClawCapability
import org.remoteclaw.android.protocol.RemoteClawContactsCommand
import org.remoteclaw.android.protocol.RemoteClawDeviceCommand
import org.remoteclaw.android.protocol.RemoteClawLocationCommand
import org.remoteclaw.android.protocol.RemoteClawMotionCommand
import org.remoteclaw.android.protocol.RemoteClawNotificationsCommand
import org.remoteclaw.android.protocol.RemoteClawPhotosCommand
import org.remoteclaw.android.protocol.RemoteClawScreenCommand
import org.remoteclaw.android.protocol.RemoteClawSmsCommand
import org.remoteclaw.android.protocol.RemoteClawSystemCommand

data class NodeRuntimeFlags(
  val cameraEnabled: Boolean,
  val locationEnabled: Boolean,
  val smsAvailable: Boolean,
  val voiceWakeEnabled: Boolean,
  val motionActivityAvailable: Boolean,
  val motionPedometerAvailable: Boolean,
  val debugBuild: Boolean,
)

enum class InvokeCommandAvailability {
  Always,
  CameraEnabled,
  LocationEnabled,
  SmsAvailable,
  MotionActivityAvailable,
  MotionPedometerAvailable,
  DebugBuild,
}

enum class NodeCapabilityAvailability {
  Always,
  CameraEnabled,
  LocationEnabled,
  SmsAvailable,
  VoiceWakeEnabled,
  MotionAvailable,
}

data class NodeCapabilitySpec(
  val name: String,
  val availability: NodeCapabilityAvailability = NodeCapabilityAvailability.Always,
)

data class InvokeCommandSpec(
  val name: String,
  val requiresForeground: Boolean = false,
  val availability: InvokeCommandAvailability = InvokeCommandAvailability.Always,
)

object InvokeCommandRegistry {
  val capabilityManifest: List<NodeCapabilitySpec> =
    listOf(
      NodeCapabilitySpec(name = RemoteClawCapability.Canvas.rawValue),
      NodeCapabilitySpec(name = RemoteClawCapability.Screen.rawValue),
      NodeCapabilitySpec(name = RemoteClawCapability.Device.rawValue),
      NodeCapabilitySpec(
        name = RemoteClawCapability.Camera.rawValue,
        availability = NodeCapabilityAvailability.CameraEnabled,
      ),
      NodeCapabilitySpec(
        name = RemoteClawCapability.Sms.rawValue,
        availability = NodeCapabilityAvailability.SmsAvailable,
      ),
      NodeCapabilitySpec(
        name = RemoteClawCapability.VoiceWake.rawValue,
        availability = NodeCapabilityAvailability.VoiceWakeEnabled,
      ),
      NodeCapabilitySpec(
        name = RemoteClawCapability.Location.rawValue,
        availability = NodeCapabilityAvailability.LocationEnabled,
      ),
      NodeCapabilitySpec(name = RemoteClawCapability.Photos.rawValue),
      NodeCapabilitySpec(name = RemoteClawCapability.Contacts.rawValue),
      NodeCapabilitySpec(name = RemoteClawCapability.Calendar.rawValue),
      NodeCapabilitySpec(
        name = RemoteClawCapability.Motion.rawValue,
        availability = NodeCapabilityAvailability.MotionAvailable,
      ),
    )

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
        name = RemoteClawSystemCommand.Notify.rawValue,
      ),
      InvokeCommandSpec(
        name = RemoteClawCameraCommand.List.rawValue,
        requiresForeground = true,
        availability = InvokeCommandAvailability.CameraEnabled,
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
        name = RemoteClawDeviceCommand.Status.rawValue,
      ),
      InvokeCommandSpec(
        name = RemoteClawDeviceCommand.Info.rawValue,
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
        name = RemoteClawPhotosCommand.Latest.rawValue,
      ),
      InvokeCommandSpec(
        name = RemoteClawContactsCommand.Search.rawValue,
      ),
      InvokeCommandSpec(
        name = RemoteClawContactsCommand.Add.rawValue,
      ),
      InvokeCommandSpec(
        name = RemoteClawCalendarCommand.Events.rawValue,
      ),
      InvokeCommandSpec(
        name = RemoteClawCalendarCommand.Add.rawValue,
      ),
      InvokeCommandSpec(
        name = RemoteClawMotionCommand.Activity.rawValue,
        availability = InvokeCommandAvailability.MotionActivityAvailable,
      ),
      InvokeCommandSpec(
        name = RemoteClawMotionCommand.Pedometer.rawValue,
        availability = InvokeCommandAvailability.MotionPedometerAvailable,
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

  fun advertisedCapabilities(flags: NodeRuntimeFlags): List<String> {
    return capabilityManifest
      .filter { spec ->
        when (spec.availability) {
          NodeCapabilityAvailability.Always -> true
          NodeCapabilityAvailability.CameraEnabled -> flags.cameraEnabled
          NodeCapabilityAvailability.LocationEnabled -> flags.locationEnabled
          NodeCapabilityAvailability.SmsAvailable -> flags.smsAvailable
          NodeCapabilityAvailability.VoiceWakeEnabled -> flags.voiceWakeEnabled
          NodeCapabilityAvailability.MotionAvailable -> flags.motionActivityAvailable || flags.motionPedometerAvailable
        }
      }
      .map { it.name }
  }

  fun advertisedCommands(flags: NodeRuntimeFlags): List<String> {
    return all
      .filter { spec ->
        when (spec.availability) {
          InvokeCommandAvailability.Always -> true
          InvokeCommandAvailability.CameraEnabled -> flags.cameraEnabled
          InvokeCommandAvailability.LocationEnabled -> flags.locationEnabled
          InvokeCommandAvailability.SmsAvailable -> flags.smsAvailable
          InvokeCommandAvailability.MotionActivityAvailable -> flags.motionActivityAvailable
          InvokeCommandAvailability.MotionPedometerAvailable -> flags.motionPedometerAvailable
          InvokeCommandAvailability.DebugBuild -> flags.debugBuild
        }
      }
      .map { it.name }
  }
}
