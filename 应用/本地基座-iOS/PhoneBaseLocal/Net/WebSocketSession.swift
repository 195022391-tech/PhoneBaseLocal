import Foundation
import Network

final class WebSocketSession {
    private let connection: NWConnection
    private let queue: DispatchQueue
    private var buffer = Data()
    var onText: ((String) -> Void)?
    var onBinary: ((Data) -> Void)?
    var onClose: (() -> Void)?
    private(set) var isOpen = true

    init(connection: NWConnection, queue: DispatchQueue) {
        self.connection = connection
        self.queue = queue
    }

    func start() {
        receive()
    }

    func sendText(_ text: String) {
        guard isOpen, let payload = text.data(using: .utf8) else { return }
        send(frame: encodeFrame(opcode: 0x1, payload: payload))
    }

    func sendBinary(_ data: Data) {
        guard isOpen else { return }
        send(frame: encodeFrame(opcode: 0x2, payload: data))
    }

    func close() {
        guard isOpen else { return }
        isOpen = false
        send(frame: encodeFrame(opcode: 0x8, payload: Data()))
        connection.cancel()
        onClose?()
    }

    private func send(frame: Data) {
        connection.send(content: frame, completion: .contentProcessed { _ in })
    }

    private func receive() {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 1024 * 1024) { [weak self] data, _, isComplete, error in
            guard let self else { return }
            if let data, !data.isEmpty {
                self.buffer.append(data)
                self.consumeFrames()
            }
            if isComplete || error != nil {
                self.isOpen = false
                self.onClose?()
                return
            }
            self.receive()
        }
    }

    private func consumeFrames() {
        while true {
            guard buffer.count >= 2 else { return }
            let b0 = buffer[0]
            let b1 = buffer[1]
            let opcode = b0 & 0x0F
            let masked = (b1 & 0x80) != 0
            var len = Int(b1 & 0x7F)
            var offset = 2
            if len == 126 {
                guard buffer.count >= 4 else { return }
                len = Int(buffer[2]) << 8 | Int(buffer[3])
                offset = 4
            } else if len == 127 {
                guard buffer.count >= 10 else { return }
                len = 0
                for i in 0..<8 { len = (len << 8) | Int(buffer[2 + i]) }
                offset = 10
            }
            let maskLen = masked ? 4 : 0
            guard buffer.count >= offset + maskLen + len else { return }
            var payload = Data(buffer[(offset + maskLen)..<(offset + maskLen + len)])
            if masked {
                let mask = Array(buffer[offset..<(offset + 4)])
                for i in 0..<payload.count {
                    payload[i] ^= mask[i % 4]
                }
            }
            buffer.removeSubrange(0..<(offset + maskLen + len))

            switch opcode {
            case 0x1:
                if let text = String(data: payload, encoding: .utf8) { onText?(text) }
            case 0x2:
                onBinary?(payload)
            case 0x8:
                isOpen = false
                connection.cancel()
                onClose?()
                return
            case 0x9:
                send(frame: encodeFrame(opcode: 0xA, payload: payload))
            default:
                break
            }
        }
    }

    private func encodeFrame(opcode: UInt8, payload: Data) -> Data {
        var frame = Data()
        frame.append(0x80 | opcode)
        let count = payload.count
        if count < 126 {
            frame.append(UInt8(count))
        } else if count <= 0xFFFF {
            frame.append(126)
            frame.append(UInt8((count >> 8) & 0xFF))
            frame.append(UInt8(count & 0xFF))
        } else {
            frame.append(127)
            var n = UInt64(count).bigEndian
            withUnsafeBytes(of: &n) { frame.append(contentsOf: $0) }
        }
        frame.append(payload)
        return frame
    }
}
