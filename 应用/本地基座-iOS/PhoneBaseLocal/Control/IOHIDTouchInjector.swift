import Foundation
import UIKit
import Darwin

/// 对齐 tipa `STHIDEventGenerator`（OwnGoalStudio/TrollVNC）digitizer / Home 路径。
final class IOHIDTouchInjector: TouchInjector {
    private let client: OpaquePointer?
    private let queue = DispatchQueue(label: "cn.local.phonebase.hid-events", qos: .userInteractive)
    private var touching = false
    private var lastX: Double = 0.5
    private var lastY: Double = 0.5
    /// tipa fingerIdentifiers[0]
    private let fingerId: UInt32 = 2
    private let senderID: UInt64 = 0x8000_0008_1731_9371

    private let createDigitizer: CreateDigitizerFn?
    private let createFinger: CreateFingerFn?
    private let appendEvent: AppendEventFn?
    private let setInteger: SetIntegerFn?
    private let setFloat: SetFloatFn?
    private let setSender: SetSenderFn?
    private let createKeyboard: CreateKeyboardFn?
    private let createUnicode: CreateUnicodeFn?
    private let dispatchFn: DispatchFn?
    private let retainFn: RetainFn?
    private let releaseFn: ReleaseFn?

    let isAvailable: Bool

    // tipa include-spi/IOKitSPI.h
    private static let transducerHand: UInt32 = 3
    private static let digTouch: UInt32 = 1 << 1
    private static let digPosition: UInt32 = 1 << 2
    private static let digIdentity: UInt32 = 1 << 5
    private static let digAttribute: UInt32 = 1 << 6
    private static let fieldIsBuiltIn: UInt32 = 4
    private static let fieldDisplayIntegrated: UInt32 = (11 << 16) | 25
    private static let fieldMajorRadius: UInt32 = (11 << 16) | 20
    private static let fieldMinorRadius: UInt32 = (11 << 16) | 21
    private static let defaultMajorRadius: Double = 5
    private static let defaultPathPressure: Double = 0
    private static let defaultTwist: Double = 90

    static func makeIfPossible() -> IOHIDTouchInjector? {
        let inj = IOHIDTouchInjector()
        return inj.isAvailable ? inj : nil
    }

    private init() {
        _ = dlopen("/System/Library/Frameworks/IOKit.framework/IOKit", RTLD_NOW)

        typealias CreateClientFn = @convention(c) (CFAllocator?) -> OpaquePointer?

        createDigitizer = Self.sym("IOHIDEventCreateDigitizerEvent")
        createFinger = Self.sym("IOHIDEventCreateDigitizerFingerEvent")
        appendEvent = Self.sym("IOHIDEventAppendEvent")
        setInteger = Self.sym("IOHIDEventSetIntegerValue")
        setFloat = Self.sym("IOHIDEventSetFloatValue")
        setSender = Self.sym("IOHIDEventSetSenderID")
        createKeyboard = Self.sym("IOHIDEventCreateKeyboardEvent")
        createUnicode = Self.sym("IOHIDEventCreateUnicodeEvent")
        dispatchFn = Self.sym("IOHIDEventSystemClientDispatchEvent")
        retainFn = Self.sym("CFRetain")
        releaseFn = Self.sym("CFRelease")

        var clientRef: OpaquePointer?
        if let create: CreateClientFn = Self.sym("IOHIDEventSystemClientCreate") {
            // tipa: 单参数 Create(allocator)
            clientRef = create(kCFAllocatorDefault)
        }

        let ok =
            createDigitizer != nil
            && createFinger != nil
            && appendEvent != nil
            && setInteger != nil
            && setFloat != nil
            && createKeyboard != nil
            && createUnicode != nil
            && dispatchFn != nil
            && clientRef != nil

        client = clientRef
        isAvailable = ok
        NSLog(ok ? "[IOHID] ready (tipa STHID path)" : "[IOHID] unavailable")
    }

    func pointer(action: String, x: Double, y: Double) {
        guard isAvailable else { return }
        let nx = min(max(x, 0), 1)
        let ny = min(max(y, 0), 1)
        queue.async { [weak self] in
            self?.pointerLocked(action: action, x: nx, y: ny)
        }
    }

