import Foundation
import UIKit
import Darwin

/// tipa(TrollVNC/STHID) 同款：Hand+Finger digitizer，专用队列派发，move 合并，避免堵死 /control。
final class IOHIDTouchInjector: TouchInjector {
    private let client: OpaquePointer?
    private let queue = DispatchQueue(label: "cn.local.phonebase.hid")
    private var touching = false
    private var lastX: Double = 0.5
    private var lastY: Double = 0.5
    private var pendingMove: (Double, Double)?
    private var moveScheduled = false
    private let senderID: UInt64 = 0x8000_0008_1731_9372

    private let createDigitizer: CreateDigitizerFn?
    private let createFinger: CreateFingerFn?
    private let appendEvent: AppendEventFn?
    private let setInteger: SetIntegerFn?
    private let setSender: SetSenderFn?
    private let createKeyboard: CreateKeyboardFn?
    private let createUnicode: CreateUnicodeFn?
    private let dispatch: DispatchFn?
    private let release: ReleaseFn?

    let isAvailable: Bool

    private static let transducerHand: UInt32 = 3
    private static let fingerIndex: UInt32 = 1
    private static let fingerIdentity: UInt32 = 2
    private static let digRange: UInt32 = 0x0000_0001
    private static let digTouch: UInt32 = 0x0000_0002
    private static let digPosition: UInt32 = 0x0000_0004
    private static let digAttribute: UInt32 = 0x0000_0008
    private static let digIdentity: UInt32 = 0x0000_0020
    private static let fieldDisplayIntegrated: UInt32 = (11 << 16) | 25

    static func makeIfPossible() -> IOHIDTouchInjector? {
        let inj = IOHIDTouchInjector()
        return inj.isAvailable ? inj : nil
    }

