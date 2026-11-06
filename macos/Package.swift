// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "LearningHelper",
    platforms: [.macOS(.v14)],
    products: [
        .library(name: "HelperCore", targets: ["HelperCore"]),
        .executable(name: "LearningHelper", targets: ["HelperApp"])
    ],
    targets: [
        .target(name: "HelperCore", resources: [.process("Resources")]),
        .executableTarget(name: "HelperApp", dependencies: ["HelperCore"]),
        .testTarget(name: "HelperCoreTests", dependencies: ["HelperCore"])
    ],
    swiftLanguageModes: [.v5]
)