    func pressHome() {
        guard isAvailable else { return }
        queue.async { [weak self] in
            guard let self else { return }
            if self.touching {
                self.postHand(phase: .lifted, x: self.lastX, y: self.lastY)
                self.touching = false
            }
            // tipa menuDown
            self.postKeyboard(usagePage: 0x0C, usage: 0x40, down: true)
        }
        // tipa menuUp（与 down 拆开，避免堵控制线程）
        queue.asyncAfter(deadline: .now() + 0.05) { [weak self] in
            self?.postKeyboard(usagePage: 0x0C, usage: 0x40, down: false)
        }
    }

    func injectText(_ text: String) {
        guard isAvailable, !text.isEmpty else { return }
        queue.async { [weak self] in
            guard let self else { return }
            if self.postUnicode(text) { return }
            for ch in text {
                if ch == "\n" || ch == "\r" {
                    self.injectKeyLocked("enter")
                    continue
                }
                if ch == "\t" {
                    self.injectKeyLocked("tab")
                    continue
                }
                let s = String(ch)
                if !self.postUnicode(s), let usage = Self.asciiUsage(ch) {
                    self.postKeyboard(usagePage: 0x07, usage: usage, down: true)
                    usleep(6_000)
                    self.postKeyboard(usagePage: 0x07, usage: usage, down: false)
                    usleep(3_000)
                }
            }
        }
    }

    func injectKey(_ key: String) {
        guard isAvailable else { return }
        queue.async { [weak self] in self?.injectKeyLocked(key) }
    }

    private enum Phase { case touched, moved, lifted }

    private func pointerLocked(action: String, x: Double, y: Double) {
        switch action {
        case "down":
            touching = true
            lastX = x
            lastY = y
            postHand(phase: .touched, x: x, y: y)
        case "move":
            guard touching else { return }
            lastX = x
            lastY = y
            postHand(phase: .moved, x: x, y: y)
        case "up", "cancel":
            guard touching else { return }
            touching = false
            lastX = x
            lastY = y
            postHand(phase: .lifted, x: x, y: y)
        default:
            break
        }
    }

    /// tipa `-[STHIDEventGenerator _createIOHIDEventType:]`
    private func postHand(phase: Phase, x: Double, y: Double) {
        guard
            let createDigitizer,
            let createFinger,
            let appendEvent,
            let setInteger,
            let setFloat
        else { return }

        let isTouching = (phase == .touched || phase == .moved)

        var eventMask: UInt32 = Self.digTouch
        switch phase {
        case .moved:
            eventMask &= ~Self.digTouch
            eventMask |= Self.digPosition
            eventMask |= Self.digAttribute
        case .touched, .lifted:
            eventMask |= Self.digIdentity
        }

        let ts = mach_absolute_time()

        // parent: coords 全 0；range 恒 0；touch = isTouching
        guard let parent = createDigitizer(
            kCFAllocatorDefault, ts,
            Self.transducerHand, 0, 0, eventMask, 0,
            0, 0, 0, 0, 0,
            0, isTouching ? 1 : 0, 0
        ) else { return }

        setInteger(parent, Self.fieldIsBuiltIn, 1)
        setInteger(parent, Self.fieldDisplayIntegrated, 1)

        // tipa: InRange=1<<0, InTouch=1<<1
        let proximity: UInt8 = isTouching ? 0x03 : 0
        let rangeBit: Int32 = (proximity & 0x01) != 0 ? 1 : 0
        let touchBit: Int32 = (proximity & 0x02) != 0 ? 1 : 0
        let pressure = isTouching ? Self.defaultPathPressure : 0
        let radius = isTouching ? Self.defaultMajorRadius : 0

        if let finger = createFinger(
            kCFAllocatorDefault, ts,
            fingerId, fingerId, eventMask,
            x, y, 0,
            pressure,
            Self.defaultTwist,
            rangeBit, touchBit, 0
        ) {
            setFloat(finger, Self.fieldMinorRadius, radius)
            setFloat(finger, Self.fieldMajorRadius, radius)
            appendEvent(parent, finger, 0)
            releaseFn?(UnsafeRawPointer(finger))
        }

        sendEvent(parent)
    }

    private func injectKeyLocked(_ key: String) {
        let map: [String: (UInt32, UInt32)] = [
            "backspace": (0x07, 0x2A),
            "enter": (0x07, 0x28),
            "tab": (0x07, 0x2B),
            "escape": (0x07, 0x29),
            "left": (0x07, 0x50),
            "right": (0x07, 0x4F),
            "up": (0x07, 0x52),
            "down": (0x07, 0x51),
        ]
        guard let (page, usage) = map[key] else { return }
        postKeyboard(usagePage: page, usage: usage, down: true)
        usleep(15_000)
        postKeyboard(usagePage: page, usage: usage, down: false)
    }

