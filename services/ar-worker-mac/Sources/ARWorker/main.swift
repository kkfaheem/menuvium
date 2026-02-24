import Foundation
import ModelIO

#if canImport(RealityKit)
import RealityKit
#endif

struct Config {
    let apiBase: String
    let workerToken: String
    let pollSeconds: UInt64
    let frameFps: Int
    let frameJpegQ: Int
    let frameCrop: Double
    let photogrammetryDetail: String
    let photogrammetryMaxPolygons: Int
    let photogrammetryMaxTextureDimension: String
}

struct WorkerClaimResponse: Decodable {
    let item_id: String
    let job_id: String
    let video_s3_key: String
    let video_download_url: String
}

struct PresignedUrlResponse: Decodable {
    let upload_url: String
    let s3_key: String
    let public_url: String
}

struct WorkerUploadUrlRequest: Encodable {
    let item_id: String
    let kind: String
    let filename: String
    let content_type: String
}

struct WorkerCompleteRequest: Encodable {
    let job_id: String
    let model_glb_s3_key: String
    let model_glb_url: String
    let model_usdz_s3_key: String
    let model_usdz_url: String
    let poster_s3_key: String?
    let poster_url: String?
}

struct WorkerFailRequest: Encodable {
    let job_id: String
    let error: String
}

struct WorkerProgressRequest: Encodable {
    let job_id: String
    let stage: String?
    let detail: String?
    let progress: Double?
}

enum WorkerError: Error, CustomStringConvertible {
    case invalidConfig(String)
    case httpError(Int, String)
    case missingTool(String)
    case processing(String)

    var description: String {
        switch self {
        case .invalidConfig(let message):
            return message
        case .httpError(let status, let body):
            return "HTTP \(status): \(body)"
        case .missingTool(let tool):
            return "Missing required tool in PATH: \(tool)"
        case .processing(let message):
            return message
        }
    }
}

@main
enum ARWorkerMain {
    static func main() async {
        do {
            let config = try parseConfig()
            try ensureToolExists("ffmpeg")
            try ensureToolExists("npx")
            try ensureToolExists("usdextract")
            try await runLoop(config: config)
        } catch {
            fputs("menuvium-ar-worker error: \(error)\n", stderr)
            exit(1)
        }
    }
}

func parseConfig() throws -> Config {
    let args = CommandLine.arguments.dropFirst()
    var apiBase = ProcessInfo.processInfo.environment["MENUVIUM_API_BASE"]
    var workerToken = ProcessInfo.processInfo.environment["MENUVIUM_WORKER_TOKEN"]
    var pollSeconds: UInt64 = 5
    var frameFps = 6
    var frameJpegQ = 2
    var frameCrop = 1.0
    var photogrammetryDetail = "full"
    var photogrammetryMaxPolygons = 500_000
    var photogrammetryMaxTextureDimension = "fourK"

    func parseCrop(_ raw: String) -> Double? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "%", with: "")
        guard let value = Double(trimmed) else { return nil }
        let normalized = value > 1 ? value / 100.0 : value
        guard normalized.isFinite else { return nil }
        return min(1.0, max(0.5, normalized))
    }

    func applyQualityPreset(_ preset: String) {
        switch preset.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "balanced":
            frameFps = 4
            frameJpegQ = 3
            photogrammetryDetail = "medium"
            photogrammetryMaxPolygons = 250_000
            photogrammetryMaxTextureDimension = "twoK"
        case "high":
            frameFps = 6
            frameJpegQ = 2
            photogrammetryDetail = "full"
            photogrammetryMaxPolygons = 500_000
            photogrammetryMaxTextureDimension = "fourK"
        case "ultra":
            frameFps = 6
            frameJpegQ = 1
            photogrammetryDetail = "ultra"
            photogrammetryMaxPolygons = 1_000_000
            photogrammetryMaxTextureDimension = "eightK"
        default:
            break
        }
    }

    if let cropEnv = ProcessInfo.processInfo.environment["MENUVIUM_AR_CROP"], let parsed = parseCrop(cropEnv) {
        frameCrop = parsed
    }

    var index = args.startIndex
    while index < args.endIndex {
        let arg = args[index]
        func nextValue() throws -> String {
            let next = args.index(after: index)
            guard next < args.endIndex else { throw WorkerError.invalidConfig("Missing value for \(arg)") }
            index = next
            return String(args[index])
        }

        switch arg {
        case "--api-base":
            apiBase = try nextValue()
        case "--token":
            workerToken = try nextValue()
        case "--poll-seconds":
            pollSeconds = UInt64(try nextValue()) ?? pollSeconds
        case "--quality":
            applyQualityPreset(try nextValue())
        case "--fps":
            frameFps = Int(try nextValue()) ?? frameFps
        case "--jpeg-q":
            frameJpegQ = Int(try nextValue()) ?? frameJpegQ
        case "--crop":
            if let parsed = parseCrop(try nextValue()) {
                frameCrop = parsed
            }
        case "--detail":
            photogrammetryDetail = try nextValue()
        case "--max-polygons":
            photogrammetryMaxPolygons = Int(try nextValue()) ?? photogrammetryMaxPolygons
        case "--max-texture-dim":
            photogrammetryMaxTextureDimension = try nextValue()
        default:
            break
        }
        index = args.index(after: index)
    }

    guard let apiBaseRaw = apiBase?.trimmingCharacters(in: .whitespacesAndNewlines), !apiBaseRaw.isEmpty else {
        throw WorkerError.invalidConfig("Missing API base. Set MENUVIUM_API_BASE or pass --api-base")
    }
    guard let tokenRaw = workerToken?.trimmingCharacters(in: .whitespacesAndNewlines), !tokenRaw.isEmpty else {
        throw WorkerError.invalidConfig("Missing worker token. Set MENUVIUM_WORKER_TOKEN or pass --token")
    }

    let normalizedApiBase = apiBaseRaw.hasSuffix("/") ? String(apiBaseRaw.dropLast()) : apiBaseRaw
    return Config(
        apiBase: normalizedApiBase,
        workerToken: tokenRaw,
        pollSeconds: pollSeconds,
        frameFps: max(1, frameFps),
        frameJpegQ: max(1, min(31, frameJpegQ)),
        frameCrop: frameCrop,
        photogrammetryDetail: photogrammetryDetail,
        photogrammetryMaxPolygons: max(1, photogrammetryMaxPolygons),
        photogrammetryMaxTextureDimension: photogrammetryMaxTextureDimension
    )
}

