// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "menuvium-ar-worker",
    platforms: [.macOS(.v12)],
    products: [
        .executable(name: "menuvium-ar-worker", targets: ["ARWorker"]),
    ],
    targets: [
        .executableTarget(
            name: "ARWorker",
            path: "Sources/ARWorker"
        ),
    ]
)

