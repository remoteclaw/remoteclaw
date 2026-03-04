import CoreLocation
import Foundation
import RemoteClawKit
import UIKit

protocol CameraServicing: Sendable {
    func listDevices() async -> [CameraController.CameraDeviceInfo]
    func snap(params: RemoteClawCameraSnapParams) async throws -> (format: String, base64: String, width: Int, height: Int)
    func clip(params: RemoteClawCameraClipParams) async throws -> (format: String, base64: String, durationMs: Int, hasAudio: Bool)
}

protocol ScreenRecordingServicing: Sendable {
    func record(
        screenIndex: Int?,
        durationMs: Int?,
        fps: Double?,
        includeAudio: Bool?,
        outPath: String?) async throws -> String
}

@MainActor
protocol LocationServicing: Sendable {
    func authorizationStatus() -> CLAuthorizationStatus
    func accuracyAuthorization() -> CLAccuracyAuthorization
    func ensureAuthorization(mode: RemoteClawLocationMode) async -> CLAuthorizationStatus
    func currentLocation(
        params: RemoteClawLocationGetParams,
        desiredAccuracy: RemoteClawLocationAccuracy,
        maxAgeMs: Int?,
        timeoutMs: Int?) async throws -> CLLocation
    func startLocationUpdates(
        desiredAccuracy: RemoteClawLocationAccuracy,
        significantChangesOnly: Bool) -> AsyncStream<CLLocation>
    func stopLocationUpdates()
    func startMonitoringSignificantLocationChanges(onUpdate: @escaping @Sendable (CLLocation) -> Void)
    func stopMonitoringSignificantLocationChanges()
}

protocol DeviceStatusServicing: Sendable {
    func status() async throws -> RemoteClawDeviceStatusPayload
    func info() -> RemoteClawDeviceInfoPayload
}

protocol PhotosServicing: Sendable {
    func latest(params: RemoteClawPhotosLatestParams) async throws -> RemoteClawPhotosLatestPayload
}

protocol ContactsServicing: Sendable {
    func search(params: RemoteClawContactsSearchParams) async throws -> RemoteClawContactsSearchPayload
    func add(params: RemoteClawContactsAddParams) async throws -> RemoteClawContactsAddPayload
}

protocol CalendarServicing: Sendable {
    func events(params: RemoteClawCalendarEventsParams) async throws -> RemoteClawCalendarEventsPayload
    func add(params: RemoteClawCalendarAddParams) async throws -> RemoteClawCalendarAddPayload
}

protocol RemindersServicing: Sendable {
    func list(params: RemoteClawRemindersListParams) async throws -> RemoteClawRemindersListPayload
    func add(params: RemoteClawRemindersAddParams) async throws -> RemoteClawRemindersAddPayload
}

protocol MotionServicing: Sendable {
    func activities(params: RemoteClawMotionActivityParams) async throws -> RemoteClawMotionActivityPayload
    func pedometer(params: RemoteClawPedometerParams) async throws -> RemoteClawPedometerPayload
}

struct WatchMessagingStatus: Sendable, Equatable {
    var supported: Bool
    var paired: Bool
    var appInstalled: Bool
    var reachable: Bool
    var activationState: String
}

struct WatchQuickReplyEvent: Sendable, Equatable {
    var replyId: String
    var promptId: String
    var actionId: String
    var actionLabel: String?
    var sessionKey: String?
    var note: String?
    var sentAtMs: Int?
    var transport: String
}

struct WatchNotificationSendResult: Sendable, Equatable {
    var deliveredImmediately: Bool
    var queuedForDelivery: Bool
    var transport: String
}

protocol WatchMessagingServicing: AnyObject, Sendable {
    func status() async -> WatchMessagingStatus
    func setReplyHandler(_ handler: (@Sendable (WatchQuickReplyEvent) -> Void)?)
    func sendNotification(
        id: String,
        params: RemoteClawWatchNotifyParams) async throws -> WatchNotificationSendResult
}

extension CameraController: CameraServicing {}
extension ScreenRecordService: ScreenRecordingServicing {}
extension LocationService: LocationServicing {}
