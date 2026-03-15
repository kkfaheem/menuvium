import Foundation
import AVFoundation
import CoreImage
import ImageIO
import ModelIO
import SceneKit
import UniformTypeIdentifiers

struct Config {
    let apiBase: String
    let workerToken: String
    let kiriApiKey: String
    let pollSeconds: UInt64
}

struct GenerationPhotoScanOptions: Decodable {
    let modelQuality: Int
    let textureQuality: Int
    let textureSmoothing: Int
    let isMask: Int

    private enum CodingKeys: String, CodingKey {
        case modelQuality = "model_quality"
        case textureQuality = "texture_quality"
        case textureSmoothing = "texture_smoothing"
        case isMask = "is_mask"
    }
}

struct GenerationCaptureResponse: Decodable {
    let captureId: String
    let kind: String
    let position: Int
    let s3Key: String
    let downloadUrl: String

    private enum CodingKeys: String, CodingKey {
        case captureId = "capture_id"
        case kind
        case position
        case s3Key = "s3_key"
        case downloadUrl = "download_url"
    }
}

struct GenerationClaimResponse: Decodable {
    let jobId: String
    let itemId: String
    let captureMode: String
    let captureInputKind: String
    let captures: [GenerationCaptureResponse]
    let photoScanOptions: GenerationPhotoScanOptions

    private enum CodingKeys: String, CodingKey {
        case jobId = "job_id"
        case itemId = "item_id"
        case captureMode = "capture_mode"
        case captureInputKind = "capture_input_kind"
        case captures
        case photoScanOptions = "photo_scan_options"
    }
}

struct ConversionClaimResponse: Decodable {
    let jobId: String
    let itemId: String
    let usdzS3Key: String
    let usdzDownloadUrl: String

    private enum CodingKeys: String, CodingKey {
        case jobId = "job_id"
        case itemId = "item_id"
        case usdzS3Key = "usdz_s3_key"
        case usdzDownloadUrl = "usdz_download_url"
    }
}

struct PresignedUrlResponse: Decodable {
    let uploadUrl: String
    let s3Key: String
    let publicUrl: String

    private enum CodingKeys: String, CodingKey {
        case uploadUrl = "upload_url"
        case s3Key = "s3_key"
        case publicUrl = "public_url"
    }
}

struct WorkerUploadUrlRequest: Encodable {
    let item_id: String
    let kind: String
    let filename: String
    let content_type: String
}

struct ConversionProgressRequest: Encodable {
    let stage: String?
    let detail: String?
    let progress: Double?
}

struct ConversionCompleteRequest: Encodable {
    let glb_s3_key: String
    let glb_url: String
    let usdz_s3_key: String?
    let usdz_url: String?
}

struct ConversionFailRequest: Encodable {
    let error: String
}

struct GenerationProgressRequest: Encodable {
    let stage: String?
    let detail: String?
    let progress: Double?
}

struct DebugFrameUploadUrlsRequest: Encodable {
    let filenames: [String]
    let run_id: String
}

struct DebugFrameUploadUrl: Decodable {
    let filename: String
    let uploadUrl: String
    let s3Key: String
    let publicUrl: String

    private enum CodingKeys: String, CodingKey {
        case filename
        case uploadUrl = "upload_url"
        case s3Key = "s3_key"
        case publicUrl = "public_url"
    }
}

struct DebugFrameUploadUrlsResponse: Decodable {
    let storagePrefix: String
    let uploads: [DebugFrameUploadUrl]

    private enum CodingKeys: String, CodingKey {
        case storagePrefix = "storage_prefix"
        case uploads
    }
}

struct GenerationSubmittedRequest: Encodable {
    let serialize: String
    let provider_calculate_type: Int
    let provider_input_kind: String
    let video_frame_extraction: VideoFrameExtractionMetadata?
}

struct GenerationFailRequest: Encodable {
    let error: String
    let detail: String?
    let provider_input_kind: String?
    let video_frame_extraction: VideoFrameExtractionMetadata?
}

struct VideoSummary {
    let durationSeconds: Double
    let width: Int
    let height: Int
}

struct FrameCandidate {
    let index: Int
    let timestampSeconds: Double
    let fileUrl: URL
    let sharpnessScore: Double
    let differenceHash: UInt64
    var hashDistanceFromPreviousKept: Int?
    var selectedForSubmission: Bool
    var rejectionReason: String?
}

struct VideoFrameExtractionMetadata: Encodable {
    let source_duration_seconds: Double
    let source_width: Int
    let source_height: Int
    let requested_frame_count: Int
    let extracted_frame_count: Int
    let submitted_frame_count: Int
    let candidate_frame_count: Int
    let selected_frame_count: Int
    let dropped_blurry_count: Int
    let dropped_duplicate_count: Int
    let blur_threshold: Double
    let median_sharpness_score: Double
    let used_normalized_video: Bool
    let storage_prefix: String
    let persisted_frames: [PersistedFrameMetadata]
}

struct PersistedFrameMetadata: Encodable {
    let index: Int
    let filename: String
    let s3_key: String
    let url: String
    let timestamp_seconds: Double
    let sharpness_score: Double
    let selected_for_submission: Bool
    let rejection_reason: String?
    let hash_distance_from_previous_kept: Int?
}

struct SubmittedModelJob {
    let serialize: String
    let calculateType: Int
}

