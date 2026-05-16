import Testing
@testable import RemoteClaw

@Suite(.serialized) struct RemoteClawAppDelegateTests {
    @Test @MainActor func resolvesRegistryModelBeforeViewTaskAssignsDelegateModel() {
        let registryModel = NodeAppModel()
        RemoteClawAppModelRegistry.appModel = registryModel
        defer { RemoteClawAppModelRegistry.appModel = nil }

        let delegate = RemoteClawAppDelegate()

        #expect(delegate._test_resolvedAppModel() === registryModel)
    }

    @Test @MainActor func prefersExplicitDelegateModelOverRegistryFallback() {
        let registryModel = NodeAppModel()
        let explicitModel = NodeAppModel()
        RemoteClawAppModelRegistry.appModel = registryModel
        defer { RemoteClawAppModelRegistry.appModel = nil }

        let delegate = RemoteClawAppDelegate()
        delegate.appModel = explicitModel

        #expect(delegate._test_resolvedAppModel() === explicitModel)
    }
}