    private init() {
        _ = dlopen("/System/Library/Frameworks/IOKit.framework/IOKit", RTLD_NOW)

        typealias CreateClientTypedFn = @convention(c) (CFAllocator?, UInt32) -> OpaquePointer?

        createDigitizer = Self.sym("IOHIDEventCreateDigitizerEvent")
        createFinger = Self.sym("IOHIDEventCreateDigitizerFingerEvent")
        appendEvent = Self.sym("IOHIDEventAppendEvent")
        setInteger = Self.sym("IOHIDEventSetIntegerValue")
        setSender = Self.sym("IOHIDEventSetSenderID")
        createKeyboard = Self.sym("IOHIDEventCreateKeyboardEvent")
        createUnicode = Self.sym("IOHIDEventCreateUnicodeEvent")
        dispatch = Self.sym("IOHIDEventSystemClientDispatchEvent")
        release = Self.sym("CFRelease")

        var clientRef: OpaquePointer?
        if let createTyped: CreateClientTypedFn = Self.sym("IOHIDEventSystemClientCreate") {
            clientRef = createTyped(kCFAllocatorDefault, 1)
        }

        let ok =
            createDigitizer != nil
            && createFinger != nil
            && appendEvent != nil
            && setInteger != nil
            && createKeyboard != nil
            && createUnicode != nil
            && dispatch != nil
            && clientRef != nil

        client = clientRef
        isAvailable = ok
        NSLog(ok ? "[IOHID] ready (async queue)" : "[IOHID] unavailable")
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
            // 若仍按着屏，先抬起，避免手势状态卡住
            if self.touching {
                self.flushMoveLocked()
                self.postDigitizer(
                    x: self.lastX, y: self.lastY, range: false, touch: false,
                    mask: Self.digTouch | Self.digIdentity
                )
                self.touching = false
            }
            self.postKeyboard(usagePage: 0x0C, usage: 0x40, down: true)
            usleep(25_000)
            self.postKeyboard(usagePage: 0x0C, usage: 0x40, down: false)
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

    // MARK: - queue-only

    private func pointerLocked(action: String, x: Double, y: Double) {
        switch action {
        case "down":
            flushMoveLocked()
            touching = true
            lastX = x
            lastY = y
            // down: Range|Touch|Identity（WebKit Began）
            postDigitizer(
                x: x, y: y, range: true, touch: true,
                mask: Self.digRange | Self.digTouch | Self.digIdentity
            )
        case "move":
            guard touching else { return }
            lastX = x
            lastY = y
            pendingMove = (x, y)
            scheduleMoveFlushLocked()
        case "up", "cancel":
            flushMoveLocked()
            guard touching else { return }
            touching = false
            postDigitizer(
                x: lastX, y: lastY, range: false, touch: false,
                mask: Self.digRange | Self.digTouch | Self.digIdentity
            )
        default:
            break
        }
    }

    private func scheduleMoveFlushLocked() {
        guard !moveScheduled else { return }
        moveScheduled = true
        // ~90Hz 上限，滑动跟手且不堵 HID
        queue.asyncAfter(deadline: .now() + 0.011) { [weak self] in
            guard let self else { return }
            self.moveScheduled = false
            self.flushMoveLocked()
        }
    }

    private func flushMoveLocked() {
        guard let (x, y) = pendingMove else { return }
        pendingMove = nil
        guard touching else { return }
        // move: Position|Attribute（WebKit Moved；触摸位保持在 range/touch 参数）
        postDigitizer(
            x: x, y: y, range: true, touch: true,
            mask: Self.digPosition | Self.digAttribute
        )
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

    private func postDigitizer(x: Double, y: Double, range: Bool, touch: Bool, mask: UInt32) {
        guard
            let client,
            let createDigitizer,
            let createFinger,
            let appendEvent,
            let setInteger,
            let dispatch
        else { return }

        let ts = mach_absolute_time()
        let rangeI: Int32 = range ? 1 : 0
        let touchI: Int32 = touch ? 1 : 0
        // 轻压，部分系统对 0 压忽略 move
        let pressure: Double = touch ? 0.5 : 0

        guard let parent = createDigitizer(
            kCFAllocatorDefault, ts,
            Self.transducerHand, 0, 0, mask, 0,
            0, 0, 0, 0, 0, // parent 坐标置 0（WebKit 路径）
            rangeI, touchI, 0
        ) else { return }

        setInteger(parent, Self.fieldDisplayIntegrated, 1)

        if let finger = createFinger(
            kCFAllocatorDefault, ts,
            Self.fingerIndex, Self.fingerIdentity, mask,
            x, y, 0, pressure, 0,
            rangeI, touchI, 0
        ) {
            setInteger(finger, Self.fieldDisplayIntegrated, 1)
            appendEvent(parent, finger, 0)
            release?(UnsafeRawPointer(finger))
        }

        if let setSender {
            setSender(parent, senderID)
        }
        dispatch(client, parent)
        release?(UnsafeRawPointer(parent))
    }

    private func postKeyboard(usagePage: UInt32, usage: UInt32, down: Bool) {
        guard let client, let createKeyboard, let dispatch else { return }
        let ts = mach_absolute_time()
        guard let event = createKeyboard(kCFAllocatorDefault, ts, usagePage, usage, down ? 1 : 0, 0) else { return }
        if let setSender {
            setSender(event, senderID)
        }
        dispatch(client, event)
        release?(UnsafeRawPointer(event))
    }

    @discardableResult
    private func postUnicode(_ text: String) -> Bool {
        guard let client, let createUnicode, let dispatch else { return false }
        let ts = mach_absolute_time()
        let utf16 = Array(text.utf16)
        guard !utf16.isEmpty else { return false }
        let event = utf16.withUnsafeBufferPointer { buf -> OpaquePointer? in
            createUnicode(kCFAllocatorDefault, ts, buf.baseAddress, UInt16(min(buf.count, Int(UInt16.max))), 0, 0)
        }
        guard let event else { return false }
        if let setSender {
            setSender(event, senderID)
        }
        dispatch(client, event)
        release?(UnsafeRawPointer(event))
        return true
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
private typealias SetSenderFn = @convention(c) (OpaquePointer?, UInt64) -> Void
private typealias CreateKeyboardFn = @convention(c) (
    CFAllocator?, UInt64, UInt32, UInt32, UInt32, UInt32
) -> OpaquePointer?
private typealias CreateUnicodeFn = @convention(c) (
    CFAllocator?, UInt64, UnsafePointer<UInt16>?, UInt16, UInt32, UInt32
) -> OpaquePointer?
private typealias DispatchFn = @convention(c) (OpaquePointer?, OpaquePointer?) -> Void
private typealias ReleaseFn = @convention(c) (UnsafeRawPointer?) -> Void
