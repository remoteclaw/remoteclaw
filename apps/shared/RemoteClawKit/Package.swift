// swift-tools-version: 6.2

import PackageDescription

let package = Package(
    name: "RemoteClawKit",
    platforms: [
        .iOS(.v18),
        .macOS(.v15),
    ],
    products: [
        .library(name: "RemoteClawProtocol", targets: ["RemoteClawProtocol"]),
        .library(name: "RemoteClawKit", targets: ["RemoteClawKit"]),
        .library(name: "RemoteClawChatUI", targets: ["RemoteClawChatUI"]),
    ],
    dependencies: [
        .package(url: "https://github.com/steipete/ElevenLabsKit", exact: "0.1.0"),
        .package(url: "https://github.com/gonzalezreal/textual", exact: "0.3.1"),
    ],
    targets: [
        .target(
            name: "RemoteClawProtocol",
            path: "Sources/RemoteClawProtocol",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .target(
            name: "RemoteClawKit",
            dependencies: [
                "RemoteClawProtocol",
                .product(name: "ElevenLabsKit", package: "ElevenLabsKit"),
            ],
            path: "Sources/RemoteClawKit",
            resources: [
                .process("Resources"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .target(
            name: "RemoteClawChatUI",
            dependencies: [
                "RemoteClawKit",
                .product(
                    name: "Textual",
                    package: "textual",
                    condition: .when(platforms: [.macOS, .iOS])),
            ],
            path: "Sources/RemoteClawChatUI",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .testTarget(
            name: "RemoteClawKitTests",
            dependencies: ["RemoteClawKit", "RemoteClawChatUI"],
            path: "Tests/RemoteClawKitTests",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
                .enableExperimentalFeature("SwiftTesting"),
            ]),
    ])