struct OrientationNormalizationResult {
    let usdzUrl: URL
    let updatedUsdzUpload: PresignedUrlResponse?
    let appliedRotationDescription: String?
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

let retryableStatusCodes = Set(500...599)
let retryableUrlErrorCodes: Set<URLError.Code> = [
    .timedOut,
    .cannotFindHost,
    .cannotConnectToHost,
    .dnsLookupFailed,
    .networkConnectionLost,
    .notConnectedToInternet,
    .resourceUnavailable,
    .secureConnectionFailed,
]

@main
enum ARConverterMain {
    static func main() async {
        do {
            let config = try parseConfig()
            try ensureToolExists("curl")
            try ensureToolExists("npx")
            try ensureToolExists("usdextract")
            try await runLoop(config: config)
        } catch {
            fputs("menuvium-ar-converter error: \(error)\n", stderr)
            exit(1)
        }
    }
}

func parseConfig() throws -> Config {
    let args = CommandLine.arguments.dropFirst()
    var apiBase = ProcessInfo.processInfo.environment["MENUVIUM_API_BASE"]
    var workerToken = ProcessInfo.processInfo.environment["MENUVIUM_AR_CONVERTER_TOKEN"]
    var kiriApiKey = ProcessInfo.processInfo.environment["KIRI_API_KEY"]
    var pollSeconds: UInt64 = 5

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
        case "--kiri-api-key":
            kiriApiKey = try nextValue()
        default:
            break
        }
        index = args.index(after: index)
    }

    guard let apiBaseRaw = apiBase?.trimmingCharacters(in: .whitespacesAndNewlines), !apiBaseRaw.isEmpty else {
        throw WorkerError.invalidConfig("Missing API base. Set MENUVIUM_API_BASE or pass --api-base")
    }
    guard let tokenRaw = workerToken?.trimmingCharacters(in: .whitespacesAndNewlines), !tokenRaw.isEmpty else {
        throw WorkerError.invalidConfig("Missing converter token. Set MENUVIUM_AR_CONVERTER_TOKEN or pass --token")
    }
    guard let kiriApiKeyRaw = kiriApiKey?.trimmingCharacters(in: .whitespacesAndNewlines), !kiriApiKeyRaw.isEmpty else {
        throw WorkerError.invalidConfig("Missing KIRI_API_KEY or pass --kiri-api-key")
    }

    let normalizedApiBase = apiBaseRaw.hasSuffix("/") ? String(apiBaseRaw.dropLast()) : apiBaseRaw
    return Config(
        apiBase: normalizedApiBase,
        workerToken: tokenRaw,
        kiriApiKey: kiriApiKeyRaw,
        pollSeconds: max(1, pollSeconds)
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
        if let generation = try await claimGenerationJob(config: config) {
            do {
                try await processGenerationJob(claim: generation, config: config)
            } catch {
                do {
                    try await failGenerationJob(
                        jobId: generation.jobId,
                        error: String(describing: error),
                        detail: "Could not prepare the scan input",
                        providerInputKind: generation.captureInputKind,
                        frameExtraction: nil,
                        config: config
                    )
                } catch {
                    fputs("menuvium-ar-converter warning: failed to report generation failure: \(error)\n", stderr)
                }
            }
            continue
        }
        if let claim = try await claimJob(config: config) {
            do {
                try await processJob(claim: claim, config: config)
            } catch {
                do {
                    try await failJob(jobId: claim.jobId, error: String(describing: error), config: config)
                } catch {
                    fputs("menuvium-ar-converter warning: failed to report job failure: \(error)\n", stderr)
                }
            }
        } else {
            try await Task.sleep(nanoseconds: config.pollSeconds * 1_000_000_000)
        }
    }
}

func claimGenerationJob(config: Config) async throws -> GenerationClaimResponse? {
    let url = URL(string: "\(config.apiBase)/ar-jobs/generations/claim")!
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue(config.workerToken, forHTTPHeaderField: "X-Worker-Token")
    request.setValue("application/json", forHTTPHeaderField: "Accept")

    let (data, http) = try await performRequest(request)
    if http.statusCode == 204 {
        return nil
    }
    if http.statusCode < 200 || http.statusCode >= 300 {
        throw WorkerError.httpError(http.statusCode, String(data: data, encoding: .utf8) ?? "")
    }

    let decoder = JSONDecoder()
    return try decoder.decode(GenerationClaimResponse.self, from: data)
}

func claimJob(config: Config) async throws -> ConversionClaimResponse? {
    let url = URL(string: "\(config.apiBase)/ar-jobs/conversions/claim")!
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue(config.workerToken, forHTTPHeaderField: "X-Worker-Token")
    request.setValue("application/json", forHTTPHeaderField: "Accept")

    let (data, http) = try await performRequest(request)
    if http.statusCode == 204 {
        return nil
    }
    if http.statusCode < 200 || http.statusCode >= 300 {
        throw WorkerError.httpError(http.statusCode, String(data: data, encoding: .utf8) ?? "")
    }

    let decoder = JSONDecoder()
    return try decoder.decode(ConversionClaimResponse.self, from: data)
}

func processGenerationJob(claim: GenerationClaimResponse, config: Config) async throws {
    let tempDir = FileManager.default.temporaryDirectory
        .appendingPathComponent("menuvium-ar-generation-\(claim.jobId)", isDirectory: true)
    try? FileManager.default.removeItem(at: tempDir)
    try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)

    defer {
        try? FileManager.default.removeItem(at: tempDir)
    }

    await tryUpdateGenerationProgress(
        jobId: claim.jobId,
        stage: "uploading_to_kiri",
        detail: "Downloading scan source",
        progress: 0.05,
        config: config
    )

    let downloadedCaptures = try await downloadGenerationCaptures(claim: claim, to: tempDir, config: config)

    if claim.captureInputKind == "video" {
        guard let videoCapture = downloadedCaptures.first else {
            throw WorkerError.processing("No scan video was attached to this job")
        }
        let frameSelection = try await prepareVideoFrames(
            claim: claim,
            videoUrl: videoCapture,
            tempDir: tempDir,
            config: config
        )
        print(
            "menuvium-ar-converter generation \(claim.jobId): extracted \(frameSelection.metadata.candidate_frame_count) candidate frames, submitted \(frameSelection.selectedFrameUrls.count) frames, rejected \(frameSelection.metadata.dropped_blurry_count) blurry and \(frameSelection.metadata.dropped_duplicate_count) near-duplicate frames"
        )

        await tryUpdateGenerationProgress(
            jobId: claim.jobId,
            stage: "uploading_to_kiri",
            detail: "Submitting selected frames",
            progress: 0.34,
            config: config
        )
        let submitted = try submitImagesToKiri(
            imageUrls: frameSelection.selectedFrameUrls,
            captureMode: claim.captureMode,
            options: claim.photoScanOptions,
            apiKey: config.kiriApiKey,
            tempDir: tempDir
        )
        try await reportGenerationSubmitted(
            jobId: claim.jobId,
            payload: GenerationSubmittedRequest(
                serialize: submitted.serialize,
                provider_calculate_type: submitted.calculateType,
                provider_input_kind: "images",
                video_frame_extraction: frameSelection.metadata
            ),
            config: config
        )
        return
    }

    let submitted = try submitImagesToKiri(
        imageUrls: downloadedCaptures,
        captureMode: claim.captureMode,
        options: claim.photoScanOptions,
        apiKey: config.kiriApiKey,
        tempDir: tempDir
    )
    try await reportGenerationSubmitted(
        jobId: claim.jobId,
        payload: GenerationSubmittedRequest(
            serialize: submitted.serialize,
            provider_calculate_type: submitted.calculateType,
            provider_input_kind: "images",
            video_frame_extraction: nil
        ),
        config: config
    )
}

