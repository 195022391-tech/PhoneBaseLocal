import Foundation
import UIKit
import Darwin

/// 通过私有 IOHID 注入触控 / 键盘 / Unicode 文本。
/// 需 TrollStore 等可携带 HID entitlement 的安装方式；普通企业签通常无效。
/// API 以 `dlsym` 动态解析，避免正式 SDK 链接失败。
final class IOHIDTouchInjector: TouchInjector {
    private let client: OpaquePointer?
    private let lock = NSLock()
    private var touching = false
    private var lastX: Double = 0.5
    private var lastY: Double = 0.5
    private let senderID: UInt64 = 0x8000_0000_0000_1234

    private let createDigitizer: CreateDigitizerFn?
    private let createFinger: CreateFingerFn?
    private let appendEvent: AppendEventFn?
    private let setInteger: SetIntegerFn?
    private let setSender: SetSenderFn?
    private let createKeyboard: CreateKeyboardFn?
    private let createUnicode: CreateUnicodeFn?
    private let dispatch: DispatchFn?

    /// 符号齐全且 client 创建成功才可用。
    let isAvailable: Bool

    static func makeIfPossible() -> IOHIDTouchInjector? {
        let inj = IOHIDTouchInjector()
        return inj.isAvailable ? inj : nil
    }

    private init() {
        typealias CreateClientFn = @convention(c) (CFAllocator?, UInt32) -> OpaquePointer?

        let createClient: CreateClientFn? = Self.sym("IOHIDEventSystemClientCreate")
        createDigitizer = Self.sym("IOHIDEventCreateDigitizerEvent")
        createFinger = Self.sym("IOHIDEventCreateDigitizerFingerEvent")
        appendEvent = Self.sym("IOHIDEventAppendEvent")
        setInteger = Self.sym("IOHIDEventSetIntegerValue")
        setSender = Self.sym("IOHIDEventSetSenderID")
        createKeyboard = Self.sym("IOHIDEventCreateKeyboardEvent")
        createUnicode = Self.sym("IOHIDEventCreateUnicodeEvent")
        dispatch = Self.sym("IOHIDEventSystemClientDispatchEvent")

        let ok =
            createClient != nil
            && createDigitizer != nil
            && createFinger != nil
            && appendEvent != nil
            && setInteger != nil
            && createKeyboard != nil
            && createUnicode != nil
            && dispatch != nil

        if ok, let createClient {
            client = createClient(kCFAllocatorDefault, 1) // kIOHIDEventSystemClientTypePassive ≈ 1
        } else {
            client = nil
        }
        isAvailable = ok && client != nil
        if isAvailable {
            NSLog("[IOHID] injector ready")
        } else {
            NSLog("[IOHID] symbols/client unavailable — fallback required")
        }
    }

    deinit {
        // IOHIDEventSystemClient 无公开 Release；进程退出由系统回收。
    }

    // MARK: - TouchInjector

    func pointer(action: String, x: Double, y: Double) {
        guard isAvailable else { return }
        let nx = min(max(x, 0), 1)
        let ny = min(max(y, 0), 1)
        lock.lock()
        defer { lock.unlock() }

        switch action {
        case "down":
            touching = true
            lastX = nx
            lastY = ny
            postDigitizer(x: nx, y: ny, touching: true, moving: false)
        case "move":
            guard touching else { return }
            lastX = nx
            lastY = ny
            postDigitizer(x: nx, y: ny, touching: true, moving: true)
        case "up", "cancel":
            let was = touching
            touching = false
            if was {
                postDigitizer(x: lastX, y: lastY, touching: false, moving: false)
            }
        default:
            break
        }
    }

    func pressHome() {
        // Consumer Control · Menu/Home（0x0C / 0x40），按下再抬起
        postKeyboard(usagePage: 0x0C, usage: 0x40, down: true)
        usleep(30_000)
        postKeyboard(usagePage: 0x0C, usage: 0x40, down: false)
    }

    func injectText(_ text: String) {
        guard isAvailable, !text.isEmpty else { return }
        // 优先 Unicode 事件整段注入；失败再逐字键盘（仅 ASCII）
        if postUnicode(text) { return }
        for ch in text {
            if ch == "\n" || ch == "\r" {
                injectKey("enter")
                continue
            }
            if ch == "\t" {
                injectKey("tab")
                continue
            }
            let s = String(ch)
            if !postUnicode(s), let usage = Self.asciiUsage(ch) {
                postKeyboard(usagePage: 0x07, usage: usage, down: true)
                usleep(8_000)
                postKeyboard(usagePage: 0x07, usage: usage, down: false)
                usleep(4_000)
            } else {
                usleep(6_000)
            }
        }
    }

    func injectKey(_ key: String) {
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
        usleep(20_000)
        postKeyboard(usagePage: page, usage: usage, down: false)
    }

    // MARK: - HID posts

