import Foundation
import ModelIO

struct Config {
    let apiBase: String
    let workerToken: String
    let pollSeconds: UInt64
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
}

struct ConversionFailRequest: Encodable {
    let error: String
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

    let normalizedApiBase = apiBaseRaw.hasSuffix("/") ? String(apiBaseRaw.dropLast()) : apiBaseRaw
    return Config(apiBase: normalizedApiBase, workerToken: tokenRaw, pollSeconds: max(1, pollSeconds))
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
        detail: "Exporting USDZ to OBJ",
        progress: 0.93,
        config: config
    )
    let modelObj = convertDir.appendingPathComponent("model.obj")
    try exportUsdzToObj(usdzUrl: modelUsdz, objUrl: modelObj)

    await tryUpdateProgress(
        jobId: claim.jobId,
        stage: "converting_glb",
        detail: "Extracting textures",
        progress: 0.95,
        config: config
    )
    _ = try runProcess("usdextract", args: ["-o", convertDir.path, modelUsdz.path])
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
        payload: ConversionCompleteRequest(glb_s3_key: upload.s3Key, glb_url: upload.publicUrl),
        config: config
    )
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