func ensureToolExists(_ tool: String) throws {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
    process.arguments = ["which", tool]
    let pipe = Pipe()
    process.standardOutput = pipe
    process.standardError = Pipe()
    try process.run()
    process.waitUntilExit()
    if process.terminationStatus != 0 {
        throw WorkerError.missingTool(tool)
    }
}

func runLoop(config: Config) async throws {
    while true {
        if let claim = try await claimJob(config: config) {
            do {
                try await processJob(claim: claim, config: config)
            } catch {
                try await failJob(itemId: claim.item_id, jobId: claim.job_id, error: String(describing: error), config: config)
            }
        } else {
            try await Task.sleep(nanoseconds: config.pollSeconds * 1_000_000_000)
        }
    }
}

func claimJob(config: Config) async throws -> WorkerClaimResponse? {
    let url = URL(string: "\(config.apiBase)/ar-jobs/claim")!
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue(config.workerToken, forHTTPHeaderField: "X-Worker-Token")
    request.setValue("application/json", forHTTPHeaderField: "Accept")

    let (data, response) = try await URLSession.shared.data(for: request)
    guard let http = response as? HTTPURLResponse else { throw WorkerError.processing("Invalid response") }
    if http.statusCode == 204 {
        return nil
    }
    if http.statusCode < 200 || http.statusCode >= 300 {
        throw WorkerError.httpError(http.statusCode, String(data: data, encoding: .utf8) ?? "")
    }
    return try JSONDecoder().decode(WorkerClaimResponse.self, from: data)
}

