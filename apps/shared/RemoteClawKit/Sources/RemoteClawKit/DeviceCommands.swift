import Foundation

public enum RemoteClawDeviceCommand: String, Codable, Sendable {
    case status = "device.status"
    case info = "device.info"
}

public enum RemoteClawBatteryState: String, Codable, Sendable {
    case unknown
    case unplugged
    case charging
    case full
}

public enum RemoteClawThermalState: String, Codable, Sendable {
    case nominal
    case fair
    case serious
    case critical
}

public enum RemoteClawNetworkPathStatus: String, Codable, Sendable {
    case satisfied
    case unsatisfied
    case requiresConnection
}

public enum RemoteClawNetworkInterfaceType: String, Codable, Sendable {
    case wifi
    case cellular
    case wired
    case other
}

public struct RemoteClawBatteryStatusPayload: Codable, Sendable, Equatable {
    public var level: Double?
    public var state: RemoteClawBatteryState
    public var lowPowerModeEnabled: Bool

    public init(level: Double?, state: RemoteClawBatteryState, lowPowerModeEnabled: Bool) {
        self.level = level
        self.state = state
        self.lowPowerModeEnabled = lowPowerModeEnabled
    }
}

public struct RemoteClawThermalStatusPayload: Codable, Sendable, Equatable {
    public var state: RemoteClawThermalState

    public init(state: RemoteClawThermalState) {
        self.state = state
    }
}

public struct RemoteClawStorageStatusPayload: Codable, Sendable, Equatable {
    public var totalBytes: Int64
    public var freeBytes: Int64
    public var usedBytes: Int64

    public init(totalBytes: Int64, freeBytes: Int64, usedBytes: Int64) {
        self.totalBytes = totalBytes
        self.freeBytes = freeBytes
        self.usedBytes = usedBytes
    }
}

public struct RemoteClawNetworkStatusPayload: Codable, Sendable, Equatable {
    public var status: RemoteClawNetworkPathStatus
    public var isExpensive: Bool
    public var isConstrained: Bool
    public var interfaces: [RemoteClawNetworkInterfaceType]

    public init(
        status: RemoteClawNetworkPathStatus,
        isExpensive: Bool,
        isConstrained: Bool,
        interfaces: [RemoteClawNetworkInterfaceType])
    {
        self.status = status
        self.isExpensive = isExpensive
        self.isConstrained = isConstrained
        self.interfaces = interfaces
    }
}

public struct RemoteClawDeviceStatusPayload: Codable, Sendable, Equatable {
    public var battery: RemoteClawBatteryStatusPayload
    public var thermal: RemoteClawThermalStatusPayload
    public var storage: RemoteClawStorageStatusPayload
    public var network: RemoteClawNetworkStatusPayload
    public var uptimeSeconds: Double

    public init(
        battery: RemoteClawBatteryStatusPayload,
        thermal: RemoteClawThermalStatusPayload,
        storage: RemoteClawStorageStatusPayload,
        network: RemoteClawNetworkStatusPayload,
        uptimeSeconds: Double)
    {
        self.battery = battery
        self.thermal = thermal
        self.storage = storage
        self.network = network
        self.uptimeSeconds = uptimeSeconds
    }
}

public struct RemoteClawDeviceInfoPayload: Codable, Sendable, Equatable {
    public var deviceName: String
    public var modelIdentifier: String
    public var systemName: String
    public var systemVersion: String
    public var appVersion: String
    public var appBuild: String
    public var locale: String

    public init(
        deviceName: String,
        modelIdentifier: String,
        systemName: String,
        systemVersion: String,
        appVersion: String,
        appBuild: String,
        locale: String)
    {
        self.deviceName = deviceName
        self.modelIdentifier = modelIdentifier
        self.systemName = systemName
        self.systemVersion = systemVersion
        self.appVersion = appVersion
        self.appBuild = appBuild
        self.locale = locale
    }
}
