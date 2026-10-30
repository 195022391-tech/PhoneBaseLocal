import Foundation

final class ControlHub {
    private let deviceId: String
    private var width: Int
    private var height: Int
    private var revision: Int
    private let injector: TouchInjector
    private let textAvailable: Bool
    private let keyboardAvailable: Bool
    private let lock = NSLock()
    private var sessions: [WebSocketSession] = []
    var latestFrameTimestampUs: UInt64 = 0

    init(
        deviceId: String,
        width: Int,
        height: Int,
        revision: Int,
        injector: TouchInjector = LogTouchInjector(),
        textAvailable: Bool = false,
        keyboardAvailable: Bool = false
    ) {
        self.deviceId = deviceId
        self.width = width
        self.height = height
        self.revision = revision
        self.injector = injector
        self.textAvailable = textAvailable
        self.keyboardAvailable = keyboardAvailable
    }

    func attach(_ session: WebSocketSession) {
        lock.lock()
        sessions.append(session)
        lock.unlock()

        let ready: [String: Any] = [
            "type": "ready",
            "protocol": "phonebase-control",
            "version": 1,
            "deviceId": deviceId,
            "controlAvailable": true,
            "homeAvailable": true,
            "textAvailable": textAvailable,
            "keyboardAvailable": keyboardAvailable,
            "geometry": geometryDict(),
        ]
        if let data = try? JSONSerialization.data(withJSONObject: ready),
           let text = String(data: data, encoding: .utf8) {
            session.sendText(text)
        }

        session.onText = { [weak self, weak session] text in
            guard let self, let session else { return }
            self.handle(text: text, session: session)
        }
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

    private func geometryDict() -> [String: Any] {
        [
            "width": width,
            "height": height,
            "sourceWidth": width,
            "sourceHeight": height,
            "orientation": 1,
            "revision": revision,
            "changedAtUs": Int(Date().timeIntervalSince1970 * 1_000_000),
        ]
    }

    private func handle(text: String, session: WebSocketSession) {
        guard let data = text.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = obj["type"] as? String
        else { return }

        switch type {
        case "keepalive":
            return
        case "pointer":
            let action = obj["action"] as? String ?? ""
            let seq = intVal(obj["seq"]) ?? 0
            if action == "cancel" {
                ack(session, seq: seq, ok: true)
                return
            }
            // JSONSerialization 数字是 NSNumber，不能 as? Double
            guard let x = doubleVal(obj["x"]), let y = doubleVal(obj["y"]),
                  x >= 0, x <= 1, y >= 0, y <= 1
            else {
                ack(session, seq: seq, ok: false, error: "bad coords")
                return
            }
            injector.pointer(action: action, x: x, y: y)
            // move 高频：不 ack，少一半往返，滑动更跟手
            if action != "move" {
                ack(session, seq: seq, ok: true)
            }
        case "button":
            let seq = intVal(obj["seq"]) ?? 0
            if (obj["button"] as? String) == "home" {
                injector.pressHome()
                ack(session, seq: seq, ok: true)
            } else {
                ack(session, seq: seq, ok: false, error: "unsupported button")
            }
        case "home":
            let seq = intVal(obj["seq"]) ?? 0
            injector.pressHome()
            ack(session, seq: seq, ok: true)
        case "text":
            let seq = intVal(obj["seq"]) ?? 0
            let text = obj["text"] as? String ?? ""
            guard !text.isEmpty, text.utf8.count <= 4096 else {
                ack(session, seq: seq, ok: false, error: "bad text")
                return
            }
            injector.injectText(text)
            ack(session, seq: seq, ok: true)
        case "key":
            let seq = intVal(obj["seq"]) ?? 0
            let key = obj["key"] as? String ?? ""
            let allowed: Set<String> = ["backspace", "enter", "tab", "escape", "left", "right", "up", "down"]
            guard allowed.contains(key) else {
                ack(session, seq: seq, ok: false, error: "unsupported key")
                return
            }
            injector.injectKey(key)
            ack(session, seq: seq, ok: true)
        default:
            break
        }
    }

    private func doubleVal(_ any: Any?) -> Double? {
        if let d = any as? Double { return d }
        if let n = any as? NSNumber { return n.doubleValue }
        return nil
    }

    private func intVal(_ any: Any?) -> Int? {
        if let i = any as? Int { return i }
        if let n = any as? NSNumber { return n.intValue }
        return nil
    }

    private func ack(_ session: WebSocketSession, seq: Int, ok: Bool, error: String? = nil) {
        var body: [String: Any] = ["type": "ack", "seq": seq, "ok": ok]
        if let error { body["error"] = error }
        if let data = try? JSONSerialization.data(withJSONObject: body),
           let text = String(data: data, encoding: .utf8) {
            session.sendText(text)
        }
    }
}