func processJob(claim: WorkerClaimResponse, config: Config) async throws {
    let tempDir = FileManager.default.temporaryDirectory
        .appendingPathComponent("menuvium-ar-\(claim.job_id)", isDirectory: true)
    try? FileManager.default.removeItem(at: tempDir)
    try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)

    let videoFile = tempDir.appendingPathComponent("input-video")
    let framesDir = tempDir.appendingPathComponent("frames", isDirectory: true)
    try FileManager.default.createDirectory(at: framesDir, withIntermediateDirectories: true)

    await tryUpdateProgress(
        itemId: claim.item_id,
        jobId: claim.job_id,
        stage: "downloading",
        detail: "Downloading video",
        progress: 0.05,
        config: config
    )
    let downloadUrl = absoluteUrl(claim.video_download_url, apiBase: config.apiBase)
    try await downloadFile(from: downloadUrl, to: videoFile)

    await tryUpdateProgress(
        itemId: claim.item_id,
        jobId: claim.job_id,
        stage: "extracting_frames",
        detail: "Extracting poster + frames",
        progress: 0.12,
        config: config
    )
    let posterFile = tempDir.appendingPathComponent("poster.jpg")
    let cropFactor = min(1.0, max(0.5, config.frameCrop))
    let cropFactorString = String(format: "%.4f", cropFactor)
    let cropFilter = cropFactor < 0.999
        ? "crop=in_w*\(cropFactorString):in_h*\(cropFactorString):(in_w-out_w)/2:(in_h-out_h)/2"
        : nil
    let posterVf = ([ "select=eq(n\\,0)", cropFilter ].compactMap { $0 }).joined(separator: ",")
    try runProcess(
        "ffmpeg",
        args: [
            "-nostdin",
            "-y",
            "-i",
            videoFile.path,
            "-vf",
            posterVf,
            "-q:v",
            String(config.frameJpegQ),
            posterFile.path,
        ]
    )

    let framesVf = ([ "fps=\(config.frameFps)", cropFilter ].compactMap { $0 }).joined(separator: ",")
    try runProcess(
        "ffmpeg",
        args: [
            "-nostdin",
            "-y",
            "-i",
            videoFile.path,
            "-vf",
            framesVf,
            "-q:v",
            String(config.frameJpegQ),
            framesDir.appendingPathComponent("frame-%04d.jpg").path,
        ]
    )

    let frameCount = (try? FileManager.default.contentsOfDirectory(at: framesDir, includingPropertiesForKeys: nil).count) ?? 0
    await tryUpdateProgress(
        itemId: claim.item_id,
        jobId: claim.job_id,
        stage: "photogrammetry",
        detail: "Starting photogrammetry (\(frameCount) frames)",
        progress: 0.22,
        config: config
    )

    let outputsDir = tempDir.appendingPathComponent("outputs", isDirectory: true)
    try FileManager.default.createDirectory(at: outputsDir, withIntermediateDirectories: true)

    let modelUsdz = outputsDir.appendingPathComponent("model.usdz")
    var photogrammetryPrefix = "Photogrammetry"
    try await runPhotogrammetry(
        framesDir: framesDir,
        usdzOut: modelUsdz,
        detail: config.photogrammetryDetail,
        customMaxPolygons: config.photogrammetryMaxPolygons,
        customMaxTextureDimension: config.photogrammetryMaxTextureDimension,
        status: { message in
            photogrammetryPrefix = message
            await tryUpdateProgress(
                itemId: claim.item_id,
                jobId: claim.job_id,
                stage: "photogrammetry",
                detail: message,
                progress: nil,
                config: config
            )
        },
        progress: { fraction in
            let clamped = max(0.0, min(1.0, fraction))
            let overall = 0.22 + (clamped * 0.58)
            let stagePercent = Int((clamped * 100).rounded())
            await tryUpdateProgress(
                itemId: claim.item_id,
                jobId: claim.job_id,
                stage: "photogrammetry",
                detail: "\(photogrammetryPrefix) \(stagePercent)%",
                progress: overall,
                config: config
            )
        }
    )

    let modelGlb = outputsDir.appendingPathComponent("model.glb")
    await tryUpdateProgress(
        itemId: claim.item_id,
        jobId: claim.job_id,
        stage: "converting",
        detail: "Converting USDZ → GLB",
        progress: 0.84,
        config: config
    )

    let convertDir = tempDir.appendingPathComponent("convert", isDirectory: true)
    try FileManager.default.createDirectory(at: convertDir, withIntermediateDirectories: true)

    await tryUpdateProgress(
        itemId: claim.item_id,
        jobId: claim.job_id,
        stage: "converting",
        detail: "Exporting USDZ → OBJ",
        progress: 0.85,
        config: config
    )
    let modelObj = convertDir.appendingPathComponent("model.obj")
    try exportUsdzToObj(usdzUrl: modelUsdz, objUrl: modelObj)

    await tryUpdateProgress(
        itemId: claim.item_id,
        jobId: claim.job_id,
        stage: "converting",
        detail: "Extracting textures",
        progress: 0.86,
        config: config
    )
    _ = try runProcess("usdextract", args: ["-o", convertDir.path, modelUsdz.path])

    await tryUpdateProgress(
        itemId: claim.item_id,
        jobId: claim.job_id,
        stage: "converting",
        detail: "Fixing texture paths",
        progress: 0.87,
        config: config
    )
    try prepareMtlForObj2Gltf(mtlUrl: convertDir.appendingPathComponent("model.mtl"))

    await tryUpdateProgress(
        itemId: claim.item_id,
        jobId: claim.job_id,
        stage: "converting",
        detail: "Converting OBJ → GLB",
        progress: 0.88,
        config: config
    )
    try runProcess(
        "npx",
        args: [
            "--yes",
            "obj2gltf",
            "-i",
            modelObj.path,
            "-o",
            modelGlb.path,
            "--binary",
            "--metallicRoughness",
            "--packOcclusion",
        ]
    )

    await tryUpdateProgress(
        itemId: claim.item_id,
        jobId: claim.job_id,
        stage: "uploading",
        detail: "Uploading models",
        progress: 0.9,
        config: config
    )
    let glbUpload = try await getUploadUrl(itemId: claim.item_id, kind: "model_glb", filename: "model.glb", contentType: "model/gltf-binary", config: config)
    try await uploadFile(fileUrl: modelGlb, uploadUrl: glbUpload.upload_url, contentType: "model/gltf-binary")
    await tryUpdateProgress(itemId: claim.item_id, jobId: claim.job_id, stage: "uploading", detail: "Uploaded GLB", progress: 0.93, config: config)

    let usdzUpload = try await getUploadUrl(itemId: claim.item_id, kind: "model_usdz", filename: "model.usdz", contentType: "model/vnd.usdz+zip", config: config)
    try await uploadFile(fileUrl: modelUsdz, uploadUrl: usdzUpload.upload_url, contentType: "model/vnd.usdz+zip")
    await tryUpdateProgress(itemId: claim.item_id, jobId: claim.job_id, stage: "uploading", detail: "Uploaded USDZ", progress: 0.96, config: config)

    let posterUpload = try await getUploadUrl(itemId: claim.item_id, kind: "poster", filename: "poster.jpg", contentType: "image/jpeg", config: config)
    try await uploadFile(fileUrl: posterFile, uploadUrl: posterUpload.upload_url, contentType: "image/jpeg")
    await tryUpdateProgress(itemId: claim.item_id, jobId: claim.job_id, stage: "finalizing", detail: "Finalizing", progress: 0.99, config: config)

    try await completeJob(
        itemId: claim.item_id,
        payload: WorkerCompleteRequest(
            job_id: claim.job_id,
            model_glb_s3_key: glbUpload.s3_key,
            model_glb_url: glbUpload.public_url,
            model_usdz_s3_key: usdzUpload.s3_key,
            model_usdz_url: usdzUpload.public_url,
            poster_s3_key: posterUpload.s3_key,
            poster_url: posterUpload.public_url
        ),
        config: config
    )
}