func downloadGenerationCaptures(claim: GenerationClaimResponse, to tempDir: URL, config: Config) async throws -> [URL] {
    var results: [URL] = []
    let capturesDir = tempDir.appendingPathComponent("captures", isDirectory: true)
    try FileManager.default.createDirectory(at: capturesDir, withIntermediateDirectories: true)
    for capture in claim.captures.sorted(by: { $0.position < $1.position }) {
        let ext = URL(fileURLWithPath: capture.s3Key).pathExtension
        let fileName = String(format: "%04d-%@.%@", capture.position, capture.captureId, ext.isEmpty ? "bin" : ext)
        let destination = capturesDir.appendingPathComponent(fileName)
        try await downloadFile(
            from: absoluteUrl(capture.downloadUrl, apiBase: config.apiBase),
            to: destination
        )
        results.append(destination)
    }
    return results
}

struct VideoFrameSelectionResult {
    let metadata: VideoFrameExtractionMetadata
    let selectedFrameUrls: [URL]
}

func prepareVideoFrames(
    claim: GenerationClaimResponse,
    videoUrl: URL,
    tempDir: URL,
    config: Config
) async throws -> VideoFrameSelectionResult {
    await tryUpdateGenerationProgress(
        jobId: claim.jobId,
        stage: "uploading_to_kiri",
        detail: "Checking video quality",
        progress: 0.08,
        config: config
    )
    let summary = try inspectVideo(url: videoUrl)
    try validateVideoQuality(summary: summary)

    await tryUpdateGenerationProgress(
        jobId: claim.jobId,
        stage: "uploading_to_kiri",
        detail: "Extracting candidate frames",
        progress: 0.14,
        config: config
    )
    let analysisDir = tempDir.appendingPathComponent("analysis", isDirectory: true)
    try FileManager.default.createDirectory(at: analysisDir, withIntermediateDirectories: true)
    var candidates = try extractCandidateFrames(
        videoUrl: videoUrl,
        outputDir: analysisDir,
        summary: summary
    )

    await tryUpdateGenerationProgress(
        jobId: claim.jobId,
        stage: "uploading_to_kiri",
        detail: "Scoring and filtering frames",
        progress: 0.22,
        config: config
    )
    let selection = selectBestFrames(from: candidates)
    candidates = selection.annotatedCandidates
    if selection.selectedFrames.count < minimumSubmittedFrameCount() {
        if selection.sharpFrameCount < minimumSubmittedFrameCount() {
            throw WorkerError.processing(
                "The uploaded video is too blurry for AR generation. Record a slower, steadier orbit in brighter light and keep the full dish in frame."
            )
        }
        throw WorkerError.processing(
            "The uploaded video does not contain enough distinct angles for AR generation. Record a slower orbit and capture more movement around the dish."
        )
    }

    await tryUpdateGenerationProgress(
        jobId: claim.jobId,
        stage: "uploading_to_kiri",
        detail: "Saving extracted frames",
        progress: 0.28,
        config: config
    )
        let uploadedFrames = try await uploadDebugFrames(jobId: claim.jobId, frameCandidates: candidates, config: config)
    let uploadedByFilename = Dictionary(uniqueKeysWithValues: uploadedFrames.map { ($0.filename, $0) })
    let persistedFrames = candidates.map { frame -> PersistedFrameMetadata in
        let uploaded = uploadedByFilename[frame.fileUrl.lastPathComponent]
        return PersistedFrameMetadata(
            index: frame.index,
            filename: frame.fileUrl.lastPathComponent,
            s3_key: uploaded?.s3Key ?? "",
            url: uploaded?.publicUrl ?? "",
            timestamp_seconds: frame.timestampSeconds,
            sharpness_score: frame.sharpnessScore,
            selected_for_submission: frame.selectedForSubmission,
            rejection_reason: frame.rejectionReason,
            hash_distance_from_previous_kept: frame.hashDistanceFromPreviousKept
        )
    }

    let metadata = VideoFrameExtractionMetadata(
        source_duration_seconds: summary.durationSeconds,
        source_width: summary.width,
        source_height: summary.height,
        requested_frame_count: requestedCandidateFrameCount(for: summary.durationSeconds),
        extracted_frame_count: candidates.count,
        submitted_frame_count: selection.selectedFrames.count,
        candidate_frame_count: candidates.count,
        selected_frame_count: selection.selectedFrames.count,
        dropped_blurry_count: selection.blurryRejectedCount,
        dropped_duplicate_count: selection.duplicateRejectedCount,
        blur_threshold: selection.blurThreshold,
        median_sharpness_score: selection.medianSharpness,
        used_normalized_video: false,
        storage_prefix: uploadedFrames.first.map { _ in "items/ar/\(claim.itemId)/debug_frames/\(claim.jobId)" } ?? "items/ar/\(claim.itemId)/debug_frames/\(claim.jobId)",
        persisted_frames: persistedFrames
    )

    return VideoFrameSelectionResult(
        metadata: metadata,
        selectedFrameUrls: selection.selectedFrames.map(\.fileUrl)
    )
}

