import Foundation

/// 对齐官方 wall/foreground 画质档：`/video?profile=wall&maxDimension=&frameRate=` + `/api/video-settings`
struct VideoStreamProfile: Hashable {
    var profile: String // foreground | wall
    var maxDimension: Int // 0 = 全分辨率
    var frameRate: Int
    var bitrateBps: Int

    static let foregroundDefault = VideoStreamProfile(
        profile: "foreground",
        maxDimension: 0,
        frameRate: 60,
        bitrateBps: 6_000_000
    )

    var key: String {
        if profile == "wall" {
            return "wall:\(maxDimension)@\(frameRate)@\(bitrateBps)"
        }
        return "fg:\(frameRate)@\(bitrateBps)"
    }

    var isWall: Bool { profile == "wall" }

    static func from(query: [String: String], defaults: VideoStreamProfile) -> VideoStreamProfile {
        let rawProfile = (query["profile"] ?? "foreground").lowercased()
        if rawProfile != "wall" {
            return defaults
        }
        let dim = clamp(Int(query["maxDimension"] ?? "") ?? 384, 128, 1280)
        let fps = Int(query["frameRate"] ?? "") ?? 15
        let frameRate = fps >= 20 ? 20 : 15
        let bitrate: Int
        if let mbps = Double(query["bitrateMbps"] ?? "") {
            bitrate = Int(mbps * 1_000_000)
        } else if let bps = Int(query["bitrateBps"] ?? "") {
            bitrate = bps
        } else {
            bitrate = dim >= 768 ? 4_000_000 : dim >= 512 ? 2_500_000 : 1_500_000
        }
        return VideoStreamProfile(
            profile: "wall",
            maxDimension: dim,
            frameRate: frameRate,
            bitrateBps: clamp(bitrate, 400_000, 20_000_000)
        )
    }

    static func from(json: [String: Any], current: VideoStreamProfile) -> VideoStreamProfile {
        var next = current
        if let p = json["profile"] as? String, p.lowercased() == "wall" {
            next.profile = "wall"
        } else if json["profile"] != nil {
            next.profile = "foreground"
            next.maxDimension = 0
        }
        if let d = intVal(json["maxDimension"]) {
            next.maxDimension = next.profile == "wall" ? clamp(d, 128, 1280) : 0
        }
        if let f = intVal(json["frameRate"]) {
            next.frameRate = clamp(f, 5, 60)
        }
        if let mbps = numVal(json["bitrateMbps"]) {
            next.bitrateBps = clamp(Int(mbps * 1_000_000), 400_000, 20_000_000)
        } else if let bps = intVal(json["bitrateBps"]) {
            next.bitrateBps = clamp(bps, 400_000, 20_000_000)
        }
        return next
    }

    var json: [String: Any] {
        [
            "profile": profile,
            "maxDimension": maxDimension,
            "frameRate": frameRate,
            "bitrateBps": bitrateBps,
            "bitrateMbps": Double(bitrateBps) / 1_000_000.0,
        ]
    }

    /// 在源尺寸上按 maxDimension 等比缩小（偶数）
    func encodeSize(sourceW: Int, sourceH: Int) -> (Int, Int) {
        let w0 = max(2, sourceW - (sourceW % 2))
        let h0 = max(2, sourceH - (sourceH % 2))
        guard isWall, maxDimension > 0 else { return (w0, h0) }
        let longEdge = max(w0, h0)
        if longEdge <= maxDimension { return (w0, h0) }
        let scale = Double(maxDimension) / Double(longEdge)
        var w = Int((Double(w0) * scale).rounded(.down))
        var h = Int((Double(h0) * scale).rounded(.down))
        w = max(2, w - (w % 2))
        h = max(2, h - (h % 2))
        return (w, h)
    }

    private static func clamp(_ v: Int, _ lo: Int, _ hi: Int) -> Int {
        min(hi, max(lo, v))
    }

    private static func intVal(_ any: Any?) -> Int? {
        if let i = any as? Int { return i }
        if let n = any as? NSNumber { return n.intValue }
        if let s = any as? String { return Int(s) }
        return nil
    }

    private static func numVal(_ any: Any?) -> Double? {
        if let d = any as? Double { return d }
        if let n = any as? NSNumber { return n.doubleValue }
        if let s = any as? String { return Double(s) }
        return nil
    }
}

/// 全局默认（foreground /api/video-settings）；墙流以 WS query 为准
final class VideoSettingsStore {
    static let shared = VideoSettingsStore()
    private let lock = NSLock()
    private var _defaults = VideoStreamProfile.foregroundDefault
    private var generation = 1

    var defaults: VideoStreamProfile {
        lock.lock(); defer { lock.unlock() }
        return _defaults
    }

    var status: [String: Any] {
        lock.lock(); defer { lock.unlock() }
        var j = _defaults.json
        j["generation"] = generation
        j["protocol"] = "phonebase-video-settings"
        return j
    }

    @discardableResult
    func apply(_ next: VideoStreamProfile) -> VideoStreamProfile {
        lock.lock()
        // /api/video-settings 只改默认 foreground 码率/帧率；墙流仍看 WS query
        _defaults = VideoStreamProfile(
            profile: "foreground",
            maxDimension: 0,
            frameRate: next.frameRate,
            bitrateBps: next.bitrateBps
        )
        generation += 1
        let out = _defaults
        lock.unlock()
        return out
    }
}