func runPhotogrammetry(
    framesDir: URL,
    usdzOut: URL,
    detail: String,
    customMaxPolygons: Int,
    customMaxTextureDimension: String,
    status: @escaping (String) async -> Void,
    progress: @escaping (Double) async -> Void
) async throws {
    #if canImport(RealityKit)
    if #available(macOS 12.0, *) {
        struct PhotogrammetryAttempt {
            let label: String
            let sampleOrdering: PhotogrammetrySession.Configuration.SampleOrdering
            let featureSensitivity: PhotogrammetrySession.Configuration.FeatureSensitivity
            let objectMaskingEnabled: Bool
            let detail: PhotogrammetrySession.Request.Detail
            let customMaxPolygons: Int?
            let customMaxTextureDimension: String?
        }

        func detailLabel(_ detail: PhotogrammetrySession.Request.Detail) -> String {
            if detail == .preview {
                return "preview"
            }
            if detail == .reduced {
                return "reduced"
            }
            if detail == .medium {
                return "medium"
            }
            if detail == .full {
                return "full"
            }
            if detail == .raw {
                return "raw"
            }
            if #available(macOS 14.0, *), detail == .custom {
                return "custom"
            }
            return "unknown"
        }

        let requestedDetailPreset = detail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let requestedDetail: PhotogrammetrySession.Request.Detail
        var useCustomSpec = false
        switch requestedDetailPreset {
        case "preview":
            requestedDetail = .preview
        case "reduced":
            requestedDetail = .reduced
        case "medium":
            requestedDetail = .medium
        case "raw":
            requestedDetail = .raw
        case "custom":
            if #available(macOS 14.0, *) {
                requestedDetail = .custom
                useCustomSpec = true
            } else {
                requestedDetail = .full
            }
        case "ultra":
            if #available(macOS 14.0, *) {
                requestedDetail = .custom
                useCustomSpec = true
            } else {
                requestedDetail = .raw
            }
        case "full":
            fallthrough
        default:
            requestedDetail = .full
        }

        let customPolygonCount = max(1, customMaxPolygons)

        let detailFallbackChain: [PhotogrammetrySession.Request.Detail]
        if #available(macOS 14.0, *), requestedDetail == .custom {
            detailFallbackChain = [.custom, .full, .medium, .reduced]
        } else if requestedDetail == .raw {
            detailFallbackChain = [.raw, .full, .medium, .reduced]
        } else if requestedDetail == .full {
            detailFallbackChain = [.full, .medium, .reduced]
        } else if requestedDetail == .medium {
            detailFallbackChain = [.medium, .reduced]
        } else if requestedDetail == .reduced {
            detailFallbackChain = [.reduced, .preview]
        } else if requestedDetail == .preview {
            detailFallbackChain = [.preview]
        } else if requestedDetail == .raw {
            detailFallbackChain = [requestedDetail]
        } else if #available(macOS 14.0, *), requestedDetail == .custom {
            detailFallbackChain = [requestedDetail]
        } else {
            detailFallbackChain = [requestedDetail]
        }

        var attempts: [PhotogrammetryAttempt] = []
        if let primaryDetail = detailFallbackChain.first {
            let specLabel = useCustomSpec ? " \(customMaxTextureDimension) tex/\(customPolygonCount) poly" : ""
            attempts.append(
                PhotogrammetryAttempt(
                    label: "Photogrammetry HQ Masked (\(detailLabel(primaryDetail))\(specLabel))",
                    sampleOrdering: .sequential,
                    featureSensitivity: .high,
                    objectMaskingEnabled: true,
                    detail: primaryDetail,
                    customMaxPolygons: useCustomSpec ? customPolygonCount : nil,
                    customMaxTextureDimension: useCustomSpec ? customMaxTextureDimension : nil
                )
            )
            attempts.append(
                PhotogrammetryAttempt(
                    label: "Photogrammetry HQ (\(detailLabel(primaryDetail))\(specLabel))",
                    sampleOrdering: .sequential,
                    featureSensitivity: .high,
                    objectMaskingEnabled: false,
                    detail: primaryDetail,
                    customMaxPolygons: useCustomSpec ? customPolygonCount : nil,
                    customMaxTextureDimension: useCustomSpec ? customMaxTextureDimension : nil
                )
            )
            attempts.append(
                PhotogrammetryAttempt(
                    label: "Photogrammetry Safe Masked (\(detailLabel(primaryDetail))\(specLabel))",
                    sampleOrdering: .unordered,
                    featureSensitivity: .normal,
                    objectMaskingEnabled: true,
                    detail: primaryDetail,
                    customMaxPolygons: useCustomSpec ? customPolygonCount : nil,
                    customMaxTextureDimension: useCustomSpec ? customMaxTextureDimension : nil
                )
            )
            attempts.append(
                PhotogrammetryAttempt(
                    label: "Photogrammetry Safe (\(detailLabel(primaryDetail))\(specLabel))",
                    sampleOrdering: .unordered,
                    featureSensitivity: .normal,
                    objectMaskingEnabled: false,
                    detail: primaryDetail,
                    customMaxPolygons: useCustomSpec ? customPolygonCount : nil,
                    customMaxTextureDimension: useCustomSpec ? customMaxTextureDimension : nil
                )
            )
        }
        for fallbackDetail in detailFallbackChain.dropFirst() {
            attempts.append(
                PhotogrammetryAttempt(
                    label: "Photogrammetry Safe Masked (\(detailLabel(fallbackDetail)))",
                    sampleOrdering: .unordered,
                    featureSensitivity: .normal,
                    objectMaskingEnabled: true,
                    detail: fallbackDetail,
                    customMaxPolygons: nil,
                    customMaxTextureDimension: nil
                )
            )
            attempts.append(
                PhotogrammetryAttempt(
                    label: "Photogrammetry Safe (\(detailLabel(fallbackDetail)))",
                    sampleOrdering: .unordered,
                    featureSensitivity: .normal,
                    objectMaskingEnabled: false,
                    detail: fallbackDetail,
                    customMaxPolygons: nil,
                    customMaxTextureDimension: nil
                )
            )
        }

        if attempts.isEmpty {
            throw WorkerError.processing("Photogrammetry has no attempts to run")
        }

        var failures: [String] = []
        for (index, attempt) in attempts.enumerated() {
            let attemptNumber = index + 1
            let attemptLabel = "\(attempt.label) (attempt \(attemptNumber)/\(attempts.count))"
            await status(attemptLabel)

            try? FileManager.default.removeItem(at: usdzOut)

            do {
                try await runPhotogrammetryAttempt(
                    framesDir: framesDir,
                    usdzOut: usdzOut,
                    sampleOrdering: attempt.sampleOrdering,
                    featureSensitivity: attempt.featureSensitivity,
                    objectMaskingEnabled: attempt.objectMaskingEnabled,
                    detail: attempt.detail,
                    customMaxPolygons: attempt.customMaxPolygons,
                    customMaxTextureDimension: attempt.customMaxTextureDimension,
                    progress: progress
                )
                return
            } catch {
                let formatted = formatError(error)
                let message = "\(attempt.label): \(formatted)"
                failures.append(message)
                fputs("menuvium-ar-worker photogrammetry failed (\(attemptNumber)/\(attempts.count)): \(message)\n", stderr)

                if attemptNumber < attempts.count {
                    await status("Photogrammetry retrying (attempt \(attemptNumber + 1)/\(attempts.count))")
                }
            }
        }

        let joined = failures.joined(separator: " | ")
        throw WorkerError.processing("Photogrammetry failed after \(attempts.count) attempts: \(joined)")
    } else {
        throw WorkerError.processing("Photogrammetry requires macOS 12+")
    }
    #else
    throw WorkerError.processing("RealityKit is not available on this platform")
    #endif
}