func processJob(claim: ConversionClaimResponse, config: Config) async throws {
    let tempDir = FileManager.default.temporaryDirectory
        .appendingPathComponent("menuvium-ar-converter-\(claim.jobId)", isDirectory: true)
    try? FileManager.default.removeItem(at: tempDir)
    try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)

    let modelUsdz = tempDir.appendingPathComponent("model.usdz")
    let convertDir = tempDir.appendingPathComponent("convert", isDirectory: true)
    try FileManager.default.createDirectory(at: convertDir, withIntermediateDirectories: true)

    await tryUpdateProgress(
        jobId: claim.jobId,
        stage: "converting_glb",
        detail: "Downloading USDZ",
        progress: 0.9,
        config: config
    )
    try await downloadFile(from: absoluteUrl(claim.usdzDownloadUrl, apiBase: config.apiBase), to: modelUsdz)

    await tryUpdateProgress(
        jobId: claim.jobId,
        stage: "converting_glb",
        detail: "Normalizing orientation",
        progress: 0.915,
        config: config
    )
    let normalized = try await normalizeUsdzOrientationIfNeeded(
        itemId: claim.itemId,
        inputUsdz: modelUsdz,
        tempDir: tempDir,
        config: config
    )
    if let appliedRotationDescription = normalized.appliedRotationDescription {
        print("menuvium-ar-converter conversion \(claim.jobId): \(appliedRotationDescription)")
    }

    await tryUpdateProgress(
        jobId: claim.jobId,
        stage: "converting_glb",
        detail: "Exporting USDZ to OBJ",
        progress: 0.93,
        config: config
    )
    let modelObj = convertDir.appendingPathComponent("model.obj")
    try exportUsdzToObj(usdzUrl: normalized.usdzUrl, objUrl: modelObj)

    await tryUpdateProgress(
        jobId: claim.jobId,
        stage: "converting_glb",
        detail: "Extracting textures",
        progress: 0.95,
        config: config
    )
    _ = try runProcess("usdextract", args: ["-o", convertDir.path, normalized.usdzUrl.path])
    try prepareMtlForObj2Gltf(mtlUrl: convertDir.appendingPathComponent("model.mtl"))

    await tryUpdateProgress(
        jobId: claim.jobId,
        stage: "converting_glb",
        detail: "Building GLB",
        progress: 0.97,
        config: config
    )
    let modelGlb = tempDir.appendingPathComponent("model.glb")
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

    let upload = try await getUploadUrl(
        itemId: claim.itemId,
        kind: "model_glb",
        filename: "model.glb",
        contentType: "model/gltf-binary",
        config: config
    )
    try await uploadFile(fileUrl: modelGlb, uploadUrl: upload.uploadUrl, contentType: "model/gltf-binary")
    try await completeJob(
        jobId: claim.jobId,
        payload: ConversionCompleteRequest(
            glb_s3_key: upload.s3Key,
            glb_url: upload.publicUrl,
            usdz_s3_key: normalized.updatedUsdzUpload?.s3Key,
            usdz_url: normalized.updatedUsdzUpload?.publicUrl
        ),
        config: config
    )
}

func normalizeUsdzOrientationIfNeeded(
    itemId: String,
    inputUsdz: URL,
    tempDir: URL,
    config: Config
) async throws -> OrientationNormalizationResult {
    let scene = try SCNScene(url: inputUsdz, options: nil)
    let analysis = analyzeOrientation(scene: scene)
    guard let rotation = analysis.rotationEulerRadians else {
        return OrientationNormalizationResult(
            usdzUrl: inputUsdz,
            updatedUsdzUpload: nil,
            appliedRotationDescription: nil
        )
    }

    let normalizedScene = SCNScene()
    let wrapper = SCNNode()
    wrapper.eulerAngles = rotation

    for child in scene.rootNode.childNodes {
        child.removeFromParentNode()
        wrapper.addChildNode(child)
    }
    normalizedScene.rootNode.addChildNode(wrapper)

    let normalizedUsdz = tempDir.appendingPathComponent("normalized-model.usdz")
    normalizedScene.write(to: normalizedUsdz, options: nil, delegate: nil, progressHandler: nil)

    let upload = try await getUploadUrl(
        itemId: itemId,
        kind: "model_usdz",
        filename: "model.usdz",
        contentType: "model/vnd.usdz+zip",
        config: config
    )
    try await uploadFile(
        fileUrl: normalizedUsdz,
        uploadUrl: upload.uploadUrl,
        contentType: "model/vnd.usdz+zip"
    )

    return OrientationNormalizationResult(
        usdzUrl: normalizedUsdz,
        updatedUsdzUpload: upload,
        appliedRotationDescription: analysis.description
    )
}

struct OrientationAnalysis {
    let rotationEulerRadians: SCNVector3?
    let description: String?
}

func analyzeOrientation(scene: SCNScene) -> OrientationAnalysis {
    let probe = SCNNode()
    for child in scene.rootNode.childNodes {
        probe.addChildNode(child.clone())
    }
    let (minimum, maximum) = probe.boundingBox
    let xExtent = Double(maximum.x - minimum.x)
    let yExtent = Double(maximum.y - minimum.y)
    let zExtent = Double(maximum.z - minimum.z)
    let axes = [("x", xExtent), ("y", yExtent), ("z", zExtent)].sorted { $0.1 < $1.1 }

    guard axes.count == 3 else {
        return OrientationAnalysis(rotationEulerRadians: nil, description: nil)
    }

    let smallest = axes[0]
    let middle = axes[1]
    let flatnessThreshold = envDouble("MENUVIUM_AR_FLATNESS_RATIO_THRESHOLD", defaultValue: 0.6)
    guard middle.1 > 0, smallest.1 / middle.1 <= flatnessThreshold else {
        return OrientationAnalysis(rotationEulerRadians: nil, description: nil)
    }

    switch smallest.0 {
    case "y":
        return OrientationAnalysis(rotationEulerRadians: nil, description: nil)
    case "z":
        return OrientationAnalysis(
            rotationEulerRadians: SCNVector3(-Float.pi / 2, 0, 0),
            description: String(
                format: "rotated existing USDZ by -90deg around X to make Y the up axis (extents x=%.4f y=%.4f z=%.4f)",
                xExtent,
                yExtent,
                zExtent
            )
        )
    case "x":
        return OrientationAnalysis(
            rotationEulerRadians: SCNVector3(0, 0, Float.pi / 2),
            description: String(
                format: "rotated existing USDZ by +90deg around Z to make Y the up axis (extents x=%.4f y=%.4f z=%.4f)",
                xExtent,
                yExtent,
                zExtent
            )
        )
    default:
        return OrientationAnalysis(rotationEulerRadians: nil, description: nil)
    }
}

func reportGenerationSubmitted(
    jobId: String,
    payload: GenerationSubmittedRequest,
    config: Config
) async throws {
    let url = URL(string: "\(config.apiBase)/ar-jobs/generations/\(jobId)/submitted")!
    let data = try JSONEncoder().encode(payload)

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.httpBody = data
    request.setValue(config.workerToken, forHTTPHeaderField: "X-Worker-Token")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")

    let (_, http) = try await performRequest(request)
    guard http.statusCode >= 200, http.statusCode < 300 else {
        throw WorkerError.processing("Failed to record scan submission")
    }
}

