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
    let frameStride: Int
    let frameJpegQ: Int
    let frameCrop: Double
    let frameWhiteBackground: Bool
    let framePreflightEnabled: Bool
    let framePreflightAdaptive: Bool
    let framePreflightMinFrames: Int
    let framePreflightMaxBlurMean: Double
    let framePreflightMinFeatureMean: Double
    let framePreflightHardMinFeatureMean: Double
    let framePreflightMinMotionMean: Double
    let photogrammetryDetail: String
    let photogrammetryMaxPolygons: Int
    let photogrammetryMaxTextureDimension: String
    let placeholderFallbackEnabled: Bool
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
            if config.placeholderFallbackEnabled {
                try ensureToolExists("usdzip")
            }
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
    var frameStride = 1
    var frameJpegQ = 2
    var frameCrop = 1.0
    var frameWhiteBackground = false
    var framePreflightEnabled = true
    var framePreflightAdaptive = true
    var framePreflightMinFrames = 24
    var framePreflightMaxBlurMean = 12.0
    var framePreflightMinFeatureMean = 0.35
    var framePreflightHardMinFeatureMean = 0.22
    var framePreflightMinMotionMean = 0.80
    var photogrammetryDetail = "full"
    var photogrammetryMaxPolygons = 500_000
    var photogrammetryMaxTextureDimension = "fourK"
    var placeholderFallbackEnabled = true

    func parseCrop(_ raw: String) -> Double? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "%", with: "")
        guard let value = Double(trimmed) else { return nil }
        let normalized = value > 1 ? value / 100.0 : value
        guard normalized.isFinite else { return nil }
        return min(1.0, max(0.5, normalized))
    }

    func parseBool(_ raw: String) -> Bool? {
        switch raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "1", "true", "yes", "on":
            return true
        case "0", "false", "no", "off":
            return false
        default:
            return nil
        }
    }

    func parsePositiveInt(_ raw: String) -> Int? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let value = Int(trimmed), value > 0 else { return nil }
        return value
    }

    func parseNonNegativeDouble(_ raw: String) -> Double? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let value = Double(trimmed), value.isFinite, value >= 0 else { return nil }
        return value
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
    if let whiteBgEnv = ProcessInfo.processInfo.environment["MENUVIUM_AR_WHITE_BG"], let parsed = parseBool(whiteBgEnv) {
        frameWhiteBackground = parsed
    }
    if let frameStrideEnv = ProcessInfo.processInfo.environment["MENUVIUM_AR_FRAME_STRIDE"], let parsed = parsePositiveInt(frameStrideEnv) {
        frameStride = parsed
    }
    if let preflightEnv = ProcessInfo.processInfo.environment["MENUVIUM_AR_PREFLIGHT"], let parsed = parseBool(preflightEnv) {
        framePreflightEnabled = parsed
    }
    if let preflightAdaptiveEnv = ProcessInfo.processInfo.environment["MENUVIUM_AR_PREFLIGHT_ADAPTIVE"], let parsed = parseBool(preflightAdaptiveEnv) {
        framePreflightAdaptive = parsed
    }
    if let preflightMinFramesEnv = ProcessInfo.processInfo.environment["MENUVIUM_AR_PREFLIGHT_MIN_FRAMES"], let parsed = parsePositiveInt(preflightMinFramesEnv) {
        framePreflightMinFrames = parsed
    }
    if let preflightMaxBlurEnv = ProcessInfo.processInfo.environment["MENUVIUM_AR_PREFLIGHT_MAX_BLUR"], let parsed = parseNonNegativeDouble(preflightMaxBlurEnv) {
        framePreflightMaxBlurMean = parsed
    }
    if let preflightMinFeatureEnv = ProcessInfo.processInfo.environment["MENUVIUM_AR_PREFLIGHT_MIN_FEATURE"], let parsed = parseNonNegativeDouble(preflightMinFeatureEnv) {
        framePreflightMinFeatureMean = parsed
    }
    if let preflightHardMinFeatureEnv = ProcessInfo.processInfo.environment["MENUVIUM_AR_PREFLIGHT_HARD_MIN_FEATURE"], let parsed = parseNonNegativeDouble(preflightHardMinFeatureEnv) {
        framePreflightHardMinFeatureMean = parsed
    }
    if let preflightMinMotionEnv = ProcessInfo.processInfo.environment["MENUVIUM_AR_PREFLIGHT_MIN_MOTION"], let parsed = parseNonNegativeDouble(preflightMinMotionEnv) {
        framePreflightMinMotionMean = parsed
    }
    if let placeholderFallbackEnv = ProcessInfo.processInfo.environment["MENUVIUM_AR_PLACEHOLDER_FALLBACK"], let parsed = parseBool(placeholderFallbackEnv) {
        placeholderFallbackEnabled = parsed
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
        case "--frame-stride":
            frameStride = Int(try nextValue()) ?? frameStride
        case "--jpeg-q":
            frameJpegQ = Int(try nextValue()) ?? frameJpegQ
        case "--crop":
            if let parsed = parseCrop(try nextValue()) {
                frameCrop = parsed
            }
        case "--white-bg":
            frameWhiteBackground = true
        case "--no-white-bg":
            frameWhiteBackground = false
        case "--preflight":
            framePreflightEnabled = true
        case "--skip-preflight":
            framePreflightEnabled = false
        case "--preflight-adaptive":
            framePreflightAdaptive = true
        case "--no-preflight-adaptive":
            framePreflightAdaptive = false
        case "--preflight-min-frames":
            if let parsed = parsePositiveInt(try nextValue()) {
                framePreflightMinFrames = parsed
            }
        case "--preflight-max-blur":
            if let parsed = parseNonNegativeDouble(try nextValue()) {
                framePreflightMaxBlurMean = parsed
            }
        case "--preflight-min-feature":
            if let parsed = parseNonNegativeDouble(try nextValue()) {
                framePreflightMinFeatureMean = parsed
            }
        case "--preflight-hard-min-feature":
            if let parsed = parseNonNegativeDouble(try nextValue()) {
                framePreflightHardMinFeatureMean = parsed
            }
        case "--preflight-min-motion":
            if let parsed = parseNonNegativeDouble(try nextValue()) {
                framePreflightMinMotionMean = parsed
            }
        case "--detail":
            photogrammetryDetail = try nextValue()
        case "--max-polygons":
            photogrammetryMaxPolygons = Int(try nextValue()) ?? photogrammetryMaxPolygons
        case "--max-texture-dim":
            photogrammetryMaxTextureDimension = try nextValue()
        case "--placeholder-fallback":
            placeholderFallbackEnabled = true
        case "--no-placeholder-fallback":
            placeholderFallbackEnabled = false
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
    let clampedPreflightMinFeatureMean = max(0.0, framePreflightMinFeatureMean)
    let clampedPreflightHardMinFeatureMean = max(0.0, min(clampedPreflightMinFeatureMean, framePreflightHardMinFeatureMean))
    return Config(
        apiBase: normalizedApiBase,
        workerToken: tokenRaw,
        pollSeconds: pollSeconds,
        frameFps: max(1, frameFps),
        frameStride: max(1, frameStride),
        frameJpegQ: max(1, min(31, frameJpegQ)),
        frameCrop: frameCrop,
        frameWhiteBackground: frameWhiteBackground,
        framePreflightEnabled: framePreflightEnabled,
        framePreflightAdaptive: framePreflightAdaptive,
        framePreflightMinFrames: max(1, framePreflightMinFrames),
        framePreflightMaxBlurMean: max(0.0, framePreflightMaxBlurMean),
        framePreflightMinFeatureMean: clampedPreflightMinFeatureMean,
        framePreflightHardMinFeatureMean: clampedPreflightHardMinFeatureMean,
        framePreflightMinMotionMean: max(0.0, framePreflightMinMotionMean),
        photogrammetryDetail: photogrammetryDetail,
        photogrammetryMaxPolygons: max(1, photogrammetryMaxPolygons),
        photogrammetryMaxTextureDimension: photogrammetryMaxTextureDimension,
        placeholderFallbackEnabled: placeholderFallbackEnabled
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
    let cropFilter = buildTurntableBoxCropFilter(cropFactor: cropFactor)
    let frameSelectFilter = "select='not(mod(n\\,\(config.frameStride)))'"
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

    let framesVf = ([ "fps=\(config.frameFps)", cropFilter, frameSelectFilter ].compactMap { $0 }).joined(separator: ",")
    try runProcess(
        "ffmpeg",
        args: [
            "-nostdin",
            "-y",
            "-i",
            videoFile.path,
            "-vf",
            framesVf,
            "-vsync",
            "vfr",
            "-q:v",
            String(config.frameJpegQ),
            framesDir.appendingPathComponent("frame-%04d.jpg").path,
        ]
    )

    let frameCount = countFrames(in: framesDir)
    if config.framePreflightEnabled, frameCount > 0 {
        await tryUpdateProgress(
            itemId: claim.item_id,
            jobId: claim.job_id,
            stage: "extracting_frames",
            detail: "Preflight frame quality check",
            progress: 0.18,
            config: config
        )
        let preflight = try runFramePreflight(framesDir: framesDir, frameCount: frameCount, config: config)
        let metrics = preflight.metrics
        let detail: String
        if preflight.warnings.isEmpty {
            detail = String(
                format: "Preflight ok (blur %.2f, feature %.3f, motion %.2f)",
                metrics.blurMean,
                metrics.edgeMean,
                metrics.motionMean
            )
        } else {
            detail = String(
                format: "Preflight warning: %@; blur %.2f, feature %.3f, motion %.2f",
                preflight.warnings.joined(separator: "; "),
                metrics.blurMean,
                metrics.edgeMean,
                metrics.motionMean
            )
        }
        await tryUpdateProgress(
            itemId: claim.item_id,
            jobId: claim.job_id,
            stage: "extracting_frames",
            detail: detail,
            progress: 0.20,
            config: config
        )
    }

    var photogrammetryFramesDir = framesDir
    if config.frameWhiteBackground, frameCount > 0 {
        await tryUpdateProgress(
            itemId: claim.item_id,
            jobId: claim.job_id,
            stage: "extracting_frames",
            detail: "Normalizing background to white",
            progress: 0.21,
            config: config
        )

        let whiteFramesDir = tempDir.appendingPathComponent("frames-white", isDirectory: true)
        try whitenFrameBackgroundToWhite(
            inputFramesDir: framesDir,
            outputFramesDir: whiteFramesDir,
            frameCount: frameCount,
            frameJpegQ: config.frameJpegQ
        )
        photogrammetryFramesDir = whiteFramesDir
    }

    let effectiveFrameCount = countFrames(in: photogrammetryFramesDir)
    let preprocessingSuffix = config.frameWhiteBackground ? ", white-bg" : ""
    await tryUpdateProgress(
        itemId: claim.item_id,
        jobId: claim.job_id,
        stage: "photogrammetry",
        detail: "Starting photogrammetry (\(effectiveFrameCount) frames\(preprocessingSuffix))",
        progress: 0.22,
        config: config
    )

    let outputsDir = tempDir.appendingPathComponent("outputs", isDirectory: true)
    try FileManager.default.createDirectory(at: outputsDir, withIntermediateDirectories: true)

    let modelUsdz = outputsDir.appendingPathComponent("model.usdz")
    var photogrammetryPrefix = "Photogrammetry"
    func runPhotogrammetryPass(allowDetailFallback: Bool) async throws {
        try await runPhotogrammetry(
            framesDir: photogrammetryFramesDir,
            usdzOut: modelUsdz,
            detail: config.photogrammetryDetail,
            customMaxPolygons: config.photogrammetryMaxPolygons,
            customMaxTextureDimension: config.photogrammetryMaxTextureDimension,
            allowDetailFallback: allowDetailFallback,
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
    }

    do {
        try await runPhotogrammetryPass(allowDetailFallback: false)
    } catch {
        var qualityFirstError: Error? = error

        if let currentError = qualityFirstError, !config.frameWhiteBackground, frameCount > 0, isAlignmentFailure(currentError) {
            await tryUpdateProgress(
                itemId: claim.item_id,
                jobId: claim.job_id,
                stage: "photogrammetry",
                detail: "Alignment rescue: retrying with white background normalization",
                progress: 0.22,
                config: config
            )
            let rescueFramesDir = tempDir.appendingPathComponent("frames-white-rescue", isDirectory: true)
            try whitenFrameBackgroundToWhite(
                inputFramesDir: framesDir,
                outputFramesDir: rescueFramesDir,
                frameCount: frameCount,
                frameJpegQ: config.frameJpegQ
            )
            photogrammetryFramesDir = rescueFramesDir
            let rescueFrameCount = countFrames(in: photogrammetryFramesDir)
            await tryUpdateProgress(
                itemId: claim.item_id,
                jobId: claim.job_id,
                stage: "photogrammetry",
                detail: "Retrying photogrammetry (\(rescueFrameCount) frames, white-bg rescue)",
                progress: 0.22,
                config: config
            )

            do {
                try await runPhotogrammetryPass(allowDetailFallback: false)
                qualityFirstError = nil
            } catch {
                qualityFirstError = error
            }
        }

        if let currentError = qualityFirstError, frameCount > 0, isAlignmentFailure(currentError) {
            let enhancedFramesDir = tempDir.appendingPathComponent("frames-enhanced-rescue", isDirectory: true)
            let enhancementInputDir = photogrammetryFramesDir
            let enhancementInputFrameCount = countFrames(in: enhancementInputDir)

            await tryUpdateProgress(
                itemId: claim.item_id,
                jobId: claim.job_id,
                stage: "photogrammetry",
                detail: "Alignment rescue: retrying with deterministic frame enhancement",
                progress: 0.22,
                config: config
            )
            try enhanceFramesForAlignment(
                inputFramesDir: enhancementInputDir,
                outputFramesDir: enhancedFramesDir,
                frameCount: max(1, enhancementInputFrameCount),
                frameJpegQ: config.frameJpegQ
            )
            photogrammetryFramesDir = enhancedFramesDir
            let enhancedFrameCount = countFrames(in: photogrammetryFramesDir)
            await tryUpdateProgress(
                itemId: claim.item_id,
                jobId: claim.job_id,
                stage: "photogrammetry",
                detail: "Retrying photogrammetry (\(enhancedFrameCount) frames, enhancement rescue)",
                progress: 0.22,
                config: config
            )

            do {
                try await runPhotogrammetryPass(allowDetailFallback: false)
                qualityFirstError = nil
            } catch {
                qualityFirstError = error
            }
        }

        if let unresolvedQualityFirstError = qualityFirstError {
            await tryUpdateProgress(
                itemId: claim.item_id,
                jobId: claim.job_id,
                stage: "photogrammetry",
                detail: "High-quality attempts failed; enabling detail fallback",
                progress: 0.22,
                config: config
            )
            do {
                try await runPhotogrammetryPass(allowDetailFallback: true)
            } catch {
                let photogrammetryFailure = WorkerError.processing(
                    "Photogrammetry quality-first and fallback attempts failed: quality-first=\(String(describing: unresolvedQualityFirstError)) | fallback=\(String(describing: error))"
                )

                if config.placeholderFallbackEnabled {
                    await tryUpdateProgress(
                        itemId: claim.item_id,
                        jobId: claim.job_id,
                        stage: "photogrammetry",
                        detail: "Photogrammetry failed; generating placeholder AR model",
                        progress: 0.22,
                        config: config
                    )
                    do {
                        try generatePlaceholderUsdz(usdzOut: modelUsdz, posterFile: posterFile)
                    } catch {
                        throw WorkerError.processing(
                            "Photogrammetry failed and placeholder fallback failed: original=\(String(describing: photogrammetryFailure)) | placeholder=\(String(describing: error))"
                        )
                    }
                } else {
                    throw photogrammetryFailure
                }
            }
        }
    }

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

func countFrames(in dir: URL) -> Int {
    guard let files = try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil) else {
        return 0
    }
    return files.filter { $0.pathExtension.lowercased() == "jpg" || $0.pathExtension.lowercased() == "jpeg" }.count
}

func buildTurntableBoxCropFilter(cropFactor: Double) -> String? {
    if cropFactor >= 0.999 {
        return nil
    }

    // Turntable-in-box captures have static ceiling/background regions that
    // can dominate alignment. Bias the crop lower to keep the rotating subject.
    let widthFactor = min(1.0, max(0.60, cropFactor))
    let heightFactor = min(0.80, max(0.48, widthFactor * 0.76))
    let yOffsetFactor = max(0.0, min(1.0 - heightFactor, 0.28))
    return String(
        format: "crop=in_w*%.4f:in_h*%.4f:(in_w-out_w)/2:in_h*%.4f",
        widthFactor,
        heightFactor,
        yOffsetFactor
    )
}

struct FramePreflightMetrics {
    let frameCount: Int
    let sampledFrames: Int
    let blurMean: Double
    let edgeMean: Double
    let motionMean: Double
}

struct FramePreflightResult {
    let metrics: FramePreflightMetrics
    let warnings: [String]
}

func runFramePreflight(framesDir: URL, frameCount: Int, config: Config) throws -> FramePreflightResult {
    if frameCount < config.framePreflightMinFrames {
        throw WorkerError.processing(
            "Preflight failed: too few extracted frames (\(frameCount)). Capture a longer/slower turntable rotation to produce at least \(config.framePreflightMinFrames) frames"
        )
    }

    let sampleStep = max(1, frameCount / config.framePreflightMinFrames)

    let blurValues = try collectFrameMetric(
        framesDir: framesDir,
        sampleStep: sampleStep,
        filterChain: "blurdetect=block_pct=80:block_width=32:block_height=32",
        metricPattern: #"lavfi\.blur=([0-9]+(?:\.[0-9]+)?)"#
    )
    let edgeValues = try collectFrameMetric(
        framesDir: framesDir,
        sampleStep: sampleStep,
        filterChain: "edgedetect=low=0.08:high=0.2,signalstats",
        metricPattern: #"lavfi\.signalstats\.YAVG=([0-9]+(?:\.[0-9]+)?)"#
    )
    let motionValues = try collectFrameMetric(
        framesDir: framesDir,
        sampleStep: sampleStep,
        filterChain: "tblend=all_mode=difference,signalstats",
        metricPattern: #"lavfi\.signalstats\.YAVG=([0-9]+(?:\.[0-9]+)?)"#
    )

    guard let blurMean = mean(blurValues), let edgeMean = mean(edgeValues), let motionMean = mean(motionValues) else {
        throw WorkerError.processing("Preflight failed: unable to compute frame quality metrics")
    }

    var failures: [String] = []
    var warnings: [String] = []
    if blurMean > config.framePreflightMaxBlurMean {
        failures.append(String(format: "frames appear blurry (blurMean %.2f > %.2f)", blurMean, config.framePreflightMaxBlurMean))
    }
    if config.framePreflightAdaptive {
        if edgeMean < config.framePreflightHardMinFeatureMean {
            failures.append(String(format: "insufficient trackable features (featureMean %.3f < %.3f)", edgeMean, config.framePreflightHardMinFeatureMean))
        } else if edgeMean < config.framePreflightMinFeatureMean {
            warnings.append(String(format: "low trackable features (featureMean %.3f < %.3f); continuing in adaptive mode", edgeMean, config.framePreflightMinFeatureMean))
        }
    } else if edgeMean < config.framePreflightMinFeatureMean {
        failures.append(String(format: "insufficient trackable features (featureMean %.3f < %.3f)", edgeMean, config.framePreflightMinFeatureMean))
    }
    if motionMean < config.framePreflightMinMotionMean {
        failures.append(String(format: "insufficient viewpoint/parallax change (motionMean %.2f < %.2f)", motionMean, config.framePreflightMinMotionMean))
    }

    if !failures.isEmpty {
        let summary = String(
            format: "metrics blur=%.2f feature=%.3f motion=%.2f samples=%d",
            blurMean,
            edgeMean,
            motionMean,
            min(blurValues.count, min(edgeValues.count, motionValues.count))
        )
        throw WorkerError.processing("Preflight failed: \(failures.joined(separator: "; ")); \(summary)")
    }

    return FramePreflightResult(
        metrics: FramePreflightMetrics(
            frameCount: frameCount,
            sampledFrames: min(blurValues.count, min(edgeValues.count, motionValues.count)),
            blurMean: blurMean,
            edgeMean: edgeMean,
            motionMean: motionMean
        ),
        warnings: warnings
    )
}

func collectFrameMetric(
    framesDir: URL,
    sampleStep: Int,
    filterChain: String,
    metricPattern: String
) throws -> [Double] {
    let vf = "select='not(mod(n\\,\(sampleStep)))',\(filterChain),metadata=mode=print"
    let output = try runProcess(
        "ffmpeg",
        args: [
            "-nostdin",
            "-hide_banner",
            "-nostats",
            "-v",
            "info",
            "-framerate",
            "30",
            "-start_number",
            "1",
            "-i",
            framesDir.appendingPathComponent("frame-%04d.jpg").path,
            "-vf",
            vf,
            "-an",
            "-f",
            "null",
            "-",
        ]
    )

    let regex = try NSRegularExpression(pattern: metricPattern)
    let nsrange = NSRange(output.startIndex..<output.endIndex, in: output)
    var values: [Double] = []
    for match in regex.matches(in: output, range: nsrange) {
        guard match.numberOfRanges > 1,
            let valueRange = Range(match.range(at: 1), in: output),
            let value = Double(output[valueRange])
        else {
            continue
        }
        values.append(value)
    }
    return values
}

func mean(_ values: [Double]) -> Double? {
    guard !values.isEmpty else { return nil }
    return values.reduce(0.0, +) / Double(values.count)
}

func whitenFrameBackgroundToWhite(
    inputFramesDir: URL,
    outputFramesDir: URL,
    frameCount: Int,
    frameJpegQ: Int
) throws {
    guard frameCount > 0 else { return }

    try? FileManager.default.removeItem(at: outputFramesDir)
    try FileManager.default.createDirectory(at: outputFramesDir, withIntermediateDirectories: true)

    let filterComplex = "[0:v]format=rgba,colorkey=0xECECEC:0.34:0.08,lumakey=0.14:0.10:0.02[fg];color=c=white:s=16x16[bg];[bg][fg]scale2ref[bg2][fg2];[bg2][fg2]overlay=shortest=1:format=auto,format=yuvj420p[v]"

    try runProcess(
        "ffmpeg",
        args: [
            "-nostdin",
            "-y",
            "-framerate",
            "30",
            "-start_number",
            "1",
            "-i",
            inputFramesDir.appendingPathComponent("frame-%04d.jpg").path,
            "-filter_complex",
            filterComplex,
            "-map",
            "[v]",
            "-frames:v",
            String(frameCount),
            "-r",
            "30",
            "-q:v",
            String(frameJpegQ),
            outputFramesDir.appendingPathComponent("frame-%04d.jpg").path,
        ]
    )

    let outputCount = countFrames(in: outputFramesDir)
    if outputCount == 0 {
        throw WorkerError.processing("Background whitening produced no frames")
    }
}

func enhanceFramesForAlignment(
    inputFramesDir: URL,
    outputFramesDir: URL,
    frameCount: Int,
    frameJpegQ: Int
) throws {
    guard frameCount > 0 else { return }

    try? FileManager.default.removeItem(at: outputFramesDir)
    try FileManager.default.createDirectory(at: outputFramesDir, withIntermediateDirectories: true)

    // Deterministic, conservative enhancement to improve edge/feature detectability
    // without hallucinating frame-specific details that can hurt alignment.
    let enhancementFilter = "hqdn3d=0.8:0.8:3:3,eq=contrast=1.05:brightness=0.01:saturation=1.02,unsharp=5:5:0.7:3:3:0.0"

    try runProcess(
        "ffmpeg",
        args: [
            "-nostdin",
            "-y",
            "-framerate",
            "30",
            "-start_number",
            "1",
            "-i",
            inputFramesDir.appendingPathComponent("frame-%04d.jpg").path,
            "-vf",
            enhancementFilter,
            "-frames:v",
            String(frameCount),
            "-r",
            "30",
            "-q:v",
            String(frameJpegQ),
            outputFramesDir.appendingPathComponent("frame-%04d.jpg").path,
        ]
    )

    let outputCount = countFrames(in: outputFramesDir)
    if outputCount == 0 {
        throw WorkerError.processing("Frame enhancement produced no frames")
    }
}

func generatePlaceholderUsdz(usdzOut: URL, posterFile: URL) throws {
    let packageDir = usdzOut.deletingLastPathComponent()
    let fallbackDir = packageDir.appendingPathComponent("placeholder-usdz", isDirectory: true)
    try? FileManager.default.removeItem(at: fallbackDir)
    try FileManager.default.createDirectory(at: fallbackDir, withIntermediateDirectories: true)

    let packagedPoster = fallbackDir.appendingPathComponent("poster.jpg")
    try? FileManager.default.removeItem(at: packagedPoster)
    try FileManager.default.copyItem(at: posterFile, to: packagedPoster)

    let usdaFile = fallbackDir.appendingPathComponent("fallback.usda")
    let usda = """
    #usda 1.0
    (
        defaultPrim = "Root"
        metersPerUnit = 1
        upAxis = "Y"
    )

    def Xform "Root"
    {
        def Mesh "FallbackPlane" (
            prepend apiSchemas = ["MaterialBindingAPI"]
        )
        {
            bool doubleSided = true
            int[] faceVertexCounts = [4]
            int[] faceVertexIndices = [0, 1, 2, 3]
            point3f[] points = [(-0.06, 0, -0.06), (0.06, 0, -0.06), (0.06, 0, 0.06), (-0.06, 0, 0.06)]
            texCoord2f[] primvars:st = [(0, 0), (1, 0), (1, 1), (0, 1)] (
                interpolation = "vertex"
            )
            rel material:binding = </Root/Looks/PreviewMaterial>
            uniform token subdivisionScheme = "none"
        }

        def Scope "Looks"
        {
            def Material "PreviewMaterial"
            {
                token outputs:surface.connect = </Root/Looks/PreviewMaterial/PBRShader.outputs:surface>

                def Shader "PBRShader"
                {
                    uniform token info:id = "UsdPreviewSurface"
                    color3f inputs:diffuseColor.connect = </Root/Looks/PreviewMaterial/DiffuseTexture.outputs:rgb>
                    float inputs:roughness = 0.85
                    float inputs:metallic = 0.0
                    token outputs:surface
                }

                def Shader "DiffuseTexture"
                {
                    uniform token info:id = "UsdUVTexture"
                    asset inputs:file = @poster.jpg@
                    token inputs:sourceColorSpace = "sRGB"
                    float2 inputs:st.connect = </Root/Looks/PreviewMaterial/PrimvarReader_st.outputs:result>
                    float3 outputs:rgb
                }

                def Shader "PrimvarReader_st"
                {
                    uniform token info:id = "UsdPrimvarReader_float2"
                    token inputs:varname = "st"
                    float2 outputs:result
                }
            }
        }
    }
    """
    try usda.write(to: usdaFile, atomically: true, encoding: .utf8)

    try? FileManager.default.removeItem(at: usdzOut)
    _ = try runProcess("usdzip", args: [usdzOut.path, usdaFile.path, packagedPoster.path])

    let attrs = try FileManager.default.attributesOfItem(atPath: usdzOut.path)
    let size = (attrs[.size] as? NSNumber)?.int64Value ?? 0
    if size <= 0 {
        throw WorkerError.processing("Placeholder USDZ generation produced an empty file")
    }
}

func runPhotogrammetry(
    framesDir: URL,
    usdzOut: URL,
    detail: String,
    customMaxPolygons: Int,
    customMaxTextureDimension: String,
    allowDetailFallback: Bool,
    status: @escaping (String) async -> Void,
    progress: @escaping (Double) async -> Void
) async throws {
    #if canImport(RealityKit)
    if #available(macOS 12.0, *) {
        if #available(macOS 13.0, *), !PhotogrammetrySession.isSupported {
            throw WorkerError.processing("Photogrammetry is not supported on this Mac (requires supported Apple Object Capture hardware/runtime)")
        }

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
        if !allowDetailFallback {
            detailFallbackChain = [requestedDetail]
        } else if #available(macOS 14.0, *), requestedDetail == .custom {
            detailFallbackChain = [.custom, .full, .medium, .reduced]
        } else if requestedDetail == .raw {
            detailFallbackChain = [.raw, .full, .medium, .reduced]
        } else if requestedDetail == .full {
            detailFallbackChain = [.full, .medium, .reduced]
        } else if requestedDetail == .medium {
            detailFallbackChain = [.medium, .reduced]
        } else if requestedDetail == .reduced {
            detailFallbackChain = [.reduced, .preview]
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
                    label: "Photogrammetry HQ Masked Unordered (\(detailLabel(primaryDetail))\(specLabel))",
                    sampleOrdering: .unordered,
                    featureSensitivity: .high,
                    objectMaskingEnabled: true,
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
                    label: "Photogrammetry HQ Unordered (\(detailLabel(primaryDetail))\(specLabel))",
                    sampleOrdering: .unordered,
                    featureSensitivity: .high,
                    objectMaskingEnabled: false,
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
                let formatted: String
                if let workerError = error as? WorkerError {
                    formatted = String(describing: workerError)
                } else {
                    formatted = formatError(error)
                }
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
    var lastProcessingStage: String?
    var invalidSampleCount = 0
    var skippedSampleCount = 0
    var invalidSampleExamples: [String] = []
    var sawAutomaticDownsampling = false

    for try await output in session.outputs {
        if #available(macOS 14.0, *) {
            if case .requestProgressInfo(_, let info) = output {
                if let stage = info.processingStage {
                    switch stage {
                    case .preProcessing:
                        lastProcessingStage = "preProcessing"
                    case .imageAlignment:
                        lastProcessingStage = "imageAlignment"
                    case .pointCloudGeneration:
                        lastProcessingStage = "pointCloudGeneration"
                    case .meshGeneration:
                        lastProcessingStage = "meshGeneration"
                    case .textureMapping:
                        lastProcessingStage = "textureMapping"
                    case .optimization:
                        lastProcessingStage = "optimization"
                    @unknown default:
                        lastProcessingStage = "unknown"
                    }
                }
                continue
            }
        }

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
            var context: [String] = []
            if let stage = lastProcessingStage {
                context.append("stage=\(stage)")
            }
            if invalidSampleCount > 0 {
                context.append("invalidSamples=\(invalidSampleCount)")
            }
            if skippedSampleCount > 0 {
                context.append("skippedSamples=\(skippedSampleCount)")
            }
            if sawAutomaticDownsampling {
                context.append("automaticDownsampling=true")
            }
            if !invalidSampleExamples.isEmpty {
                context.append("invalidSampleExamples=\(invalidSampleExamples.joined(separator: "; "))")
            }

            let nsError = error as NSError
            if nsError.domain == "CoreOC.PhotogrammetrySession.Error", nsError.code == 6 {
                context.append(
                    "hint=Object Capture failed during alignment. Try more texture/feature detail, more viewpoint variation, and cleaner background separation"
                )
            }

            let contextSuffix = context.isEmpty ? "" : " [\(context.joined(separator: ", "))]"
            throw WorkerError.processing("Photogrammetry request error: \(formatError(error))\(contextSuffix)")
        case .processingComplete:
            break
        case .invalidSample(let id, let reason):
            invalidSampleCount += 1
            if invalidSampleExamples.count < 5 {
                invalidSampleExamples.append("#\(id): \(reason)")
            }
        case .skippedSample:
            skippedSampleCount += 1
        case .automaticDownsampling:
            sawAutomaticDownsampling = true
        default:
            break
        }
    }

    throw WorkerError.processing("Photogrammetry session ended unexpectedly")
}
#endif

func isAlignmentFailure(_ error: Error) -> Bool {
    let text = String(describing: error).lowercased()
    if text.contains("stage=imagealignment") {
        return true
    }
    if text.contains("coreoc.photogrammetrysession.error code 6") {
        return true
    }
    if text.contains("failed during alignment") {
        return true
    }
    return false
}

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
