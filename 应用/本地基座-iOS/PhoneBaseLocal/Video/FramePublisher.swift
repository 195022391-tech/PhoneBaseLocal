import Foundation
import CoreVideo
import CoreMedia
import CoreImage

final class FramePublisher {
    private let sourceW: Int
    private let sourceH: Int
    private let lock = NSLock()
    private let encodeQueue = DispatchQueue(label: "cn.local.phonebase.publish.encode", qos: .userInteractive)
    private var clients: [Client] = []
    private var lanes: [String: Lane] = [:]
    private var frameSerial: Int64 = 0
    private var pendingEncode: (CVPixelBuffer, CMTime)?
    private var encodeScheduled = false
    var onTimestampUs: ((UInt64) -> Void)?

    /// 兼容 info.encoder；tryLock 避免与 encode 死锁堵死 /api/info
    var encoderStats: [String: Any] {
        guard lock.`try`() else {
            return ["ready": false, "busy": true, "width": sourceW, "height": sourceH]
        }
        defer { lock.unlock() }
        if let lane = lanes.values.first(where: { !$0.profile.isWall }) ?? lanes.values.first {
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
        var lastKeyRequestMs: UInt64 = 0
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
        private(set) var started = false
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
            let key = profile.key
            encoder.onConfig = { [weak self] avcC in
                self?.lastConfig = avcC
                self?.owner?.broadcastConfig(avcC, laneKey: key)
            }
            encoder.onFrame = { [weak self] avcc, keyframe, ts in
                self?.owner?.broadcastFrame(avcc: avcc, keyframe: keyframe, timestampUs: ts, laneKey: key)
            }
            // 注意：禁止在 FramePublisher.lock 内 start（VT 回调会再抢锁 → 死锁）
        }

        func startIfNeeded() {
            guard !started else { return }
            started = true
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
        let lane = ensureLaneLocked(p)
        let cfg = lane?.lastConfig
        lock.unlock()

        lane?.startIfNeeded()
        session.sendText(#"{"type":"publisher","online":true}"#)
        if let cfg {
            _ = session.sendBinary(PHB1.packet(flags: .configuration, timestampUs: 0, payload: cfg))
        } else {
            lane?.encoder.resetConfigFlag()
        }
        lane?.encoder.forceKeyFrame()

        session.onClose = { [weak self, weak session] in
            guard let self, let session else { return }
            var stopped: [Lane] = []
            self.lock.lock()
            self.clients.removeAll { $0.session === session }
            stopped = self.pruneLanesLocked()
            self.lock.unlock()
            stopped.forEach { $0.encoder.stop() }
        }
    }

    func detachAll() {
        lock.lock()
        let copy = clients
        clients.removeAll()
        let oldLanes = Array(lanes.values)
        lanes.removeAll()
        lock.unlock()
        copy.forEach { $0.session.close() }
        oldLanes.forEach { $0.encoder.stop() }
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
        // 采集在主线程；缩放+双路编码挪到 encodeQueue，latest-wins，避免墙流拖死大窗/主线程
        lock.lock()
        pendingEncode = (buffer, presentationTime)
        let needSchedule = !encodeScheduled
        if needSchedule { encodeScheduled = true }
        lock.unlock()
        guard needSchedule else { return }
        encodeQueue.async { [weak self] in self?.drainEncode() }
    }

    private func drainEncode() {
        while true {
            lock.lock()
            guard let pending = pendingEncode else {
                encodeScheduled = false
                lock.unlock()
                return
            }
            pendingEncode = nil
            frameSerial += 1
            let serial = frameSerial
            let active = Dictionary(grouping: clients, by: { $0.profile.key })
            var work: [Lane] = []
            var toStart: [Lane] = []
            for (key, group) in active {
                let existed = lanes[key] != nil
                guard let lane = lanes[key] ?? ensureLaneLocked(group[0].profile) else { continue }
                if !existed { toStart.append(lane) }
                let fps = max(5, lane.profile.frameRate)
                let stride = max(1, Int((60.0 / Double(fps)).rounded()))
                let due = serial - lane.lastEmitSerial >= Int64(stride) || lane.lastEmitSerial == 0
                if due {
                    lane.lastEmitSerial = serial
                    work.append(lane)
                }
            }
            // 大窗优先：先 foreground 再 wall，减少双开时墙流抢 VT/缩放把大窗拖卡
            work.sort { a, b in
                let aw = a.profile.isWall
                let bw = b.profile.isWall
                if aw != bw { return !aw && bw }
                return a.profile.key < b.profile.key
            }
            lock.unlock()

            // start 必须在 unlock 之后，否则 VT 回调抢锁死锁 → /api/info 永久卡住
            toStart.forEach { $0.startIfNeeded() }
            work.forEach { $0.startIfNeeded() }

            let buffer = pending.0
            let presentationTime = pending.1
            for lane in work {
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
    }

    func requestKeyframe() {
        lock.lock()
        let all = Array(lanes.values)
        lock.unlock()
        all.forEach { $0.encoder.forceKeyFrame() }
    }

    func recycleEncoder(reason: String) {
        NSLog("[Publisher] recycleEncoder %@", reason)
        lock.lock()
        let profiles = Array(Set(clients.map(\.profile)))
        let old = Array(lanes.values)
        lanes.removeAll()
        var fresh: [Lane] = []
        for p in profiles {
            if let lane = ensureLaneLocked(p) { fresh.append(lane) }
        }
        if fresh.isEmpty, let lane = ensureLaneLocked(VideoSettingsStore.shared.defaults) {
            fresh.append(lane)
        }
        lock.unlock()
        fresh.forEach { $0.startIfNeeded() }
        old.forEach { $0.encoder.stop() }
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

    /// 返回需要 stop 的车道（调用方在 unlock 后 stop）
    private func pruneLanesLocked() -> [Lane] {
        let live = Set(clients.map(\.profile.key))
        let drop = lanes.keys.filter { !live.contains($0) }
        var stopped: [Lane] = []
        for k in drop {
            if let lane = lanes.removeValue(forKey: k) {
                stopped.append(lane)
            }
        }
        return stopped
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
        let lane = lanes[laneKey]
        lock.unlock()
        let nowMs = DispatchTime.now().uptimeNanoseconds / 1_000_000
        for c in targets {
            if c.congested && !keyframe {
                // 背压后若关键帧一直发不出去，必须周期性再要 IDR，否则墙流会停在旧画面
                if nowMs &- c.lastKeyRequestMs >= 400 {
                    c.lastKeyRequestMs = nowMs
                    lane?.encoder.forceKeyFrame()
                }
                continue
            }
            if c.session.sendBinary(packet) {
                if keyframe { c.congested = false }
            } else {
                let firstStall = !c.congested
                c.congested = true
                if firstStall || (keyframe && nowMs &- c.lastKeyRequestMs >= 200) {
                    c.lastKeyRequestMs = nowMs
                    lane?.encoder.forceKeyFrame()
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