func failGenerationJob(
    jobId: String,
    error: String,
    detail: String?,
    providerInputKind: String?,
    frameExtraction: VideoFrameExtractionMetadata?,
    config: Config
) async throws {
    let url = URL(string: "\(config.apiBase)/ar-jobs/generations/\(jobId)/fail")!
    let payload = GenerationFailRequest(
        error: error,
        detail: detail,
        provider_input_kind: providerInputKind,
        video_frame_extraction: frameExtraction
    )
    let data = try JSONEncoder().encode(payload)

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.httpBody = data
    request.setValue(config.workerToken, forHTTPHeaderField: "X-Worker-Token")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")

    _ = try await performRequest(request)
}

func updateGenerationProgress(
    jobId: String,
    payload: GenerationProgressRequest,
    config: Config
) async throws {
    let url = URL(string: "\(config.apiBase)/ar-jobs/generations/\(jobId)/progress")!
    let data = try JSONEncoder().encode(payload)

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.httpBody = data
    request.setValue(config.workerToken, forHTTPHeaderField: "X-Worker-Token")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")

    let (_, http) = try await performRequest(request)
    guard http.statusCode >= 200, http.statusCode < 300 else {
        throw WorkerError.processing("Failed to update generation progress")
    }
}

func tryUpdateGenerationProgress(
    jobId: String,
    stage: String?,
    detail: String?,
    progress: Double?,
    config: Config
) async {
    do {
        try await updateGenerationProgress(
            jobId: jobId,
            payload: GenerationProgressRequest(stage: stage, detail: detail, progress: progress),
            config: config
        )
    } catch {
        // Best-effort only.
    }
}

func requestDebugFrameUploadUrls(
    jobId: String,
    filenames: [String],
    config: Config
) async throws -> DebugFrameUploadUrlsResponse {
    let url = URL(string: "\(config.apiBase)/ar-jobs/generations/\(jobId)/debug-frame-upload-urls")!
    let payload = DebugFrameUploadUrlsRequest(filenames: filenames, run_id: jobId)
    let requestData = try JSONEncoder().encode(payload)

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.httpBody = requestData
    request.setValue(config.workerToken, forHTTPHeaderField: "X-Worker-Token")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("application/json", forHTTPHeaderField: "Accept")

    let (data, http) = try await performRequest(request)
    if http.statusCode < 200 || http.statusCode >= 300 {
        throw WorkerError.httpError(http.statusCode, String(data: data, encoding: .utf8) ?? "")
    }

    return try JSONDecoder().decode(DebugFrameUploadUrlsResponse.self, from: data)
}

func uploadDebugFrames(jobId: String, frameCandidates: [FrameCandidate], config: Config) async throws -> [DebugFrameUploadUrl] {
    let filenames = frameCandidates.map { $0.fileUrl.lastPathComponent }
    let response = try await requestDebugFrameUploadUrls(jobId: jobId, filenames: filenames, config: config)
    let uploadsByFilename = Dictionary(uniqueKeysWithValues: response.uploads.map { ($0.filename, $0) })
    var uploaded: [DebugFrameUploadUrl] = []
    for candidate in frameCandidates {
        guard let upload = uploadsByFilename[candidate.fileUrl.lastPathComponent] else {
            throw WorkerError.processing("Missing debug frame upload target for \(candidate.fileUrl.lastPathComponent)")
        }
        try await uploadFile(fileUrl: candidate.fileUrl, uploadUrl: upload.uploadUrl, contentType: "image/jpeg")
        uploaded.append(upload)
    }
    return uploaded
}

func inspectVideo(url: URL) throws -> VideoSummary {
    let asset = AVURLAsset(url: url)
    guard let track = asset.tracks(withMediaType: .video).first else {
        throw WorkerError.processing("The uploaded video does not contain a video track.")
    }
    let durationSeconds = CMTimeGetSeconds(asset.duration)
    guard durationSeconds.isFinite, durationSeconds > 0 else {
        throw WorkerError.processing("The uploaded video duration could not be determined.")
    }
    let size = track.naturalSize.applying(track.preferredTransform)
    let width = Int(abs(size.width))
    let height = Int(abs(size.height))
    return VideoSummary(durationSeconds: durationSeconds, width: width, height: height)
}

func validateVideoQuality(summary: VideoSummary) throws {
    let minDuration = envDouble("MENUVIUM_SCAN_MIN_DURATION_SECONDS", defaultValue: 6.0)
    let maxDuration = envDouble("MENUVIUM_SCAN_MAX_DURATION_SECONDS", defaultValue: 180.0)
    let minMaxDimension = envInt("MENUVIUM_SCAN_MIN_MAX_DIMENSION", defaultValue: 1080)

    if summary.durationSeconds < minDuration {
        throw WorkerError.processing(
            "The uploaded video is too short for AR generation. Record a slower orbit that lasts at least \(Int(ceil(minDuration))) seconds."
        )
    }
    if summary.durationSeconds > maxDuration {
        throw WorkerError.processing(
            "The uploaded video is too long for AR generation. Keep the scan clip under \(Int(maxDuration)) seconds."
        )
    }
    if max(summary.width, summary.height) < minMaxDimension {
        throw WorkerError.processing(
            "The uploaded video resolution is too low for reliable AR generation. Record in at least 1080p and try again."
        )
    }
}

func requestedCandidateFrameCount(for durationSeconds: Double) -> Int {
    let targetFps = max(envDouble("MENUVIUM_SCAN_FRAME_FPS", defaultValue: 12.0), 1.0)
    let minFrames = max(envInt("MENUVIUM_SCAN_FRAME_MIN_CANDIDATES", defaultValue: 120), minimumSubmittedFrameCount())
    let maxFrames = min(max(envInt("MENUVIUM_SCAN_FRAME_MAX_CANDIDATES", defaultValue: 300), minFrames), 300)
    return min(max(Int(ceil(durationSeconds * targetFps)), minFrames), maxFrames)
}

func minimumSubmittedFrameCount() -> Int {
    return max(envInt("MENUVIUM_SCAN_MIN_SELECTED_FRAMES", defaultValue: 20), 20)
}

