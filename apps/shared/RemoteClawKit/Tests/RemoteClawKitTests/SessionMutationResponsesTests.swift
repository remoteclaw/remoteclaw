import Foundation
import RemoteClawKit
import Testing

struct SessionMutationResponsesTests {
    @Test
    func compactResponseAcceptsSuccess() throws {
        try RemoteClawSessionsCompactResponse.requireSuccess(
            from: Data(#"{"ok":true,"key":"agent:main:main","compacted":true}"#.utf8))
    }

    @Test
    func compactResponseSurfacesGatewayFailureReason() {
        let data = Data(
            #"{"ok":false,"key":"agent:main:main","compacted":false,"reason":"turn failed"}"#.utf8)
        do {
            try RemoteClawSessionsCompactResponse.requireSuccess(
                from: data)
            Issue.record("expected failed compaction response to throw")
        } catch let error as RemoteClawSessionsCompactError {
            #expect(error.errorDescription == "turn failed")
        } catch {
            Issue.record("unexpected error: \(error)")
        }
    }
}
