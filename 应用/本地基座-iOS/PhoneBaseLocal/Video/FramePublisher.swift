import Foundation
import CoreVideo
import CoreMedia

final class FramePublisher {
    let encoder: H264Encoder
    private let lock = NSLock()
    private var sessions: [WebSocketSession] = []
    private var lastConfig: Data?
    var onTimestampUs: ((UInt64) -> Void)?

    init(width: Int, height: Int) {
        // Must match ScreenSampler / CVPixelBuffer size (portrait 720×1280 etc).
        encoder = H264Encoder(width: width, height: height)
        encoder.onConfig = { [weak self] avcC in
            self?.broadcastConfig(avcC)
        }
        encoder.onFrame = { [weak self] avcc, keyframe, ts in
            self?.broadcastFrame(avcc: avcc, keyframe: keyframe, timestampUs: ts)
        }
        try? encoder.start()
    }

    func attach(_ session: WebSocketSession) {
        lock.lock()
        sessions.append(session)
        lock.unlock()
        session.sendText(#"{"type":"publisher","online":true}"#)
        // Send cached avcC once; do not resetConfigFlag here — a second config
        // mid-WebCodecs configure aborts the decoder and drops the following IDR.
        if let lastConfig {
            session.sendBinary(PHB1.packet(flags: .configuration, timestampUs: 0, payload: lastConfig))
        } else {
            // No SPS/PPS yet: keep asking for IDR until encoder emits config.
            encoder.resetConfigFlag()
        }
        requestKeyframe()
        session.onClose = { [weak self, weak session] in
            guard let self, let session else { return }
            self.lock.lock()
            self.sessions.removeAll { $0 === session }
            self.lock.unlock()
        }
    }

    func detachAll() {
        lock.lock()
        let copy = sessions
        sessions.removeAll()
        lock.unlock()
        copy.forEach { $0.close() }
    }

    func setPublisherOnline(_ online: Bool) {
        let json = #"{"type":"publisher","online":\#(online ? "true" : "false")}"#
        broadcastText(json)
        if !online {
            lastConfig = nil
            encoder.resetConfigFlag()
        }
    }

    func encode(buffer: CVPixelBuffer, presentationTime: CMTime) {
        encoder.encode(buffer: buffer, presentationTime: presentationTime)
    }

    func requestKeyframe() {
        encoder.forceKeyFrame()
    }

    private func broadcastConfig(_ avcC: Data) {
        lastConfig = avcC
        let packet = PHB1.packet(flags: .configuration, timestampUs: 0, payload: avcC)
        broadcastBinary(packet)
    }

    private func broadcastFrame(avcc: Data, keyframe: Bool, timestampUs: UInt64) {
        onTimestampUs?(timestampUs)
        let packet = PHB1.packet(flags: keyframe ? .keyframe : .delta, timestampUs: timestampUs, payload: avcc)
        broadcastBinary(packet)
    }

    private func broadcastBinary(_ data: Data) {
        lock.lock()
        let copy = sessions
        lock.unlock()
        copy.forEach { $0.sendBinary(data) }
    }

    private func broadcastText(_ text: String) {
        lock.lock()
        let copy = sessions
        lock.unlock()
        copy.forEach { $0.sendText(text) }
    }
}
