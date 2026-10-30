import Foundation
import UIKit
import CoreVideo
import CoreMedia

/// 应用内画面采样（演示 / 本 App UI）。
/// 系统级全屏采集需 TrollStore/私有 API，可在此类替换实现。
final class ScreenSampler {
    private let width: Int
    private let height: Int
    private var displayLink: CADisplayLink?
    private var frameIndex: Int64 = 0
    private(set) var isActive = false
    private var wantsFrames = true

    var onPixelBuffer: ((CVPixelBuffer, CMTime) -> Void)?

    init(width: Int, height: Int) {
        self.width = max(2, width - (width % 2))
        self.height = max(2, height - (height % 2))
    }

    func start() {
        stop()
        isActive = true
        wantsFrames = true
        let link = CADisplayLink(target: self, selector: #selector(tick))
        link.preferredFramesPerSecond = 20
        link.add(to: .main, forMode: .common)
        displayLink = link
    }

    func stop() {
        displayLink?.invalidate()
        displayLink = nil
        isActive = false
    }

    func setActive(_ active: Bool) {
        wantsFrames = active
        isActive = active && displayLink != nil
    }

    @objc private func tick() {
        guard wantsFrames else { return }
        frameIndex += 1
        guard let buffer = renderFrame() else { return }
        let pts = CMTime(value: frameIndex, timescale: 20)
        onPixelBuffer?(buffer, pts)
    }

    private func renderFrame() -> CVPixelBuffer? {
        let width = self.width
        let height = self.height
        var buffer: CVPixelBuffer?
        let attrs: [CFString: Any] = [
            kCVPixelBufferCGImageCompatibilityKey: true,
            kCVPixelBufferCGBitmapContextCompatibilityKey: true,
        ]
        CVPixelBufferCreate(kCFAllocatorDefault, width, height, kCVPixelFormatType_32BGRA, attrs as CFDictionary, &buffer)
        guard let buffer else { return nil }

        CVPixelBufferLockBaseAddress(buffer, [])
        defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
        guard let base = CVPixelBufferGetBaseAddress(buffer) else { return nil }

        let context = CGContext(
            data: base,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGBitmapInfo.byteOrder32Little.rawValue | CGImageAlphaInfo.premultipliedFirst.rawValue
        )
        guard let context else { return nil }

        // Bitmap CTM is bottom-left; flip so UIKit/CG draw share top-left origin.
        context.translateBy(x: 0, y: CGFloat(height))
        context.scaleBy(x: 1, y: -1)

        // Demo pattern — proves PHB1 path end-to-end with Electron.
        context.setFillColor(UIColor(red: 0.08, green: 0.10, blue: 0.14, alpha: 1).cgColor)
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))

        let t = CGFloat(frameIndex % 200) / 200
        context.setFillColor(UIColor(red: 0.18, green: 0.62, blue: 0.48, alpha: 1).cgColor)
        context.fillEllipse(in: CGRect(x: 80 + t * 400, y: 200 + sin(t * .pi * 2) * 80, width: 120, height: 120))

        UIGraphicsPushContext(context)
        let paragraph = NSMutableParagraphStyle()
        paragraph.alignment = .center
        let attrsText: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 28, weight: .bold),
            .foregroundColor: UIColor.white,
            .paragraphStyle: paragraph,
        ]
        let text = "PhoneBase Local\n\(DeviceIdentity.displayName)\nframe \(frameIndex)" as NSString
        text.draw(in: CGRect(x: 40, y: 520, width: width - 80, height: 200), withAttributes: attrsText)
        UIGraphicsPopContext()

        return buffer
    }
}