    private func postKeyboard(usagePage: UInt32, usage: UInt32, down: Bool) {
        guard let createKeyboard else { return }
        let ts = mach_absolute_time()
        guard let event = createKeyboard(kCFAllocatorDefault, ts, usagePage, usage, down ? 1 : 0, 0) else { return }
        sendEvent(event)
    }

    @discardableResult
    private func postUnicode(_ text: String) -> Bool {
        guard let createUnicode else { return false }
        let ts = mach_absolute_time()
        let utf16 = Array(text.utf16)
        guard !utf16.isEmpty else { return false }
        let event = utf16.withUnsafeBufferPointer { buf -> OpaquePointer? in
            createUnicode(kCFAllocatorDefault, ts, buf.baseAddress, UInt16(min(buf.count, Int(UInt16.max))), 0, 0)
        }
        guard let event else { return false }
        sendEvent(event)
        return true
    }

    /// tipa `_sendHIDEvent`：Retain → queue 上 SetSenderID+Dispatch → Release
    private func sendEvent(_ event: OpaquePointer) {
        guard let client, let dispatchFn else {
            releaseFn?(UnsafeRawPointer(event))
            return
        }
        let strong: OpaquePointer
        if let retainFn {
            strong = OpaquePointer(retainFn(UnsafeRawPointer(event)))
        } else {
            strong = event
        }
        let releaseFn = self.releaseFn
        let setSender = self.setSender
        let senderID = self.senderID
        queue.async {
            if let setSender {
                setSender(strong, senderID)
            }
            dispatchFn(client, strong)
            releaseFn?(UnsafeRawPointer(strong))
        }
        releaseFn?(UnsafeRawPointer(event))
    }

    private static func asciiUsage(_ ch: Character) -> UInt32? {
        guard let v = ch.asciiValue else { return nil }
        switch v {
        case 0x30: return 0x27
        case 0x31 ... 0x39: return UInt32(0x1E + (v - 0x31))
        case 0x61 ... 0x7A: return UInt32(0x04 + (v - 0x61))
        case 0x41 ... 0x5A: return UInt32(0x04 + (v - 0x41))
        case 0x20: return 0x2C
        case 0x2D: return 0x2D
        case 0x3D: return 0x2E
        case 0x5B: return 0x2F
        case 0x5D: return 0x30
        case 0x5C: return 0x31
        case 0x3B: return 0x33
        case 0x27: return 0x34
        case 0x60: return 0x35
        case 0x2C: return 0x36
        case 0x2E: return 0x37
        case 0x2F: return 0x38
        default: return nil
        }
    }

    private static func sym<T>(_ name: String) -> T? {
        guard let p = dlsym(UnsafeMutableRawPointer(bitPattern: -2), name) else { return nil }
        return unsafeBitCast(p, to: T.self)
    }
}

private typealias CreateDigitizerFn = @convention(c) (
    CFAllocator?, UInt64, UInt32, UInt32, UInt32, UInt32, UInt32,
    Double, Double, Double, Double, Double, Int32, Int32, UInt32
) -> OpaquePointer?

private typealias CreateFingerFn = @convention(c) (
    CFAllocator?, UInt64, UInt32, UInt32, UInt32,
    Double, Double, Double, Double, Double, Int32, Int32, UInt32
) -> OpaquePointer?

private typealias AppendEventFn = @convention(c) (OpaquePointer?, OpaquePointer?, UInt32) -> Void
private typealias SetIntegerFn = @convention(c) (OpaquePointer?, UInt32, Int64) -> Void
private typealias SetFloatFn = @convention(c) (OpaquePointer?, UInt32, Double) -> Void
private typealias SetSenderFn = @convention(c) (OpaquePointer?, UInt64) -> Void
private typealias CreateKeyboardFn = @convention(c) (
    CFAllocator?, UInt64, UInt32, UInt32, UInt32, UInt32
) -> OpaquePointer?
private typealias CreateUnicodeFn = @convention(c) (
    CFAllocator?, UInt64, UnsafePointer<UInt16>?, UInt16, UInt32, UInt32
) -> OpaquePointer?
private typealias DispatchFn = @convention(c) (OpaquePointer?, OpaquePointer?) -> Void
private typealias RetainFn = @convention(c) (UnsafeRawPointer?) -> UnsafeRawPointer
private typealias ReleaseFn = @convention(c) (UnsafeRawPointer?) -> Void
