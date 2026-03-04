import Foundation

public enum RemoteClawChatTransportEvent: Sendable {
    case health(ok: Bool)
    case tick
    case chat(RemoteClawChatEventPayload)
    case agent(RemoteClawAgentEventPayload)
    case seqGap
}

public protocol RemoteClawChatTransport: Sendable {
    func requestHistory(sessionKey: String) async throws -> RemoteClawChatHistoryPayload
    func sendMessage(
        sessionKey: String,
        message: String,
        thinking: String,
        idempotencyKey: String,
        attachments: [RemoteClawChatAttachmentPayload]) async throws -> RemoteClawChatSendResponse

    func abortRun(sessionKey: String, runId: String) async throws
    func listSessions(limit: Int?) async throws -> RemoteClawChatSessionsListResponse

    func requestHealth(timeoutMs: Int) async throws -> Bool
    func events() -> AsyncStream<RemoteClawChatTransportEvent>

    func setActiveSessionKey(_ sessionKey: String) async throws
}

extension RemoteClawChatTransport {
    public func setActiveSessionKey(_: String) async throws {}

    public func abortRun(sessionKey _: String, runId _: String) async throws {
        throw NSError(
            domain: "RemoteClawChatTransport",
            code: 0,
            userInfo: [NSLocalizedDescriptionKey: "chat.abort not supported by this transport"])
    }

    public func listSessions(limit _: Int?) async throws -> RemoteClawChatSessionsListResponse {
        throw NSError(
            domain: "RemoteClawChatTransport",
            code: 0,
            userInfo: [NSLocalizedDescriptionKey: "sessions.list not supported by this transport"])
    }
}
