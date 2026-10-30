import Foundation
import CoreVideo
import CoreMedia
import CoreImage

final class FramePublisher {
    private let sourceW: Int
    private let sourceH: Int
    private let lock = NSLock()
    private var clients: [Client] = []
    private var lanes: [String: Lane] = [:]
    private var frameSerial: Int64 = 0
    var onTimestampUs: ((UInt64) -> Void)?

    /// 兼容 info.encoder 字段
    var encoderStats: [String: Any] {
        lock.lock(); defer { lock.unlock() }
        if let lane = lanes[VideoSettingsStore.shared.defaults.key] ?? lanes.values.first {
            var s = lane.encoder.stats
            s["lane"] = lane.profile.key
            s["clients"] = clients.count
            return s
        }
        return [
            "ready": false,
            "width": sourceW,
            "height": sourceH,
            "clients": clients.count,
        ]
    }

    private final class Client {
        let session: WebSocketSession
        var profile: VideoStreamProfile
        var congested = false
        init(session: WebSocketSession, profile: VideoStreamProfile) {
            self.session = session
            self.profile = profile
        }
    }

    private final class Lane {
        let profile: VideoStreamProfile
        let encodeW: Int
        let encodeH: Int
        let encoder: H264Encoder
        var lastConfig: Data?
        var lastEmitSerial: Int64 = 0
        weak var owner: FramePublisher?

        init(profile: VideoStreamProfile, sourceW: Int, sourceH: Int, owner: FramePublisher) {
            self.profile = profile
            let size = profile.encodeSize(sourceW: sourceW, sourceH: sourceH)
            self.encodeW = size.0
            self.encodeH = size.1
            self.encoder = H264Encoder(
                width: encodeW,
                height: encodeH,
                bitrateBps: profile.bitrateBps,
                frameRate: profile.frameRate
            )
            self.owner = owner
            encoder.onConfig = { [weak self] avcC in
                self?.lastConfig = avcC
                self?.owner?.broadcastConfig(avcC, laneKey: profile.key)
            }
            encoder.onFrame = { [weak self] avcc, keyframe, ts in
                self?.owner?.broadcastFrame(avcc: avcc, keyframe: keyframe, timestampUs: ts, laneKey: profile.key)
            }
            try? encoder.start()
        }
    }

    init(width: Int, height: Int) {
        sourceW = max(2, width - (width % 2))
        sourceH = max(2, height - (height % 2))
    }