func targetSelectedFrameCount() -> Int {
    return min(max(envInt("MENUVIUM_SCAN_TARGET_SELECTED_FRAMES", defaultValue: 180), minimumSubmittedFrameCount()), 300)
}

func extractCandidateFrames(
    videoUrl: URL,
    outputDir: URL,
    summary: VideoSummary
) throws -> [FrameCandidate] {
    try FileManager.default.createDirectory(at: outputDir, withIntermediateDirectories: true)
    let asset = AVURLAsset(url: videoUrl)
    let generator = AVAssetImageGenerator(asset: asset)
    generator.appliesPreferredTrackTransform = true
    generator.requestedTimeToleranceBefore = .zero
    generator.requestedTimeToleranceAfter = .zero

    let count = requestedCandidateFrameCount(for: summary.durationSeconds)
    let margin = min(0.5, max(summary.durationSeconds / 20.0, 0.0))
    let usableDuration = max(summary.durationSeconds - (margin * 2), 0.1)
    var frames: [FrameCandidate] = []

    for index in 0..<count {
        let progress = count == 1 ? 0.0 : Double(index) / Double(count - 1)
        let seconds = margin + (usableDuration * progress)
        let time = CMTime(seconds: seconds, preferredTimescale: 600)
        let cgImage = try generator.copyCGImage(at: time, actualTime: nil)
        let fileUrl = outputDir.appendingPathComponent(String(format: "frame-%04d.jpg", index + 1))
        try writeJpegImage(cgImage: cgImage, to: fileUrl)
        frames.append(
            FrameCandidate(
                index: index + 1,
                timestampSeconds: seconds,
                fileUrl: fileUrl,
                sharpnessScore: try sharpnessScore(for: cgImage),
                differenceHash: try differenceHash(for: cgImage),
                hashDistanceFromPreviousKept: nil,
                selectedForSubmission: false,
                rejectionReason: nil
            )
        )
    }
    return frames
}

struct FrameSelectionSummary {
    let annotatedCandidates: [FrameCandidate]
    let selectedFrames: [FrameCandidate]
    let blurryRejectedCount: Int
    let duplicateRejectedCount: Int
    let sharpFrameCount: Int
    let blurThreshold: Double
    let medianSharpness: Double
}

func selectBestFrames(from candidates: [FrameCandidate]) -> FrameSelectionSummary {
    guard !candidates.isEmpty else {
        return FrameSelectionSummary(
            annotatedCandidates: [],
            selectedFrames: [],
            blurryRejectedCount: 0,
            duplicateRejectedCount: 0,
            sharpFrameCount: 0,
            blurThreshold: 0,
            medianSharpness: 0
        )
    }

    let sortedScores = candidates.map(\.sharpnessScore).sorted()
    let medianSharpness = sortedScores[sortedScores.count / 2]
    let blurThreshold = max(
        envDouble("MENUVIUM_SCAN_BLUR_ABSOLUTE_THRESHOLD", defaultValue: 0.02),
        medianSharpness * envDouble("MENUVIUM_SCAN_BLUR_RELATIVE_FACTOR", defaultValue: 0.45)
    )
    let duplicateThreshold = max(envInt("MENUVIUM_SCAN_DUPLICATE_HAMMING_THRESHOLD", defaultValue: 6), 1)

    var annotated: [FrameCandidate] = []
    var sharpFrames: [FrameCandidate] = []
    var selectedFrames: [FrameCandidate] = []
    var blurryRejectedCount = 0
    var duplicateRejectedCount = 0

    for candidate in candidates {
        var frame = candidate
        if frame.sharpnessScore < blurThreshold {
            frame.rejectionReason = "blurry"
            blurryRejectedCount += 1
            annotated.append(frame)
            continue
        }
        sharpFrames.append(frame)

        if let lastKept = selectedFrames.last {
            let distance = hammingDistance(frame.differenceHash, lastKept.differenceHash)
            frame.hashDistanceFromPreviousKept = distance
            if distance < duplicateThreshold {
                frame.rejectionReason = "near_duplicate"
                duplicateRejectedCount += 1
                annotated.append(frame)
                continue
            }
        }
        frame.selectedForSubmission = true
        selectedFrames.append(frame)
        annotated.append(frame)
    }

    if selectedFrames.count > targetSelectedFrameCount() {
        let reduced = reduceFramesForCoverage(selectedFrames, targetCount: targetSelectedFrameCount())
        let selectedNames = Set(reduced.map { $0.fileUrl.lastPathComponent })
        selectedFrames = reduced
        annotated = annotated.map { frame in
            var updated = frame
            let isSelected = selectedNames.contains(frame.fileUrl.lastPathComponent)
            updated.selectedForSubmission = isSelected
            if !isSelected && updated.rejectionReason == nil {
                updated.rejectionReason = "coverage_trim"
            }
            return updated
        }
    }

    return FrameSelectionSummary(
        annotatedCandidates: annotated,
        selectedFrames: selectedFrames,
        blurryRejectedCount: blurryRejectedCount,
        duplicateRejectedCount: duplicateRejectedCount,
        sharpFrameCount: sharpFrames.count,
        blurThreshold: blurThreshold,
        medianSharpness: medianSharpness
    )
}

func reduceFramesForCoverage(_ frames: [FrameCandidate], targetCount: Int) -> [FrameCandidate] {
    guard frames.count > targetCount, targetCount > 0 else {
        return frames
    }
    var result: [FrameCandidate] = []
    result.reserveCapacity(targetCount)
    for bucketIndex in 0..<targetCount {
        let start = Int(Double(frames.count) * Double(bucketIndex) / Double(targetCount))
        let end = max(start + 1, Int(Double(frames.count) * Double(bucketIndex + 1) / Double(targetCount)))
        let slice = frames[start..<min(end, frames.count)]
        if let best = slice.max(by: { $0.sharpnessScore < $1.sharpnessScore }) {
            result.append(best)
        }
    }
    return result.sorted(by: { $0.timestampSeconds < $1.timestampSeconds })
}

