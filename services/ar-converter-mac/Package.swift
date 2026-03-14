// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "menuvium-ar-converter",
    platforms: [.macOS(.v12)],
    products: [
        .executable(name: "menuvium-ar-converter", targets: ["ARConverter"]),
    ],
    targets: [
        .executableTarget(
            name: "ARConverter",
            path: "Sources/ARConverter"
        ),
    ]
)
