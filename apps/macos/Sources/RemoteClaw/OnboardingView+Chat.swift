import Foundation

extension OnboardingView {
    func maybeKickoffOnboardingChat(for pageIndex: Int) {
        guard pageIndex == self.onboardingChatPageIndex else { return }
        guard self.showOnboardingChat else { return }
        guard !self.didAutoKickoff else { return }
        self.didAutoKickoff = true

        Task { @MainActor in
            for _ in 0..<20 {
                if !self.onboardingChatModel.isLoading { break }
                try? await Task.sleep(nanoseconds: 200_000_000)
            }
            guard self.onboardingChatModel.messages.isEmpty else { return }
            let kickoff =
                "Hi! I just installed RemoteClaw and you’re my brand‑new agent. " +
                "Please help me set up my agent identity — ask one question at a time " +
                "to fill in IDENTITY.md and USER.md. Then visit SOUL.md with me: " +
                "ask what matters to me and how you should be. Finally, guide me through " +
                "choosing how we should talk (web‑only, WhatsApp, or Telegram)."
            self.onboardingChatModel.input = kickoff
            self.onboardingChatModel.send()
        }
    }
}