func submitImagesToKiri(
    imageUrls: [URL],
    captureMode: String,
    options: GenerationPhotoScanOptions,
    apiKey: String,
    tempDir: URL
) throws -> SubmittedModelJob {
    guard !imageUrls.isEmpty else {
        throw WorkerError.processing("No frames were available for model generation.")
    }

    let endpointPath = captureMode == "featureless" ? "/v1/open/featureless/image" : "/v1/open/photo/image"
    let bodyFile = tempDir.appendingPathComponent("provider-response.json")
    try? FileManager.default.removeItem(at: bodyFile)

    var args = [
        "-sS",
        "-X",
        "POST",
        "https://api.kiriengine.app/api\(endpointPath)",
        "-H",
        "Authorization: Bearer \(apiKey)",
        "-o",
        bodyFile.path,
        "-w",
        "%{http_code}",
        "-F",
        "fileFormat=usdz",
    ]
    if captureMode != "featureless" {
        args.append(contentsOf: [
            "-F", "modelQuality=\(options.modelQuality)",
            "-F", "textureQuality=\(options.textureQuality)",
            "-F", "textureSmoothing=\(options.textureSmoothing)",
            "-F", "isMask=\(options.isMask)",
        ])
    }
    for imageUrl in imageUrls {
        args.append(contentsOf: ["-F", "imagesFiles=@\(imageUrl.path);type=image/jpeg"])
    }

    let statusText = try runProcess("curl", args: args).trimmingCharacters(in: .whitespacesAndNewlines)
    let statusCode = Int(statusText) ?? 0
    let bodyData = (try? Data(contentsOf: bodyFile)) ?? Data()
    return try parseKiriSubmitResponse(data: bodyData, statusCode: statusCode)
}

func parseKiriSubmitResponse(data: Data, statusCode: Int) throws -> SubmittedModelJob {
    let object = try JSONSerialization.jsonObject(with: data, options: [])
    guard let payload = object as? [String: Any] else {
        throw WorkerError.processing("Model provider returned an unexpected response.")
    }

    let code = normalizedCode(payload["code"])
    let message = normalizedMessage(payload["msg"])
    let dataObject = payload["data"] as? [String: Any]
    let hasSuccessShape = dataObject?["serialize"] != nil && dataObject?["calculateType"] != nil
    let signalsSuccess = (message?.lowercased() == "success")

    if (200..<300).contains(statusCode),
       hasSuccessShape,
       signalsSuccess,
       (code == nil || code == 0 || code == 200),
       let serialize = dataObject?["serialize"] as? String,
       let calculateType = normalizedCode(dataObject?["calculateType"]) {
        return SubmittedModelJob(serialize: serialize, calculateType: calculateType)
    }

    if let code = code, code == 2009 {
        throw WorkerError.processing("The uploaded video could not be submitted for AR generation. Record a slower orbit with cleaner, steadier framing and try again.")
    }

    let providerDetail = message ?? "unexpected provider response"
    throw WorkerError.processing("AR generation submission failed: HTTP \(statusCode), code \(code ?? -1), \(providerDetail)")
}

func normalizedCode(_ value: Any?) -> Int? {
    switch value {
    case let number as Int:
        return number
    case let number as NSNumber:
        return number.intValue
    case let text as String:
        return Int(text.trimmingCharacters(in: .whitespacesAndNewlines))
    default:
        return nil
    }
}

func normalizedMessage(_ value: Any?) -> String? {
    guard let text = value as? String else { return nil }
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
}

func sharpnessScore(for cgImage: CGImage) throws -> Double {
    let ciContext = CIContext()
    let grayscale = CIImage(cgImage: cgImage).applyingFilter(
        "CIColorControls",
        parameters: [kCIInputSaturationKey: 0.0]
    )
    let edges = grayscale.applyingFilter("CIEdges", parameters: [kCIInputIntensityKey: 8.0])
    let average = edges.applyingFilter(
        "CIAreaAverage",
        parameters: [kCIInputExtentKey: CIVector(cgRect: edges.extent)]
    )

    var bitmap = [UInt8](repeating: 0, count: 4)
    ciContext.render(
        average,
        toBitmap: &bitmap,
        rowBytes: 4,
        bounds: CGRect(x: 0, y: 0, width: 1, height: 1),
        format: .RGBA8,
        colorSpace: CGColorSpaceCreateDeviceRGB()
    )
    return Double(bitmap[0]) / 255.0
}

func differenceHash(for cgImage: CGImage) throws -> UInt64 {
    let width = 9
    let height = 8
    var pixels = [UInt8](repeating: 0, count: width * height)
    let colorSpace = CGColorSpaceCreateDeviceGray()
    guard let context = CGContext(
        data: &pixels,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: width,
        space: colorSpace,
        bitmapInfo: CGImageAlphaInfo.none.rawValue
    ) else {
        throw WorkerError.processing("Could not create an image context for duplicate detection.")
    }
    context.interpolationQuality = .medium
    context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))

    var hash: UInt64 = 0
    var bitIndex = 0
    for row in 0..<height {
        for column in 0..<(width - 1) {
            let left = pixels[(row * width) + column]
            let right = pixels[(row * width) + column + 1]
            if left > right {
                hash |= (UInt64(1) << UInt64(bitIndex))
            }
            bitIndex += 1
        }
    }
    return hash
}

func hammingDistance(_ lhs: UInt64, _ rhs: UInt64) -> Int {
    (lhs ^ rhs).nonzeroBitCount
}

func writeJpegImage(cgImage: CGImage, to destination: URL) throws {
    guard let destinationRef = CGImageDestinationCreateWithURL(
        destination as CFURL,
        UTType.jpeg.identifier as CFString,
        1,
        nil
    ) else {
        throw WorkerError.processing("Could not create a JPEG destination for extracted frames.")
    }
    let options: [CFString: Any] = [
        kCGImageDestinationLossyCompressionQuality: 0.96,
    ]
    CGImageDestinationAddImage(destinationRef, cgImage, options as CFDictionary)
    if !CGImageDestinationFinalize(destinationRef) {
        throw WorkerError.processing("Could not write an extracted frame to disk.")
    }
}

func envInt(_ name: String, defaultValue: Int) -> Int {
    guard let raw = ProcessInfo.processInfo.environment[name], let value = Int(raw) else {
        return defaultValue
    }
    return value
}

func envDouble(_ name: String, defaultValue: Double) -> Double {
    guard let raw = ProcessInfo.processInfo.environment[name], let value = Double(raw) else {
        return defaultValue
    }
    return value
}

