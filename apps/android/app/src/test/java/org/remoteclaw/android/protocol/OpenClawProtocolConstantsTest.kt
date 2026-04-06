package org.remoteclaw.android.protocol

import org.junit.Assert.assertEquals
import org.junit.Test

class RemoteClawProtocolConstantsTest {
  @Test
  fun canvasCommandsUseStableStrings() {
    assertEquals("canvas.present", RemoteClawCanvasCommand.Present.rawValue)
    assertEquals("canvas.hide", RemoteClawCanvasCommand.Hide.rawValue)
    assertEquals("canvas.navigate", RemoteClawCanvasCommand.Navigate.rawValue)
    assertEquals("canvas.eval", RemoteClawCanvasCommand.Eval.rawValue)
    assertEquals("canvas.snapshot", RemoteClawCanvasCommand.Snapshot.rawValue)
  }

  @Test
  fun a2uiCommandsUseStableStrings() {
    assertEquals("canvas.a2ui.push", RemoteClawCanvasA2UICommand.Push.rawValue)
    assertEquals("canvas.a2ui.pushJSONL", RemoteClawCanvasA2UICommand.PushJSONL.rawValue)
    assertEquals("canvas.a2ui.reset", RemoteClawCanvasA2UICommand.Reset.rawValue)
  }

  @Test
  fun capabilitiesUseStableStrings() {
    assertEquals("canvas", RemoteClawCapability.Canvas.rawValue)
    assertEquals("camera", RemoteClawCapability.Camera.rawValue)
    assertEquals("screen", RemoteClawCapability.Screen.rawValue)
    assertEquals("voiceWake", RemoteClawCapability.VoiceWake.rawValue)
    assertEquals("location", RemoteClawCapability.Location.rawValue)
    assertEquals("sms", RemoteClawCapability.Sms.rawValue)
    assertEquals("device", RemoteClawCapability.Device.rawValue)
  }

  @Test
  fun screenCommandsUseStableStrings() {
    assertEquals("screen.record", RemoteClawScreenCommand.Record.rawValue)
  }

  @Test
  fun notificationsCommandsUseStableStrings() {
    assertEquals("notifications.list", RemoteClawNotificationsCommand.List.rawValue)
  }

  @Test
  fun deviceCommandsUseStableStrings() {
    assertEquals("device.status", RemoteClawDeviceCommand.Status.rawValue)
    assertEquals("device.info", RemoteClawDeviceCommand.Info.rawValue)
  }
}
