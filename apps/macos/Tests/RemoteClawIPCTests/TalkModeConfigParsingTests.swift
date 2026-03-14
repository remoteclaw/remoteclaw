import RemoteClawProtocol
import Testing

@testable import RemoteClaw

@Suite struct TalkModeConfigParsingTests {
    @Test func rejectsNormalizedTalkProviderPayloadWithoutResolved() {
        let talk: [String: AnyCodable] = [
            "provider": AnyCodable("elevenlabs"),
            "providers": AnyCodable([
                "elevenlabs": [
                    "voiceId": "voice-normalized",
                ],
            ]),
            "voiceId": AnyCodable("voice-legacy"),
        ]

        let selection = TalkModeRuntime.selectTalkProviderConfig(talk)
        #expect(selection == nil)
    }

    @Test func fallsBackToLegacyTalkFieldsWhenNormalizedPayloadMissing() {
        let talk: [String: AnyCodable] = [
            "voiceId": AnyCodable("voice-legacy"),
            "apiKey": AnyCodable("legacy-key"),
        ]

        let selection = TalkModeRuntime.selectTalkProviderConfig(talk)
        #expect(selection?.provider == "elevenlabs")
        #expect(selection?.normalizedPayload == false)
        #expect(selection?.config["voiceId"]?.stringValue == "voice-legacy")
        #expect(selection?.config["apiKey"]?.stringValue == "legacy-key")
    }

    @Test func readsSilenceTimeoutMs() {
        let talk: [String: AnyCodable] = [
            "silenceTimeoutMs": AnyCodable(1500),
        ]

        #expect(TalkModeRuntime.resolvedSilenceTimeoutMs(talk) == 1500)
    }

    @Test func defaultsSilenceTimeoutMsWhenMissing() {
        #expect(TalkModeRuntime.resolvedSilenceTimeoutMs(nil) == TalkDefaults.silenceTimeoutMs)
    }

    @Test func defaultsSilenceTimeoutMsWhenInvalid() {
        let talk: [String: AnyCodable] = [
            "silenceTimeoutMs": AnyCodable(0),
        ]

        #expect(TalkModeRuntime.resolvedSilenceTimeoutMs(talk) == TalkDefaults.silenceTimeoutMs)
    }
}
