import Testing
@testable import RemoteClaw

@MainActor
@Suite struct TalkModeConfigParsingTests {
    @Test func prefersNormalizedTalkProviderPayload() {
        let talk: [String: Any] = [
            "provider": "elevenlabs",
            "providers": [
                "elevenlabs": [
                    "voiceId": "voice-normalized",
                ],
            ],
            "voiceId": "voice-legacy",
        ]

        let selection = TalkModeManager.selectTalkProviderConfig(talk)
        #expect(selection?.provider == "elevenlabs")
        #expect(selection?.config["voiceId"] as? String == "voice-normalized")
    }

    @Test func ignoresLegacyTalkFieldsWhenNormalizedPayloadMissing() {
        let talk: [String: Any] = [
            "voiceId": "voice-legacy",
            "apiKey": "legacy-key",
        ]

        let selection = TalkModeManager.selectTalkProviderConfig(talk)
        #expect(selection == nil)
    }

    @Test func readsConfiguredSilenceTimeoutMs() {
        let talk: [String: Any] = [
            "silenceTimeoutMs": 1500,
        ]

        #expect(TalkModeManager.resolvedSilenceTimeoutMs(talk) == 1500)
    }

    @Test func defaultsSilenceTimeoutMsWhenMissing() {
        #expect(TalkModeManager.resolvedSilenceTimeoutMs(nil) == 900)
    }

    @Test func defaultsSilenceTimeoutMsWhenInvalid() {
        let talk: [String: Any] = [
            "silenceTimeoutMs": 0,
        ]

        #expect(TalkModeManager.resolvedSilenceTimeoutMs(talk) == 900)
    }

    @Test func defaultsSilenceTimeoutMsWhenBool() {
        let talk: [String: Any] = [
            "silenceTimeoutMs": true,
        ]

        #expect(TalkModeManager.resolvedSilenceTimeoutMs(talk) == 900)
    }
}
