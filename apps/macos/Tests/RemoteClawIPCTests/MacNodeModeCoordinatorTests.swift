import Foundation
import RemoteClawKit
import Testing
@testable import RemoteClaw

struct MacNodeModeCoordinatorTests {
    @Test func remoteModeDoesNotAdvertiseBrowserProxy() {
        let caps = MacNodeModeCoordinator.resolvedCaps(
            browserControlEnabled: true,
            cameraEnabled: false,
            locationMode: .off,
            connectionMode: .remote)
        let commands = MacNodeModeCoordinator.resolvedCommands(caps: caps)

        #expect(!caps.contains(RemoteClawCapability.browser.rawValue))
        #expect(!commands.contains(RemoteClawBrowserCommand.proxy.rawValue))
        #expect(commands.contains(RemoteClawCanvasCommand.present.rawValue))
        #expect(commands.contains(RemoteClawSystemCommand.notify.rawValue))
    }

    @Test func localModeAdvertisesBrowserProxyWhenEnabled() {
        let caps = MacNodeModeCoordinator.resolvedCaps(
            browserControlEnabled: true,
            cameraEnabled: false,
            locationMode: .off,
            connectionMode: .local)
        let commands = MacNodeModeCoordinator.resolvedCommands(caps: caps)

        #expect(caps.contains(RemoteClawCapability.browser.rawValue))
        #expect(commands.contains(RemoteClawBrowserCommand.proxy.rawValue))
    }
}