func exportUsdzToObj(usdzUrl: URL, objUrl: URL) throws {
    let asset = MDLAsset(url: usdzUrl)
    do {
        try asset.export(to: objUrl)
    } catch {
        throw WorkerError.processing("Failed to export USDZ to OBJ: \(error)")
    }
}

func prepareMtlForObj2Gltf(mtlUrl: URL) throws {
    let contents = try String(contentsOf: mtlUrl, encoding: .utf8)
    let bracketRegex = try NSRegularExpression(pattern: #"[^\s]*\[([^\]]+)\]"#)
    let range = NSRange(contents.startIndex..<contents.endIndex, in: contents)
    let withoutBrackets = bracketRegex.stringByReplacingMatches(in: contents, range: range, withTemplate: "$1")

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

func performRequest(_ request: URLRequest, retries: Int = 3) async throws -> (Data, HTTPURLResponse) {
    var attempt = 0
    while true {
        attempt += 1
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                throw WorkerError.processing("Invalid response")
            }
            if retryableStatusCodes.contains(http.statusCode), attempt < retries {
                fputs(
                    "menuvium-ar-converter warning: transient HTTP \(http.statusCode) from \(request.url?.absoluteString ?? "unknown URL"); retrying\n",
                    stderr
                )
                try await Task.sleep(nanoseconds: retryDelayNanoseconds(for: attempt))
                continue
            }
            return (data, http)
        } catch {
            if isRetryable(error), attempt < retries {
                fputs(
                    "menuvium-ar-converter warning: transient network error from \(request.url?.absoluteString ?? "unknown URL"); retrying\n",
                    stderr
                )
                try await Task.sleep(nanoseconds: retryDelayNanoseconds(for: attempt))
                continue
            }
            throw error
        }
    }
}

func performDownload(_ url: URL, retries: Int = 3) async throws -> (Data, HTTPURLResponse) {
    var attempt = 0
    while true {
        attempt += 1
        do {
            let (data, response) = try await URLSession.shared.data(from: url)
            guard let http = response as? HTTPURLResponse else {
                throw WorkerError.processing("Invalid response")
            }
            if retryableStatusCodes.contains(http.statusCode), attempt < retries {
                fputs(
                    "menuvium-ar-converter warning: transient HTTP \(http.statusCode) while downloading \(url.absoluteString); retrying\n",
                    stderr
                )
                try await Task.sleep(nanoseconds: retryDelayNanoseconds(for: attempt))
                continue
            }
            return (data, http)
        } catch {
            if isRetryable(error), attempt < retries {
                fputs(
                    "menuvium-ar-converter warning: transient network error while downloading \(url.absoluteString); retrying\n",
                    stderr
                )
                try await Task.sleep(nanoseconds: retryDelayNanoseconds(for: attempt))
                continue
            }
            throw error
        }
    }
}

func retryDelayNanoseconds(for attempt: Int) -> UInt64 {
    let seconds = UInt64(min(8, 1 << max(0, attempt - 1)))
    return seconds * 1_000_000_000
}

func isRetryable(_ error: Error) -> Bool {
    if let workerError = error as? WorkerError {
        switch workerError {
        case .httpError(let status, _):
            return retryableStatusCodes.contains(status)
        default:
            return false
        }
    }
    if let urlError = error as? URLError {
        return retryableUrlErrorCodes.contains(urlError.code)
    }
    return false
}

func downloadFile(from url: URL, to destination: URL) async throws {
    let (data, http) = try await performDownload(url)
    guard http.statusCode >= 200, http.statusCode < 300 else {
        throw WorkerError.processing("Failed to download USDZ: \(url.absoluteString)")
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

    let (data, http) = try await performRequest(request)
    if http.statusCode < 200 || http.statusCode >= 300 {
        throw WorkerError.httpError(http.statusCode, String(data: data, encoding: .utf8) ?? "")
    }
    let decoder = JSONDecoder()
    return try decoder.decode(PresignedUrlResponse.self, from: data)
}

func uploadFile(fileUrl: URL, uploadUrl: String, contentType: String) async throws {
    let data = try Data(contentsOf: fileUrl)
    let url = URL(string: uploadUrl)!
    var request = URLRequest(url: url)
    request.httpMethod = "PUT"
    request.httpBody = data
    request.setValue(contentType, forHTTPHeaderField: "Content-Type")

    let (_, http) = try await performRequest(request)
    guard http.statusCode >= 200, http.statusCode < 300 else {
        throw WorkerError.processing("Failed to upload \(fileUrl.lastPathComponent)")
    }
}

func completeJob(jobId: String, payload: ConversionCompleteRequest, config: Config) async throws {
    let url = URL(string: "\(config.apiBase)/ar-jobs/conversions/\(jobId)/complete")!
    let data = try JSONEncoder().encode(payload)

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.httpBody = data
    request.setValue(config.workerToken, forHTTPHeaderField: "X-Worker-Token")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")

    let (_, http) = try await performRequest(request)
    guard http.statusCode >= 200, http.statusCode < 300 else {
        throw WorkerError.processing("Failed to mark conversion complete")
    }
}

func failJob(jobId: String, error: String, config: Config) async throws {
    let url = URL(string: "\(config.apiBase)/ar-jobs/conversions/\(jobId)/fail")!
    let payload = ConversionFailRequest(error: error)
    let data = try JSONEncoder().encode(payload)

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.httpBody = data
    request.setValue(config.workerToken, forHTTPHeaderField: "X-Worker-Token")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")

    _ = try await performRequest(request)
}

func updateProgress(jobId: String, payload: ConversionProgressRequest, config: Config) async throws {
    let url = URL(string: "\(config.apiBase)/ar-jobs/conversions/\(jobId)/progress")!
    let data = try JSONEncoder().encode(payload)

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.httpBody = data
    request.setValue(config.workerToken, forHTTPHeaderField: "X-Worker-Token")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")

    let (_, http) = try await performRequest(request)
    guard http.statusCode >= 200, http.statusCode < 300 else {
        throw WorkerError.processing("Failed to update progress")
    }
}

func tryUpdateProgress(
    jobId: String,
    stage: String?,
    detail: String?,
    progress: Double?,
    config: Config
) async {
    do {
        try await updateProgress(
            jobId: jobId,
            payload: ConversionProgressRequest(stage: stage, detail: detail, progress: progress),
            config: config
        )
    } catch {
        // Best-effort only.
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