#if canImport(RealityKit)
@available(macOS 12.0, *)
func runPhotogrammetryAttempt(
    framesDir: URL,
    usdzOut: URL,
    sampleOrdering: PhotogrammetrySession.Configuration.SampleOrdering,
    featureSensitivity: PhotogrammetrySession.Configuration.FeatureSensitivity,
    objectMaskingEnabled: Bool,
    detail: PhotogrammetrySession.Request.Detail,
    customMaxPolygons: Int?,
    customMaxTextureDimension: String?,
    progress: @escaping (Double) async -> Void
) async throws {
    var configuration = PhotogrammetrySession.Configuration()
    configuration.sampleOrdering = sampleOrdering
    configuration.featureSensitivity = featureSensitivity
    configuration.isObjectMaskingEnabled = objectMaskingEnabled
    if #available(macOS 14.0, *), let maxPolygons = customMaxPolygons, let rawTextureDim = customMaxTextureDimension {
        let normalized = rawTextureDim.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let textureDim: PhotogrammetrySession.Configuration.CustomDetailSpecification.TextureDimension?
        switch normalized {
        case "1k", "1024", "onek", "one_k", "one-k":
            textureDim = .oneK
        case "2k", "2048", "twok", "two_k", "two-k":
            textureDim = .twoK
        case "4k", "4096", "fourk", "four_k", "four-k":
            textureDim = .fourK
        case "8k", "8192", "eightk", "eight_k", "eight-k":
            textureDim = .eightK
        default:
            textureDim = nil
        }

        if let maxTexture = textureDim {
            configuration.customDetailSpecification.maximumPolygonCount = UInt(maxPolygons)
            configuration.customDetailSpecification.maximumTextureDimension = maxTexture
            configuration.customDetailSpecification.outputTextureMaps = .all
            configuration.customDetailSpecification.textureFormat = .png
        }
    }

    let session = try PhotogrammetrySession(input: framesDir, configuration: configuration)
    var didComplete = false
    defer {
        if !didComplete {
            session.cancel()
        }
    }

    let usdzRequest = PhotogrammetrySession.Request.modelFile(url: usdzOut, detail: detail)
    try session.process(requests: [usdzRequest])

    var lastProgressReported = -1.0
    for try await output in session.outputs {
        switch output {
        case .requestProgress(_, let fractionComplete):
            let fraction = max(0.0, min(1.0, Double(fractionComplete)))
            if fraction - lastProgressReported >= 0.03 {
                lastProgressReported = fraction
                await progress(fraction)
            }
        case .requestComplete(_, _):
            didComplete = true
            return
        case .requestError(_, let error):
            throw error
        case .processingComplete:
            break
        default:
            break
        }
    }

    throw WorkerError.processing("Photogrammetry session ended unexpectedly")
}
#endif

