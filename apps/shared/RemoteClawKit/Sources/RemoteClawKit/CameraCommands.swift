import Foundation

public enum RemoteClawCameraCommand: String, Codable, Sendable {
    case list = "camera.list"
    case snap = "camera.snap"
    case clip = "camera.clip"
}

public enum RemoteClawCameraFacing: String, Codable, Sendable {
    case back
    case front
}

public enum RemoteClawCameraImageFormat: String, Codable, Sendable {
    case jpg
    case jpeg
}

public enum RemoteClawCameraVideoFormat: String, Codable, Sendable {
    case mp4
}

public struct RemoteClawCameraSnapParams: Codable, Sendable, Equatable {
    public var facing: RemoteClawCameraFacing?
    public var maxWidth: Int?
    public var quality: Double?
    public var format: RemoteClawCameraImageFormat?
    public var deviceId: String?
    public var delayMs: Int?

    public init(
        facing: RemoteClawCameraFacing? = nil,
        maxWidth: Int? = nil,
        quality: Double? = nil,
        format: RemoteClawCameraImageFormat? = nil,
        deviceId: String? = nil,
        delayMs: Int? = nil)
    {
        self.facing = facing
        self.maxWidth = maxWidth
        self.quality = quality
        self.format = format
        self.deviceId = deviceId
        self.delayMs = delayMs
    }
}

public struct RemoteClawCameraClipParams: Codable, Sendable, Equatable {
    public var facing: RemoteClawCameraFacing?
    public var durationMs: Int?
    public var includeAudio: Bool?
    public var format: RemoteClawCameraVideoFormat?
    public var deviceId: String?

    public init(
        facing: RemoteClawCameraFacing? = nil,
        durationMs: Int? = nil,
        includeAudio: Bool? = nil,
        format: RemoteClawCameraVideoFormat? = nil,
        deviceId: String? = nil)
    {
        self.facing = facing
        self.durationMs = durationMs
        self.includeAudio = includeAudio
        self.format = format
        self.deviceId = deviceId
    }
}
