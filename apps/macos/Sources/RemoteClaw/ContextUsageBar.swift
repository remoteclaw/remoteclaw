import SwiftUI

struct ContextUsageBar: View {
    let usedTokens: Int

    var body: some View {
        Text(SessionTokenStats.formatKTokens(self.usedTokens) + " used")
            .font(.caption.monospacedDigit())
            .foregroundStyle(.secondary)
            .accessibilityLabel("Context usage")
            .accessibilityValue("\(self.usedTokens) tokens used")
    }
}
