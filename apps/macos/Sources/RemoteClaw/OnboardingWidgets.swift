import RemoteClawChatUI
import SwiftUI

/// Onboarding hero mascot with the remoteclaw.org hero treatment: the animated
/// mascot plus its coral silhouette glow (drop-shadow at ~10% of size).
struct GlowingRemoteClawIcon: View {
    @Environment(\.colorScheme) private var colorScheme

    let size: CGFloat

    init(size: CGFloat = 148) {
        self.size = size
    }

    var body: some View {
        RemoteClawMascotView()
            .frame(width: self.size, height: self.size)
            .shadow(
                color: RemoteClawMascotView.heroGlowColor(for: self.colorScheme),
                radius: self.size * 0.1)
    }
}
