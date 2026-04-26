import Foundation

public enum RemoteClawCapability: String, Codable, Sendable {
    case canvas
    case browser
    case camera
    case screen
    case voiceWake
    case location
    case device
    case watch
    case photos
    case contacts
    case calendar
    case reminders
    case motion
}