    func attach(_ session: WebSocketSession, profile: VideoStreamProfile? = nil) {
        let p = profile ?? VideoSettingsStore.shared.defaults
        lock.lock()
        let client = Client(session: session, profile: p)
        clients.append(client)
        ensureLaneLocked(p)
        let lane = lanes[p.key]
        let cfg = lane?.lastConfig
        lock.unlock()

        session.sendText(#"{"type":"publisher","online":true}"#)
        if let cfg {
            _ = session.sendBinary(PHB1.packet(flags: .configuration, timestampUs: 0, payload: cfg))
        } else {
            lane?.encoder.resetConfigFlag()
        }
        lane?.encoder.forceKeyFrame()

        session.onClose = { [weak self, weak session] in
            guard let self, let session else { return }
            self.lock.lock()
            self.clients.removeAll { $0.session === session }
            self.pruneLanesLocked()
            self.lock.unlock()
        }
    }

    func detachAll() {
        lock.lock()
        let copy = clients
        clients.removeAll()
        let oldLanes = lanes
        lanes.removeAll()
        lock.unlock()
        copy.forEach { $0.session.close() }
        oldLanes.values.forEach { $0.encoder.stop() }
    }

    func setPublisherOnline(_ online: Bool) {
        let json = #"{"type":"publisher","online":\#(online ? "true" : "false")}"#
        lock.lock()
        let copy = clients
        if !online {
            for lane in lanes.values {
                lane.lastConfig = nil
                lane.encoder.resetConfigFlag()
            }
        }
        lock.unlock()
        copy.forEach { _ = $0.session.sendText(json) }
    }

    func encode(buffer: CVPixelBuffer, presentationTime: CMTime) {
        lock.lock()
        frameSerial += 1
        let serial = frameSerial
        let active = Dictionary(grouping: clients, by: { $0.profile.key })
        var work: [(Lane, Bool)] = [] // lane, shouldEncode
        for (key, group) in active {
            guard let lane = lanes[key] ?? ensureLaneLocked(group[0].profile) else { continue }
            let fps = max(5, lane.profile.frameRate)
            // 采集约 60fps；按档位抽帧
            let stride = max(1, Int((60.0 / Double(fps)).rounded()))
            let due = serial - lane.lastEmitSerial >= Int64(stride) || lane.lastEmitSerial == 0
            if due {
                lane.lastEmitSerial = serial
                work.append((lane, true))
            }
        }
        lock.unlock()

        for (lane, _) in work {
            let buf: CVPixelBuffer
            if CVPixelBufferGetWidth(buffer) == lane.encodeW,
               CVPixelBufferGetHeight(buffer) == lane.encodeH
            {
                buf = buffer
            } else if let scaled = PixelBufferScaler.scale(buffer, width: lane.encodeW, height: lane.encodeH) {
                buf = scaled
            } else {
                continue
            }
            lane.encoder.encode(buffer: buf, presentationTime: presentationTime)
        }
    }

    func requestKeyframe() {
        lock.lock()
        let all = Array(lanes.values)
        lock.unlock()
        all.forEach { $0.encoder.forceKeyFrame() }
    }

    /// memory-guard / video-settings：重建所有车道
    func recycleEncoder(reason: String) {
        NSLog("[Publisher] recycleEncoder %@", reason)
        lock.lock()
        let profiles = Array(Set(clients.map(\.profile)))
        let old = lanes
        lanes.removeAll()
        for p in profiles {
            _ = ensureLaneLocked(p)
        }
        // 若无客户端，至少保 foreground 车道
        if lanes.isEmpty {
            _ = ensureLaneLocked(VideoSettingsStore.shared.defaults)
        }
        lock.unlock()
        old.values.forEach { $0.encoder.stop() }
        requestKeyframe()
    }

    func applyDefaultsFromSettings() {
        let d = VideoSettingsStore.shared.defaults
        lock.lock()
        for c in clients where !c.profile.isWall {
            c.profile = d
        }
        lock.unlock()
        recycleEncoder(reason: "video-settings")
    }

    @discardableResult
    private func ensureLaneLocked(_ profile: VideoStreamProfile) -> Lane? {
        if let existing = lanes[profile.key] { return existing }
        let lane = Lane(profile: profile, sourceW: sourceW, sourceH: sourceH, owner: self)
        lanes[profile.key] = lane
        NSLog(
            "[Publisher] lane %@ %dx%d fps=%d br=%d",
            profile.key, lane.encodeW, lane.encodeH, profile.frameRate, profile.bitrateBps
        )
        return lane
    }

    private func pruneLanesLocked() {
        let live = Set(clients.map(\.profile.key))
        let drop = lanes.keys.filter { !live.contains($0) }
        for k in drop {
            lanes[k]?.encoder.stop()
            lanes.removeValue(forKey: k)
        }
    }

    private func broadcastConfig(_ avcC: Data, laneKey: String) {
        lock.lock()
        let targets = clients.filter { $0.profile.key == laneKey }
        lock.unlock()
        let packet = PHB1.packet(flags: .configuration, timestampUs: 0, payload: avcC)
        for c in targets {
            _ = c.session.sendBinary(packet)
        }
    }

    private func broadcastFrame(avcc: Data, keyframe: Bool, timestampUs: UInt64, laneKey: String) {
        onTimestampUs?(timestampUs)
        let packet = PHB1.packet(flags: keyframe ? .keyframe : .delta, timestampUs: timestampUs, payload: avcc)
        lock.lock()
        let targets = clients.filter { $0.profile.key == laneKey }
        lock.unlock()
        for c in targets {
            // discardUnsent：拥塞时丢 delta，等关键帧再试
            if c.congested && !keyframe { continue }
            if c.session.sendBinary(packet) {
                if keyframe { c.congested = false }
            } else {
                let firstStall = !c.congested
                c.congested = true
                if firstStall {
                    lock.lock()
                    lanes[laneKey]?.encoder.forceKeyFrame()
                    lock.unlock()
                }
            }
        }
    }
}

enum PixelBufferScaler {
    private static let ci = CIContext(options: [.useSoftwareRenderer: false])

    static func scale(_ src: CVPixelBuffer, width: Int, height: Int) -> CVPixelBuffer? {
        let w = max(2, width - (width % 2))
        let h = max(2, height - (height % 2))
        var dst: CVPixelBuffer?
        let attrs: [CFString: Any] = [
            kCVPixelBufferIOSurfacePropertiesKey: [:] as CFDictionary,
            kCVPixelBufferMetalCompatibilityKey: true,
        ]
        let st = CVPixelBufferCreate(
            kCFAllocatorDefault, w, h,
            kCVPixelFormatType_32BGRA, attrs as CFDictionary, &dst
        )
        guard st == kCVReturnSuccess, let dst else { return nil }
        let image = CIImage(cvPixelBuffer: src)
        let sx = CGFloat(w) / CGFloat(CVPixelBufferGetWidth(src))
        let sy = CGFloat(h) / CGFloat(CVPixelBufferGetHeight(src))
        let scaled = image.transformed(by: CGAffineTransform(scaleX: sx, y: sy))
        ci.render(scaled, to: dst)
        return dst
    }
}
