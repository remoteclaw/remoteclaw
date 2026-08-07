import RemoteClawKit
import SwiftUI

#if DEBUG
import Network
#endif

struct GatewayQuickSetupSheet: View {
    @Environment(NodeAppModel.self) private var appModel
    @Environment(GatewayConnectionController.self) private var gatewayController
    @Environment(\.dismiss) private var dismiss

    @AppStorage("onboarding.quickSetupDismissed") private var quickSetupDismissed: Bool = false
    @State private var connecting: Bool = false
    @State private var connectError: String?
    @State private var showGatewayProblemDetails: Bool = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    GatewayQuickSetupHeader(hasCandidate: self.bestCandidate != nil)

                    if let gatewayProblem = self.appModel.lastGatewayProblem {
                        GatewayProblemBanner(
                            problem: gatewayProblem,
                            primaryActionTitle: self.gatewayProblemPrimaryActionTitle(gatewayProblem),
                            onPrimaryAction: {
                                Task { await self.handleGatewayProblemPrimaryAction(gatewayProblem) }
                            },
                            onShowDetails: {
                                self.showGatewayProblemDetails = true
                            })
                    }

                    if let candidate = self.bestCandidate {
                        GatewayQuickSetupCandidatePanel(
                            name: candidate.name,
                            debugID: candidate.debugID,
                            tlsEnabled: candidate.tlsEnabled,
                            gatewayPort: candidate.gatewayPort,
                            discoveryStatusText: self.gatewayController.discoveryStatusText,
                            gatewayDisplayStatusText: self.appModel.gatewayDisplayStatusText,
                            nodeStatusText: self.appModel.nodeStatusText,
                            operatorStatusText: self.appModel.operatorStatusText)

                        Button {
                            self.connectError = nil
                            self.connecting = true
                            Task {
                                let err = await self.gatewayController.connectWithDiagnostics(candidate)
                                await MainActor.run {
                                    self.connecting = false
                                    self.connectError = err
                                }
                            }
                        } label: {
                            Group {
                                if self.connecting {
                                    HStack(spacing: 8) {
                                        ProgressView().progressViewStyle(.circular)
                                        Text("Connecting…")
                                            .font(RemoteClawType.subheadSemiBold)
                                    }
                                } else {
                                    Text("Connect to this Gateway")
                                        .font(RemoteClawType.subheadSemiBold)
                                }
                            }
                            .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(RemoteClawPrimaryActionButtonStyle())
                        .disabled(self.connecting)

                        if let connectError {
                            GatewayQuickSetupErrorView(message: connectError)
                        }

                        Button {
                            self.dismiss()
                        } label: {
                            Text("Not now")
                                .font(RemoteClawType.subheadSemiBold)
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(RemoteClawSecondaryActionButtonStyle())
                        .disabled(self.connecting)

                        self.fullRowToggle("Don't show this again", isOn: self.$quickSetupDismissed)
                            .padding(.top, 2)
                    } else {
                        GatewayQuickSetupEmptyState(
                            discoveryStatusText: self.gatewayController.discoveryStatusText)
                    }
                }
                .padding(20)
            }
            .background(RemoteClawBrand.activationCanvasGradient)
            .navigationTitle("Quick Setup")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        self.quickSetupDismissed = true
                        self.dismiss()
                    } label: {
                        Text("Close")
                            .font(RemoteClawType.subheadSemiBold)
                    }
                    .buttonStyle(RemoteClawCloseButtonStyle())
                }
            }
        }
        .sheet(isPresented: self.$showGatewayProblemDetails) {
            if let gatewayProblem = self.appModel.lastGatewayProblem {
                GatewayProblemDetailsSheet(
                    problem: gatewayProblem,
                    primaryActionTitle: self.gatewayProblemPrimaryActionTitle(gatewayProblem),
                    onPrimaryAction: {
                        Task { await self.handleGatewayProblemPrimaryAction(gatewayProblem) }
                    })
            }
        }
    }

    private var bestCandidate: GatewayDiscoveryModel.DiscoveredGateway? {
        self.gatewayController.gateways.first
    }

    private func fullRowToggle(_ title: LocalizedStringKey, isOn: Binding<Bool>) -> some View {
        Toggle(isOn: isOn) {
            Text(title)
                .font(RemoteClawType.subhead)
        }
        .contentShape(Rectangle())
        .overlay {
            Button {
                isOn.wrappedValue.toggle()
            } label: {
                Rectangle()
                    .fill(.clear)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHidden(true)
        }
    }

    private func gatewayProblemPrimaryActionTitle(_ problem: GatewayConnectionProblem) -> String? {
        GatewayProblemPrimaryAction.title(for: problem, retryTitle: "Connect")
    }

    private func handleGatewayProblemPrimaryAction(_ problem: GatewayConnectionProblem) async {
        if problem.canTrustRotatedCertificate {
            _ = await self.gatewayController.trustRotatedGatewayCertificate(from: problem)
            return
        }
        if GatewayProblemPrimaryAction.handleProtocolMismatchIfNeeded(problem) {
            return
        }
        guard problem.retryable else { return }
        guard let candidate = self.bestCandidate else { return }
        self.connectError = nil
        self.connecting = true
        let err = await self.gatewayController.connectWithDiagnostics(candidate)
        self.connecting = false
        self.connectError = err
    }
}