func formatError(_ error: Error) -> String {
    let nsError = error as NSError
    var message = String(describing: error)
    message += " (NSError \(nsError.domain) code \(nsError.code))"
    if let underlying = nsError.userInfo[NSUnderlyingErrorKey] as? Error {
        let underlyingNs = underlying as NSError
        message += " underlying=\(String(describing: underlying)) (NSError \(underlyingNs.domain) code \(underlyingNs.code))"
    }
    return message
}

func exportUsdzToObj(usdzUrl: URL, objUrl: URL) throws {
    let asset = MDLAsset(url: usdzUrl)
    do {
        try asset.export(to: objUrl)
    } catch {
        throw WorkerError.processing("Failed to export USDZ → OBJ: \(error)")
    }
}

func prepareMtlForObj2Gltf(mtlUrl: URL) throws {
    let contents = try String(contentsOf: mtlUrl, encoding: .utf8)

    // ModelIO sometimes writes texture paths like `map_Kd [0/texture.png]`. Obj2gltf doesn't handle this.
    let bracketRegex = try NSRegularExpression(pattern: #"[^\s]*\[([^\]]+)\]"#)
    let range = NSRange(contents.startIndex..<contents.endIndex, in: contents)
    let withoutBrackets = bracketRegex.stringByReplacingMatches(in: contents, range: range, withTemplate: "$1")

    // Rewrite ModelIO's custom PBR tokens to MTL fields that obj2gltf understands.
    //
    // We then run obj2gltf with `--metallicRoughness --packOcclusion` so:
    // - `map_Ns` is treated as roughness
    // - `map_Ka` is treated as occlusion and packed into the MR texture
    // - `map_Bump` is treated as a normal map
    var outputLines: [String] = []
    var currentMaterialHasNs = false
    var sawAnyMaterial = false

    func ensureNsIfNeeded() {
        if sawAnyMaterial, !currentMaterialHasNs {
            outputLines.append("Ns 1.0")
        }
        currentMaterialHasNs = false
    }

    for rawLine in withoutBrackets.split(whereSeparator: \.isNewline) {
        var line = String(rawLine)
        let trimmed = line.trimmingCharacters(in: .whitespaces)

        if trimmed.hasPrefix("newmtl ") {
            ensureNsIfNeeded()
            sawAnyMaterial = true
        } else if trimmed == "Kd 0.18 0.18 0.18" {
            line = "Kd 1.0 1.0 1.0"
        } else if trimmed == "Ks 0" {
            line = "Ks 0.0 0.0 0.0"
        } else if trimmed.hasPrefix("map_ao ") {
            line = line.replacingOccurrences(of: "map_ao", with: "map_Ka")
        } else if trimmed.hasPrefix("map_roughness ") {
            line = line.replacingOccurrences(of: "map_roughness", with: "map_Ns")
        } else if trimmed.hasPrefix("map_tangentSpaceNormal ") {
            line = line.replacingOccurrences(of: "map_tangentSpaceNormal", with: "map_Bump")
        }

        let normalizedLine = line.trimmingCharacters(in: .whitespaces)
        if normalizedLine.hasPrefix("Ns ") {
            currentMaterialHasNs = true
        }

        // Drop ModelIO-only lines that can confuse converters.
        if normalizedLine.hasPrefix("ao ")
            || normalizedLine.hasPrefix("metallic ")
            || normalizedLine.hasPrefix("specularTint ")
            || normalizedLine.hasPrefix("subsurface ")
            || normalizedLine.hasPrefix("anisotropicRotation ")
            || normalizedLine.hasPrefix("sheen ")
            || normalizedLine.hasPrefix("sheenTint ")
            || normalizedLine.hasPrefix("clearCoat ")
            || normalizedLine.hasPrefix("clearCoatGloss ")
        {
            continue
        }

        outputLines.append(line)
    }

    ensureNsIfNeeded()
    let normalized = outputLines.joined(separator: "\n") + "\n"
    try normalized.write(to: mtlUrl, atomically: true, encoding: .utf8)
}

func absoluteUrl(_ maybeRelative: String, apiBase: String) -> URL {
    if maybeRelative.hasPrefix("http://") || maybeRelative.hasPrefix("https://") {
        return URL(string: maybeRelative)!
    }
    let trimmed = maybeRelative.hasPrefix("/") ? String(maybeRelative.dropFirst()) : maybeRelative
    return URL(string: "\(apiBase)/\(trimmed)")!
}

func downloadFile(from url: URL, to destination: URL) async throws {
    let (data, response) = try await URLSession.shared.data(from: url)
    guard let http = response as? HTTPURLResponse, http.statusCode >= 200, http.statusCode < 300 else {
        throw WorkerError.processing("Failed to download video: \(url.absoluteString)")
    }
    try data.write(to: destination)
}

func getUploadUrl(itemId: String, kind: String, filename: String, contentType: String, config: Config) async throws -> PresignedUrlResponse {
    let url = URL(string: "\(config.apiBase)/ar-jobs/upload-url")!
    let payload = WorkerUploadUrlRequest(item_id: itemId, kind: kind, filename: filename, content_type: contentType)
    let requestData = try JSONEncoder().encode(payload)

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.httpBody = requestData
    request.setValue(config.workerToken, forHTTPHeaderField: "X-Worker-Token")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("application/json", forHTTPHeaderField: "Accept")

    let (data, response) = try await URLSession.shared.data(for: request)
    guard let http = response as? HTTPURLResponse else { throw WorkerError.processing("Invalid response") }
    if http.statusCode < 200 || http.statusCode >= 300 {
        throw WorkerError.httpError(http.statusCode, String(data: data, encoding: .utf8) ?? "")
    }
    return try JSONDecoder().decode(PresignedUrlResponse.self, from: data)
}

func uploadFile(fileUrl: URL, uploadUrl: String, contentType: String) async throws {
    let data = try Data(contentsOf: fileUrl)
    let url = URL(string: uploadUrl)!
    var request = URLRequest(url: url)
    request.httpMethod = "PUT"
    request.httpBody = data
    request.setValue(contentType, forHTTPHeaderField: "Content-Type")

    let (_, response) = try await URLSession.shared.data(for: request)
    guard let http = response as? HTTPURLResponse, http.statusCode >= 200, http.statusCode < 300 else {
        throw WorkerError.processing("Failed to upload \(fileUrl.lastPathComponent)")
    }
}

func completeJob(itemId: String, payload: WorkerCompleteRequest, config: Config) async throws {
    let url = URL(string: "\(config.apiBase)/ar-jobs/\(itemId)/complete")!
    let data = try JSONEncoder().encode(payload)

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.httpBody = data
    request.setValue(config.workerToken, forHTTPHeaderField: "X-Worker-Token")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")

    let (_, response) = try await URLSession.shared.data(for: request)
    guard let http = response as? HTTPURLResponse, http.statusCode >= 200, http.statusCode < 300 else {
        throw WorkerError.processing("Failed to mark job complete")
    }
}

func failJob(itemId: String, jobId: String, error: String, config: Config) async throws {
    let url = URL(string: "\(config.apiBase)/ar-jobs/\(itemId)/fail")!
    let payload = WorkerFailRequest(job_id: jobId, error: error)
    let data = try JSONEncoder().encode(payload)

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.httpBody = data
    request.setValue(config.workerToken, forHTTPHeaderField: "X-Worker-Token")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")

    _ = try await URLSession.shared.data(for: request)
}

func updateProgress(itemId: String, payload: WorkerProgressRequest, config: Config) async throws {
    let url = URL(string: "\(config.apiBase)/ar-jobs/\(itemId)/progress")!
    let data = try JSONEncoder().encode(payload)

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.httpBody = data
    request.setValue(config.workerToken, forHTTPHeaderField: "X-Worker-Token")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")

    let (_, response) = try await URLSession.shared.data(for: request)
    guard let http = response as? HTTPURLResponse, http.statusCode >= 200, http.statusCode < 300 else {
        throw WorkerError.processing("Failed to update progress")
    }
}

func tryUpdateProgress(
    itemId: String,
    jobId: String,
    stage: String?,
    detail: String?,
    progress: Double?,
    config: Config
) async {
    do {
        try await updateProgress(
            itemId: itemId,
            payload: WorkerProgressRequest(job_id: jobId, stage: stage, detail: detail, progress: progress),
            config: config
        )
    } catch {
        // Best-effort; progress reporting should not fail the job.
    }
}

@discardableResult
func runProcess(_ executable: String, args: [String]) throws -> String {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
    process.arguments = [executable] + args
    process.standardInput = FileHandle.nullDevice

    let stdout = Pipe()
    let stderr = Pipe()
    process.standardOutput = stdout
    process.standardError = stderr

    try process.run()
    process.waitUntilExit()

    let stdoutData = stdout.fileHandleForReading.readDataToEndOfFile()
    let stderrData = stderr.fileHandleForReading.readDataToEndOfFile()
    let output = (String(data: stdoutData, encoding: .utf8) ?? "") + (String(data: stderrData, encoding: .utf8) ?? "")

    if process.terminationStatus != 0 {
        throw WorkerError.processing("Command failed: \(executable) \(args.joined(separator: " "))\n\(output)")
    }
    return output
}
