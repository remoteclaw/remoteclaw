import Foundation
import RemoteClawChatUI
import RemoteClawProtocol

enum AppleReviewDemoMode {
    static let setupCode = "APPLE-REVIEW-DEMO"
    static let gatewayName = "Apple Review Demo Gateway"
    static let gatewayAddress = "Local demo mode"
    static let gatewayID = "apple-review-demo"

    static func isSetupCode(_ value: String) -> Bool {
        value.trimmingCharacters(in: .whitespacesAndNewlines)
            .localizedCaseInsensitiveCompare(self.setupCode) == .orderedSame
    }

    static var agents: [AgentSummary] {
        [
            AgentSummary(
                id: "main",
                name: "Main",
                identity: ["emoji": AnyCodable("OC")],
                workspace: "Apple Review Demo",
                model: ["provider": AnyCodable("demo"), "model": AnyCodable("local-demo")],
                agentruntime: ["kind": AnyCodable("local")],
                thinkinglevels: nil,
                thinkingoptions: ["auto", "low", "medium"],
                thinkingdefault: "auto"),
        ]
    }
}

struct AppleReviewDemoChatTransport: RemoteClawChatTransport {
    private let store = AppleReviewDemoChatStore()

    func createSession(
        key: String,
        label _: String?,
        parentSessionKey _: String?) async throws -> RemoteClawChatCreateSessionResponse
    {
        try await self.store.createSession(key: key)
    }

    func requestHistory(sessionKey: String) async throws -> RemoteClawChatHistoryPayload {
        try await self.store.history(sessionKey: sessionKey)
    }

    func listModels() async throws -> [RemoteClawChatModelChoice] {
        [
            RemoteClawChatModelChoice(
                modelID: "local-demo",
                name: "Apple Review Demo",
                provider: "demo",
                contextWindow: 128_000),
        ]
    }

    func sendMessage(
        sessionKey: String,
        message: String,
        thinking _: String,
        idempotencyKey: String,
        attachments _: [RemoteClawChatAttachmentPayload]) async throws -> RemoteClawChatSendResponse
    {
        try await self.store.sendMessage(
            sessionKey: sessionKey,
            message: message,
            runId: idempotencyKey)
    }

    func abortRun(sessionKey _: String, runId _: String) async throws {}

    func listSessions(limit _: Int?) async throws -> RemoteClawChatSessionsListResponse {
        try await self.store.sessions()
    }

    func setSessionModel(sessionKey _: String, model _: String?) async throws {}

    func setSessionThinking(sessionKey _: String, thinkingLevel _: String) async throws {}

    func requestHealth(timeoutMs _: Int) async throws -> Bool {
        true
    }

    func waitForRunCompletion(runId _: String, timeoutMs _: Int) async -> Bool {
        true
    }

    func events() -> AsyncStream<RemoteClawChatTransportEvent> {
        AsyncStream { continuation in
            continuation.yield(.health(ok: true))
            continuation.finish()
        }
    }

    func setActiveSessionKey(_: String) async throws {}

    func resetSession(sessionKey _: String) async throws {
        await self.store.reset()
    }

    func compactSession(sessionKey _: String) async throws {}
}