    private func postDigitizer(x: Double, y: Double, touching: Bool, moving: Bool) {
        guard
            let client,
            let createDigitizer,
            let createFinger,
            let appendEvent,
            let setInteger,
            let dispatch
        else { return }

        let ts = mach_absolute_time()
        // transducerType hand=0；eventMask 触控相关位用常见组合
        let eventMask: UInt32 = touching ? 0x0000_003B : 0x0000_0001
        let digitizer = createDigitizer(
            kCFAllocatorDefault,
            ts,
            0, // hand
            0, // index
            0, // identity
            eventMask,
            0, // buttonMask
            x,
            y,
            0, // z
            touching ? 0.5 : 0,
            0,
            0,
            touching ? 1 : 0,
            touching ? 1 : 0,
            0
        )
        guard let digitizer else { return }

        let finger = createFinger(
            kCFAllocatorDefault,
            ts,
            1, // index
            2, // identity
            eventMask,
            x,
            y,
            0,
            touching ? 0.5 : 0,
            0,
            0,
            touching ? 1 : 0,
            touching ? 1 : 0,
            0
        )
        if let finger {
            appendEvent(digitizer, finger)
        }

        // display type / built-in display — 字段值依系统版本可能需微调
        setInteger(digitizer, 0xB0017, 1) // kIOHIDEventFieldDigitizerDisplayType 经验值
        if let setSender {
            setSender(digitizer, senderID)
        }
        _ = moving // 保留语义；系统靠 touch/range 位区分
        dispatch(client, digitizer)
    }

    private func postKeyboard(usagePage: UInt32, usage: UInt32, down: Bool) {
        guard let client, let createKeyboard, let dispatch else { return }
        let ts = mach_absolute_time()
        guard let event = createKeyboard(kCFAllocatorDefault, ts, usagePage, usage, down ? 1 : 0, 0) else { return }
        if let setSender {
            setSender(event, senderID)
        }
        dispatch(client, event)
    }

    @discardableResult
    private func postUnicode(_ text: String) -> Bool {
        guard let client, let createUnicode, let dispatch else { return false }
        let ts = mach_absolute_time()
        // 常见原型：CreateUnicodeEvent(allocator, timeStamp, chars, length, flags, options)
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
        return true
    }

    // MARK: - Helpers

    private static func asciiUsage(_ ch: Character) -> UInt32? {
        guard let v = ch.asciiValue else { return nil }
        switch v {
        case 0x30: return 0x27 // 0
        case 0x31 ... 0x39: return UInt32(0x1E + (v - 0x31)) // 1-9
        case 0x61 ... 0x7A: return UInt32(0x04 + (v - 0x61)) // a-z
        case 0x41 ... 0x5A: return UInt32(0x04 + (v - 0x41)) // A-Z（不带 shift，部分输入框仍可收）
        case 0x20: return 0x2C // space
        case 0x2D: return 0x2D // -
        case 0x3D: return 0x2E // =
        case 0x5B: return 0x2F // [
        case 0x5D: return 0x30 // ]
        case 0x5C: return 0x31 // \
        case 0x3B: return 0x33 // ;
        case 0x27: return 0x34 // '
        case 0x60: return 0x35 // `
        case 0x2C: return 0x36 // ,
        case 0x2E: return 0x37 // .
        case 0x2F: return 0x38 // /
        default: return nil
        }
    }

    private static func sym<T>(_ name: String) -> T? {
        guard let p = dlsym(UnsafeMutableRawPointer(bitPattern: -2), name) else { return nil } // RTLD_DEFAULT
        return unsafeBitCast(p, to: T.self)
    }
}

// MARK: - C function types（与 IOKit 私有原型对齐的常用形态）

private typealias CreateDigitizerFn = @convention(c) (
    CFAllocator?, UInt64, UInt32, UInt32, UInt32, UInt32, UInt32,
    Double, Double, Double, Double, Double, Double, Int32, Int32, UInt32
) -> OpaquePointer?

private typealias CreateFingerFn = @convention(c) (
    CFAllocator?, UInt64, UInt32, UInt32, UInt32,
    Double, Double, Double, Double, Double, Double, Int32, Int32, UInt32
) -> OpaquePointer?

private typealias AppendEventFn = @convention(c) (OpaquePointer?, OpaquePointer?) -> Void
private typealias SetIntegerFn = @convention(c) (OpaquePointer?, UInt32, Int64) -> Void
private typealias SetSenderFn = @convention(c) (OpaquePointer?, UInt64) -> Void
private typealias CreateKeyboardFn = @convention(c) (
    CFAllocator?, UInt64, UInt32, UInt32, UInt32, UInt32
) -> OpaquePointer?
private typealias CreateUnicodeFn = @convention(c) (
    CFAllocator?, UInt64, UnsafePointer<UInt16>?, UInt16, UInt32, UInt32
) -> OpaquePointer?
private typealias DispatchFn = @convention(c) (OpaquePointer?, OpaquePointer?) -> Void
