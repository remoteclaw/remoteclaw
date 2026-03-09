import Foundation
import Testing
@testable import RemoteClaw

@Suite
struct AgentWorkspaceTests {
    @Test
    func displayPathUsesTildeForHome() {
        let home = FileManager().homeDirectoryForCurrentUser
        #expect(AgentWorkspace.displayPath(for: home) == "~")

        let inside = home.appendingPathComponent("Projects", isDirectory: true)
        #expect(AgentWorkspace.displayPath(for: inside).hasPrefix("~/"))
    }

    @Test
    func resolveWorkspaceURLExpandsTilde() {
        let url = AgentWorkspace.resolveWorkspaceURL(from: "~/tmp")
        #expect(url.path.hasSuffix("/tmp"))
    }

    @Test
    func agentsURLAppendsFilename() {
        let root = URL(fileURLWithPath: "/tmp/ws", isDirectory: true)
        let url = AgentWorkspace.agentsURL(workspaceURL: root)
        #expect(url.lastPathComponent == AgentWorkspace.agentsFilename)
    }

    @Test
    func bootstrapCreatesAgentsFileWhenMissing() throws {
        let tmp = FileManager().temporaryDirectory
            .appendingPathComponent("remoteclaw-ws-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager().removeItem(at: tmp) }

        let agentsURL = try AgentWorkspace.bootstrap(workspaceURL: tmp)
        #expect(FileManager().fileExists(atPath: agentsURL.path))

        let contents = try String(contentsOf: agentsURL, encoding: .utf8)
        #expect(contents.contains("# AGENTS.md"))

        let identityURL = tmp.appendingPathComponent(AgentWorkspace.identityFilename)
        let userURL = tmp.appendingPathComponent(AgentWorkspace.userFilename)
        #expect(FileManager().fileExists(atPath: identityURL.path))
        #expect(FileManager().fileExists(atPath: userURL.path))

        let second = try AgentWorkspace.bootstrap(workspaceURL: tmp)
        #expect(second == agentsURL)
    }

    @Test
    func bootstrapSafetyRejectsNonEmptyFolderWithoutAgents() throws {
        let tmp = FileManager().temporaryDirectory
            .appendingPathComponent("remoteclaw-ws-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager().removeItem(at: tmp) }
        try FileManager().createDirectory(at: tmp, withIntermediateDirectories: true)
        let marker = tmp.appendingPathComponent("notes.txt")
        try "hello".write(to: marker, atomically: true, encoding: .utf8)

        let result = AgentWorkspace.bootstrapSafety(for: tmp)
        #expect(result.unsafeReason != nil)
    }

    @Test
    func bootstrapSafetyAllowsExistingAgentsFile() throws {
        let tmp = FileManager().temporaryDirectory
            .appendingPathComponent("remoteclaw-ws-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager().removeItem(at: tmp) }
        try FileManager().createDirectory(at: tmp, withIntermediateDirectories: true)
        let agents = tmp.appendingPathComponent(AgentWorkspace.agentsFilename)
        try "# AGENTS.md".write(to: agents, atomically: true, encoding: .utf8)

        let result = AgentWorkspace.bootstrapSafety(for: tmp)
        #expect(result.unsafeReason == nil)
    }

    @Test
    func bootstrapDoesNotCreateBootstrapFile() throws {
        let tmp = FileManager().temporaryDirectory
            .appendingPathComponent("remoteclaw-ws-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager().removeItem(at: tmp) }

        _ = try AgentWorkspace.bootstrap(workspaceURL: tmp)

        let bootstrapURL = tmp.appendingPathComponent("BOOTSTRAP.md")
        #expect(!FileManager().fileExists(atPath: bootstrapURL.path))
    }

    @Test
    func needsBootstrapFalseWhenIdentityAlreadySet() throws {
        let tmp = FileManager().temporaryDirectory
            .appendingPathComponent("remoteclaw-ws-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager().removeItem(at: tmp) }
        try FileManager().createDirectory(at: tmp, withIntermediateDirectories: true)
        let identityURL = tmp.appendingPathComponent(AgentWorkspace.identityFilename)
        try """
        # IDENTITY.md - Agent Identity

        - Name: Clawd
        - Creature: Space Crab
        - Vibe: Helpful
        - Emoji: crab
        """.write(to: identityURL, atomically: true, encoding: .utf8)

        #expect(!AgentWorkspace.needsBootstrap(workspaceURL: tmp))
    }
}
