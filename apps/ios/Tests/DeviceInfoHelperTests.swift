import Foundation
import Testing
@testable import RemoteClaw

struct DeviceInfoHelperTests {
    @Test func `iOS version display omits platform prefix`() {
        let version = OperatingSystemVersion(majorVersion: 26, minorVersion: 5, patchVersion: 0)

        #expect(DeviceInfoHelper.iOSVersionStringForDisplay(version) == "26.5.0")
    }
}
