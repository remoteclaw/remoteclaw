// swift-tools-version: 6.2
// Package manifest for the RemoteClaw macOS companion (menu bar app + IPC library).

import PackageDescription

let package = Package(
    name: "RemoteClaw",
    platforms: [
        .macOS(.v15),
    ],
    products: [
        .library(name: "RemoteClawIPC", targets: ["RemoteClawIPC"]),
        .library(name: "RemoteClawDiscovery", targets: ["RemoteClawDiscovery"]),
        .executable(name: "RemoteClaw", targets: ["RemoteClaw"]),
        .executable(name: "remoteclaw-mac", targets: ["RemoteClawMacCLI"]),
    ],
    dependencies: [
        .package(url: "https://github.com/orchetect/MenuBarExtraAccess", exact: "1.2.2"),
        .package(url: "https://github.com/swiftlang/swift-subprocess.git", from: "0.1.0"),
        .package(url: "https://github.com/apple/swift-log.git", from: "1.8.0"),
        .package(url: "https://github.com/sparkle-project/Sparkle", from: "2.8.1"),
        .package(url: "https://github.com/steipete/Peekaboo.git", branch: "main"),
        .package(path: "../shared/RemoteClawKit"),
        .package(path: "../../Swabble"),
    ],
    targets: [
        .target(
            name: "RemoteClawIPC",
            dependencies: [],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .target(
            name: "RemoteClawDiscovery",
            dependencies: [
                .product(name: "RemoteClawKit", package: "RemoteClawKit"),
            ],
            path: "Sources/RemoteClawDiscovery",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .executableTarget(
            name: "RemoteClaw",
            dependencies: [
                "RemoteClawIPC",
                "RemoteClawDiscovery",
                .product(name: "RemoteClawKit", package: "RemoteClawKit"),
                .product(name: "RemoteClawChatUI", package: "RemoteClawKit"),
                .product(name: "RemoteClawProtocol", package: "RemoteClawKit"),
                .product(name: "SwabbleKit", package: "swabble"),
                .product(name: "MenuBarExtraAccess", package: "MenuBarExtraAccess"),
                .product(name: "Subprocess", package: "swift-subprocess"),
                .product(name: "Logging", package: "swift-log"),
                .product(name: "Sparkle", package: "Sparkle"),
                .product(name: "PeekabooBridge", package: "Peekaboo"),
                .product(name: "PeekabooAutomationKit", package: "Peekaboo"),
            ],
            exclude: [
                "Resources/Info.plist",
            ],
            resources: [
                .copy("Resources/RemoteClaw.icns"),
                .copy("Resources/DeviceModels"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .executableTarget(
            name: "RemoteClawMacCLI",
            dependencies: [
                "RemoteClawDiscovery",
                .product(name: "RemoteClawKit", package: "RemoteClawKit"),
                .product(name: "RemoteClawProtocol", package: "RemoteClawKit"),
            ],
            path: "Sources/RemoteClawMacCLI",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .testTarget(
            name: "RemoteClawIPCTests",
            dependencies: [
                "RemoteClawIPC",
                "RemoteClaw",
                "RemoteClawDiscovery",
                .product(name: "RemoteClawProtocol", package: "RemoteClawKit"),
                .product(name: "SwabbleKit", package: "swabble"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
                .enableExperimentalFeature("SwiftTesting"),
            ]),
    ])
