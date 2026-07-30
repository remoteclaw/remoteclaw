import Foundation
import Testing
@testable import RemoteClaw

@Suite(.serialized) struct RemoteClawAppDelegateTests {
    @Test @MainActor func `resolves registry model before view task assigns delegate model`() {
        let registryModel = NodeAppModel()
        RemoteClawAppModelRegistry.appModel = registryModel
        defer { RemoteClawAppModelRegistry.appModel = nil }

        let delegate = RemoteClawAppDelegate()

        #expect(delegate._test_resolvedAppModel() === registryModel)
    }

    @Test @MainActor func `prefers explicit delegate model over registry fallback`() {
        let registryModel = NodeAppModel()
        let explicitModel = NodeAppModel()
        RemoteClawAppModelRegistry.appModel = registryModel
        defer { RemoteClawAppModelRegistry.appModel = nil }

        let delegate = RemoteClawAppDelegate()
        delegate.appModel = explicitModel

        #expect(delegate._test_resolvedAppModel() === explicitModel)
    }

    @Test @MainActor func `derives background refresh task identifier from app bundle identifier`() {
        let delegate = RemoteClawAppDelegate()
        let bundleIdentifier = Bundle.main.bundleIdentifier ?? "org.remoteclaw.app.tests"

        #expect(delegate._test_wakeRefreshTaskIdentifier() == "\(bundleIdentifier).bgrefresh")
    }
}