private struct GatewayQuickSetupHeader: View {
    let hasCandidate: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            ZStack(alignment: .bottomTrailing) {
                RemoteClawActivationGlyph(size: 70)
                    .shadow(color: RemoteClawBrand.activationGlow.opacity(0.18), radius: 10, x: 0, y: 5)

                Image(systemName: "antenna.radiowaves.left.and.right")
                    .font(RemoteClawType.caption2SemiBold)
                    .foregroundStyle(RemoteClawBrand.activationPrimaryActionText)
                    .frame(width: 28, height: 28)
                    .background {
                        Circle()
                            .fill(RemoteClawBrand.activationPrimaryGradient)
                    }
                    .overlay {
                        Circle()
                            .stroke(RemoteClawBrand.activationCanvas, lineWidth: 3)
                    }
                    .offset(x: 4, y: 4)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Connect a nearby Gateway")
                    .font(RemoteClawType.title2SemiBold)
                Text(self.subtitle)
                    .font(RemoteClawType.subhead)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var subtitle: LocalizedStringKey {
        if self.hasCandidate {
            return "RemoteClaw found a gateway on this network. Review it, then pair this iPhone as a secure node."
        }
        return "RemoteClaw is searching the local network and tailnet for a Gateway you can trust."
    }
}

private struct GatewayQuickSetupCandidatePanel: View {
    let name: String
    let debugID: String
    let tlsEnabled: Bool
    let gatewayPort: Int?
    let discoveryStatusText: String
    let gatewayDisplayStatusText: String
    let nodeStatusText: String
    let operatorStatusText: String

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "network")
                    .font(RemoteClawType.headline)
                    .foregroundStyle(RemoteClawBrand.activationPrimaryActionText)
                    .frame(width: 36, height: 36)
                    .background {
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(RemoteClawBrand.activationPrimaryGradient)
                    }
                    .shadow(color: RemoteClawBrand.activationGlow.opacity(0.18), radius: 6, x: 0, y: 3)

                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(verbatim: self.name)
                            .font(RemoteClawType.headline)
                            .foregroundStyle(.primary)
                            .lineLimit(1)
                            .truncationMode(.middle)

                        GatewayQuickSetupChip(text: self.tlsEnabled ? "Secure" : "Local")
                    }

                    Text(verbatim: self.endpointSummary)
                        .font(RemoteClawType.footnote)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
            }

            GatewayQuickSetupHairlineDivider()

            VStack(spacing: 8) {
                GatewayQuickSetupStatusRow(title: "Discovery", value: self.discoveryStatusText)
                GatewayQuickSetupStatusRow(title: "Gateway", value: self.gatewayDisplayStatusText)
                GatewayQuickSetupStatusRow(title: "Node", value: self.nodeStatusText)
                GatewayQuickSetupStatusRow(title: "Operator", value: self.operatorStatusText)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .textSelection(.enabled)
        .remoteClawCraftSurface(cornerRadius: 22)
        .accessibilityElement(children: .combine)
    }

    private var endpointSummary: String {
        let port = self.gatewayPort.map { ":\($0)" } ?? ""
        return "\(self.debugID)\(port)"
    }
}

private struct GatewayQuickSetupHairlineDivider: View {
    var body: some View {
        Rectangle()
            .fill(RemoteClawBrand.activationNeutralDivider)
            .frame(height: 0.5)
            .frame(maxWidth: .infinity)
    }
}

private struct GatewayQuickSetupChip: View {
    let text: LocalizedStringKey