private actor AppleReviewDemoChatStore {
    private let sessionKey = "main"
    private var messages: [RemoteClawChatMessage]

    init() {
        self.messages = AppleReviewDemoChatStore.seedMessages()
    }

    func createSession(key: String) throws -> RemoteClawChatCreateSessionResponse {
        try Self.decode(
            CreateSessionPayload(ok: true, key: key, sessionId: "apple-review-demo-\(key)"),
            as: RemoteClawChatCreateSessionResponse.self)
    }

    func history(sessionKey: String) throws -> RemoteClawChatHistoryPayload {
        let normalizedSessionKey = Self.normalizedSessionKey(sessionKey)
        return try Self.decode(
            HistoryPayload(
                sessionKey: normalizedSessionKey,
                sessionId: "apple-review-demo-\(normalizedSessionKey)",
                messages: self.messages,
                thinkingLevel: "auto"),
            as: RemoteClawChatHistoryPayload.self)
    }

    func sendMessage(sessionKey _: String, message: String, runId: String) throws -> RemoteClawChatSendResponse {
        let now = Date().timeIntervalSince1970 * 1000
        self.messages.append(Self.message(role: "user", text: message, timestamp: now))
        let trimmed = message.trimmingCharacters(in: .whitespacesAndNewlines)
        let subject = trimmed.isEmpty ? "that request" : "\"\(trimmed)\""
        self.messages.append(
            Self.message(
                role: "assistant",
                text: """
                Demo mode is active. I can show the review flow locally for \(subject), including chat, agent \
                selection, settings, and Gateway-connected UI states. Live automation requires pairing a real \
                RemoteClaw Gateway.
                """,
                timestamp: now + 1))
        return try Self.decode(
            SendPayload(runId: runId, status: "ok"),
            as: RemoteClawChatSendResponse.self)
    }

    func sessions() throws -> RemoteClawChatSessionsListResponse {
        let entry = RemoteClawChatSessionEntry(
            key: self.sessionKey,
            kind: "chat",
            displayName: "Apple Review Demo",
            surface: "ios",
            subject: "Gateway review flow",
            room: nil,
            space: nil,
            updatedAt: Date().timeIntervalSince1970 * 1000,
            sessionId: "apple-review-demo-main",
            systemSent: true,
            abortedLastRun: false,
            thinkingLevel: "auto",
            verboseLevel: nil,
            inputTokens: nil,
            outputTokens: nil,
            totalTokens: nil,
            modelProvider: "demo",
            model: "local-demo",
            contextTokens: 128_000,
            thinkingLevels: [
                RemoteClawChatThinkingLevelOption(id: "auto", label: "Auto"),
                RemoteClawChatThinkingLevelOption(id: "low", label: "Low"),
                RemoteClawChatThinkingLevelOption(id: "medium", label: "Medium"),
            ],
            thinkingOptions: ["auto", "low", "medium"],
            thinkingDefault: "auto")
        return RemoteClawChatSessionsListResponse(
            ts: Date().timeIntervalSince1970 * 1000,
            path: nil,
            count: 1,
            defaults: RemoteClawChatSessionsDefaults(
                modelProvider: "demo",
                model: "local-demo",
                contextTokens: 128_000,
                thinkingLevels: [
                    RemoteClawChatThinkingLevelOption(id: "auto", label: "Auto"),
                    RemoteClawChatThinkingLevelOption(id: "low", label: "Low"),
                    RemoteClawChatThinkingLevelOption(id: "medium", label: "Medium"),
                ],
                thinkingOptions: ["auto", "low", "medium"],
                thinkingDefault: "auto",
                mainSessionKey: self.sessionKey),
            sessions: [entry])
    }

    func reset() {
        self.messages = Self.seedMessages()
    }

    private static func seedMessages() -> [RemoteClawChatMessage] {
        let now = Date().timeIntervalSince1970 * 1000
        return [
            self.message(
                role: "assistant",
                text: """
                Apple Review demo mode is active. This local chat transport lets reviewers inspect the iOS app \
                without a private Gateway.
                """,
                timestamp: now),
        ]
    }

    private static func message(role: String, text: String, timestamp: Double) -> RemoteClawChatMessage {
        RemoteClawChatMessage(
            role: role,
            content: [
                RemoteClawChatMessageContent(
                    type: "text",
                    text: text,
                    mimeType: nil,
                    fileName: nil,
                    content: nil),
            ],
            timestamp: timestamp)
    }

    private static func normalizedSessionKey(_ value: String) -> String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? "main" : trimmed
    }

    private static func decode<T: Decodable>(_ value: some Encodable, as type: T.Type) throws -> T {
        let data = try JSONEncoder().encode(value)
        return try JSONDecoder().decode(type, from: data)
    }

    private struct HistoryPayload: Encodable {
        var sessionKey: String
        var sessionId: String?
        var messages: [RemoteClawChatMessage]?
        var thinkingLevel: String?
    }

    private struct SendPayload: Encodable {
        var runId: String
        var status: String
    }

    private struct CreateSessionPayload: Encodable {
        var ok: Bool?
        var key: String
        var sessionId: String?
    }
}
