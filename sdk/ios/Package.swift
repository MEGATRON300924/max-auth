// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "MAXAuth",
    platforms: [.iOS(.v15)],
    products: [.library(name: "MAXAuth", targets: ["MaxAuth"])],
    targets: [.target(name: "MaxAuth")]
)