    var body: some View {
        Text(self.text)
            .font(RemoteClawType.caption2SemiBold)
            .foregroundStyle(RemoteClawBrand.activationPrimaryAction)
            .padding(.vertical, 4)
            .padding(.horizontal, 8)
            .background {
                Capsule(style: .continuous)
                    .fill(RemoteClawBrand.activationGlow.opacity(0.10))
            }
            .overlay {
                Capsule(style: .continuous)
                    .stroke(RemoteClawBrand.activationHairline, lineWidth: 0.6)
            }
    }
}

private struct GatewayQuickSetupStatusRow: View {
    let title: LocalizedStringKey
    let value: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(self.title)
                .font(RemoteClawType.captionMedium)
                .foregroundStyle(.secondary)
                .frame(width: 70, alignment: .leading)
            Text(verbatim: self.value)
                .font(RemoteClawType.footnote)
                .foregroundStyle(.primary)
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

private struct GatewayQuickSetupErrorView: View {
    let message: String

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(RemoteClawBrand.warn)
                .padding(.top, 1)
            Text(self.message)
                .font(RemoteClawType.footnote)
                .foregroundStyle(.secondary)
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(RemoteClawBrand.activationInsetGradient)
        }
        .overlay {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(RemoteClawBrand.activationHairline, lineWidth: 0.7)
        }
    }
}

private struct GatewayQuickSetupEmptyState: View {
    let discoveryStatusText: String

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Image(systemName: "magnifyingglass")
                .font(RemoteClawType.title2SemiBold)
                .foregroundStyle(RemoteClawBrand.activationPrimaryAction)
                .frame(width: 42, height: 42)
                .background {
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(RemoteClawBrand.activationInsetGradient)
                }

            VStack(alignment: .leading, spacing: 6) {
                Text("Looking for a Gateway")
                    .font(RemoteClawType.headline)
                Text("Keep your iPhone on the same LAN or tailnet, then start the Gateway on your host machine.")
                    .font(RemoteClawType.subhead)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            VStack(alignment: .leading, spacing: 6) {
                GatewayQuickSetupInstructionRow(text: "Run remoteclaw gateway --port 18789.")
                GatewayQuickSetupInstructionRow(text: "Check that Bonjour discovery is enabled.")
                GatewayQuickSetupInstructionRow(text: "Open Settings if you need a manual host.")
            }
            .padding(.top, 2)

            Text(verbatim: "Discovery: \(self.discoveryStatusText)")
                .font(RemoteClawType.footnote)
                .foregroundStyle(.secondary)
                .textSelection(.enabled)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .remoteClawCraftSurface(cornerRadius: 22)
    }
}

private struct GatewayQuickSetupInstructionRow: View {
    let text: LocalizedStringKey

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: "arrow.right.circle.fill")
                .font(RemoteClawType.captionSemiBold)
                .foregroundStyle(.secondary)
            Text(self.text)
                .font(RemoteClawType.footnote)
                .foregroundStyle(.secondary)
        }
    }
}

#if DEBUG
#Preview("Quick setup gateway", traits: .fixedLayout(width: 393, height: 520)) {
    GatewayQuickSetupPreviewHost(hasGateway: true)
}

#Preview("Quick setup searching", traits: .fixedLayout(width: 393, height: 520)) {
    GatewayQuickSetupPreviewHost(hasGateway: false)
}

private struct GatewayQuickSetupPreviewHost: View {
    @State private var appModel: NodeAppModel
    @State private var gatewayController: GatewayConnectionController

    init(hasGateway: Bool) {
        let appModel = NodeAppModel()
        let controller = GatewayConnectionController(appModel: appModel, startDiscovery: false)
        if hasGateway {
            controller._test_setGateways([.previewGateway])
            appModel.gatewayStatusText = "Ready to pair"
        }
        _appModel = State(initialValue: appModel)
        _gatewayController = State(initialValue: controller)
    }

    var body: some View {
        GatewayQuickSetupSheet()
            .environment(self.appModel)
            .environment(self.gatewayController)
            .remoteClawSheetChrome()
    }
}

extension GatewayDiscoveryModel.DiscoveredGateway {
    fileprivate static let previewGateway = GatewayDiscoveryModel.DiscoveredGateway(
        name: "Studio Gateway",
        endpoint: .hostPort(
            host: .name("remoteclaw.local", nil),
            port: 18789),
        stableID: "preview-gateway",
        debugID: "remoteclaw.local",
        lanHost: "remoteclaw.local",
        tailnetDns: nil,
        gatewayPort: 18789,
        canvasPort: 18789,
        tlsEnabled: true,
        tlsFingerprintSha256: "preview",
        cliPath: "/opt/homebrew/bin/remoteclaw")
}
#endif
