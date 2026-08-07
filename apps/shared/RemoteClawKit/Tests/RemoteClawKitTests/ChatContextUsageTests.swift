import Foundation
import Testing
@testable import RemoteClawChatUI

private final class ContextUsageTestTransport: @unchecked Sendable, RemoteClawChatTransport {
    func requestHistory(sessionKey _: String) async throws -> RemoteClawChatHistoryPayload {
        throw CancellationError()
    }

    func sendMessage(
        sessionKey _: String,
        message _: String,
        thinking _: String,
        idempotencyKey _: String,
        attachments _: [RemoteClawChatAttachmentPayload]) async throws -> RemoteClawChatSendResponse
    {
        throw CancellationError()
    }

    func requestHealth(timeoutMs _: Int) async throws -> Bool {
        false
    }

    func events() -> AsyncStream<RemoteClawChatTransportEvent> {
        AsyncStream { continuation in
            continuation.finish()
        }
    }
}

struct ChatContextUsageTests {
    private func message(
        role: String = "assistant",
        usage: RemoteClawChatUsage? = nil) -> RemoteClawChatMessage
    {
        RemoteClawChatMessage(
            id: UUID(),
            role: role,
            content: [RemoteClawChatMessageContent(
                type: "text",
                text: "hi",
                thinking: nil,
                thinkingSignature: nil,
                mimeType: nil,
                fileName: nil,
                content: nil,
                id: nil,
                name: nil,
                arguments: nil)],
            timestamp: nil,
            usage: usage)
    }

    private func usage(
        input: Int? = nil,
        output: Int? = nil,
        cacheRead: Int? = nil,
        total: Int? = nil,
        costTotal: Double? = nil) throws -> RemoteClawChatUsage
    {
        var payload: [String: Any] = [:]
        payload["input"] = input
        payload["output"] = output
        payload["cacheRead"] = cacheRead
        payload["total"] = total
        if let costTotal {
            payload["cost"] = ["total": costTotal]
        }
        let data = try JSONSerialization.data(withJSONObject: payload.compactMapValues { $0 })
        return try JSONDecoder().decode(RemoteClawChatUsage.self, from: data)
    }

    @Test func `uses newest usage-bearing message, not a sum of runs`() throws {
        let messages = try [
            self.message(usage: self.usage(total: 900)),
            self.message(role: "user"),
            self.message(usage: self.usage(total: 1200)),
        ]
        let result = ChatContextUsageCalculator.usage(
            messages: messages,
            sessionEntry: nil,
            defaults: nil,
            modelContextWindow: 4000)

        #expect(result?.usedTokens == 1200)
        #expect(result?.contextWindowTokens == 4000)
        #expect(result?.percentUsed == 30)
    }

    @Test func `sums usage components when total is missing`() throws {
        let messages = try [self.message(usage: self.usage(input: 700, output: 100, cacheRead: 200))]
        let result = ChatContextUsageCalculator.usage(
            messages: messages,
            sessionEntry: nil,
            defaults: nil,
            modelContextWindow: nil)

        #expect(result?.usedTokens == 1000)
        #expect(result?.contextWindowTokens == nil)
        #expect(result?.fractionUsed == nil)
    }

    @Test func `falls back to session totals without message usage`() {
        let entry = RemoteClawChatSessionEntry(
            key: "main",
            kind: nil,
            displayName: nil,
            surface: nil,
            subject: nil,
            room: nil,
            space: nil,
            updatedAt: nil,
            sessionId: nil,
            systemSent: nil,
            abortedLastRun: nil,
            thinkingLevel: nil,
            verboseLevel: nil,
            inputTokens: nil,
            outputTokens: nil,
            totalTokens: 5000,
            modelProvider: nil,
            model: nil,
            contextTokens: 10000)
        let result = ChatContextUsageCalculator.usage(
            messages: [self.message()],
            sessionEntry: entry,
            defaults: nil,
            modelContextWindow: nil)

        #expect(result?.usedTokens == 5000)
        #expect(result?.contextWindowTokens == 10000)
        #expect(result?.percentUsed == 50)
    }

    @Test func `ignores stale session totals without message usage`() {
        let entry = RemoteClawChatSessionEntry(
            key: "main",
            kind: nil,
            displayName: nil,
            surface: nil,
            subject: nil,
            room: nil,
            space: nil,
            updatedAt: nil,
            sessionId: nil,
            systemSent: nil,
            abortedLastRun: nil,
            thinkingLevel: nil,
            verboseLevel: nil,
            inputTokens: nil,
            outputTokens: nil,
            totalTokens: 5000,
            totalTokensFresh: false,
            modelProvider: nil,
            model: nil,
            contextTokens: 10000)
        let result = ChatContextUsageCalculator.usage(
            messages: [self.message()],
            sessionEntry: entry,
            defaults: nil,
            modelContextWindow: nil)

        #expect(result == nil)
    }

    @Test func `sums cost across all runs`() throws {
        let messages = try [
            self.message(usage: self.usage(total: 100, costTotal: 0.25)),
            self.message(usage: self.usage(total: 200, costTotal: 0.5)),
        ]
        let result = ChatContextUsageCalculator.usage(
            messages: messages,
            sessionEntry: nil,
            defaults: nil,
            modelContextWindow: nil)

        #expect(result?.totalCost == 0.75)
    }

    @Test func `no usage anywhere yields nil`() {
        let result = ChatContextUsageCalculator.usage(
            messages: [self.message()],
            sessionEntry: nil,
            defaults: nil,
            modelContextWindow: 4000)

        #expect(result == nil)
    }

    @Test @MainActor func `view model resolves context totals through a selected global alias`() {
        let vm = RemoteClawChatViewModel(
            sessionKey: "global",
            transport: ContextUsageTestTransport(),
            activeAgentId: "ops")
        vm.sessions = [RemoteClawChatSessionEntry(
            key: "agent:ops:global",
            kind: nil,
            displayName: nil,
            surface: nil,
            subject: nil,
            room: nil,
            space: nil,
            updatedAt: nil,
            sessionId: nil,
            systemSent: nil,
            abortedLastRun: nil,
            thinkingLevel: nil,
            verboseLevel: nil,
            inputTokens: nil,
            outputTokens: nil,
            totalTokens: 5000,
            modelProvider: nil,
            model: nil,
            contextTokens: 10000)]

        #expect(vm.contextUsage?.usedTokens == 5000)
        #expect(vm.contextUsage?.contextWindowTokens == 10000)
    }
}
