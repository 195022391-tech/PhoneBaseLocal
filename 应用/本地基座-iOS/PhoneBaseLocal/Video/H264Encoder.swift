import Foundation
import VideoToolbox
import CoreMedia
import CoreVideo

final class H264Encoder {
    private var session: VTCompressionSession?
    private let width: Int32
    private let height: Int32
    private let queue = DispatchQueue(label: "cn.local.phonebase.local.encoder")
    private var sentConfig = false
    private var forceNextKeyFrame = false

    var onConfig: ((Data) -> Void)?
    var onFrame: ((_ avcc: Data, _ keyframe: Bool, _ timestampUs: UInt64) -> Void)?

    init(width: Int, height: Int) {
        self.width = Int32(max(2, width - (width % 2)))
        self.height = Int32(max(2, height - (height % 2)))
    }

    func forceKeyFrame() {
        queue.async { self.forceNextKeyFrame = true }
    }

    func start() throws {
        queue.sync {
            if let old = session {
                VTCompressionSessionInvalidate(old)
                session = nil
            }
            let attrs: [String: Any] = [
                kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA),
                kCVPixelBufferWidthKey as String: Int(width),
                kCVPixelBufferHeightKey as String: Int(height),
                kCVPixelBufferIOSurfacePropertiesKey as String: [:] as [String: Any],
            ]
            var sess: VTCompressionSession?
            let status = VTCompressionSessionCreate(
                allocator: kCFAllocatorDefault,
                width: width,
                height: height,
                codecType: kCMVideoCodecType_H264,
                encoderSpecification: nil,
                imageBufferAttributes: attrs as CFDictionary,
                compressedDataAllocator: nil,
                outputCallback: compressionCallback,
                refcon: Unmanaged.passUnretained(self).toOpaque(),
                compressionSessionOut: &sess
            )
            guard status == noErr, let sess else {
                NSLog("[H264] VTCompressionSessionCreate failed status=%d size=%dx%d", status, width, height)
                return
            }
            VTSessionSetProperty(sess, key: kVTCompressionPropertyKey_RealTime, value: kCFBooleanTrue)
            VTSessionSetProperty(sess, key: kVTCompressionPropertyKey_ProfileLevel, value: kVTProfileLevel_H264_Baseline_AutoLevel)
            VTSessionSetProperty(sess, key: kVTCompressionPropertyKey_AverageBitRate, value: 3_000_000 as CFNumber)
            VTSessionSetProperty(sess, key: kVTCompressionPropertyKey_ExpectedFrameRate, value: 20 as CFNumber)
            VTSessionSetProperty(sess, key: kVTCompressionPropertyKey_MaxKeyFrameInterval, value: 30 as CFNumber)
            VTSessionSetProperty(sess, key: kVTCompressionPropertyKey_AllowFrameReordering, value: kCFBooleanFalse)
            VTCompressionSessionPrepareToEncodeFrames(sess)
            self.session = sess
            self.sentConfig = false
            self.forceNextKeyFrame = true
            NSLog("[H264] encoder ready %dx%d", width, height)
        }
    }

    func stop() {
        queue.sync {
            if let session {
                VTCompressionSessionCompleteFrames(session, untilPresentationTimeStamp: .invalid)
                VTCompressionSessionInvalidate(session)
            }
            session = nil
            sentConfig = false
        }
    }

    func resetConfigFlag() {
        queue.async { self.sentConfig = false }
    }

    func encode(buffer: CVPixelBuffer, presentationTime: CMTime) {
        queue.async {
            guard let session = self.session else { return }
            var flags: VTEncodeInfoFlags = []
            var props: CFDictionary?
            if self.forceNextKeyFrame {
                self.forceNextKeyFrame = false
                props = [kVTEncodeFrameOptionKey_ForceKeyFrame: true] as CFDictionary
            }
            let status = VTCompressionSessionEncodeFrame(
                session,
                imageBuffer: buffer,
                presentationTimeStamp: presentationTime,
                duration: .invalid,
                frameProperties: props,
                sourceFrameRefcon: nil,
                infoFlagsOut: &flags
            )
            if status != noErr {
                NSLog("[H264] EncodeFrame status=%d", status)
            }
        }
    }

    fileprivate func handle(sampleBuffer: CMSampleBuffer) {
        // Attachments may be absent; do not drop the bitstream when they are.
        guard let dataBuffer = CMSampleBufferGetDataBuffer(sampleBuffer) else { return }
        let attachments = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, createIfNecessary: true) as? [[CFString: Any]]
        let isKeyframe = !(attachments?.first?[kCMSampleAttachmentKey_NotSync] as? Bool ?? false)
        let pts = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
        let timestampUs = UInt64(max(0, pts.seconds * 1_000_000))

        if !sentConfig, let format = CMSampleBufferGetFormatDescription(sampleBuffer) {
            if let avcC = Self.avcC(from: format) {
                sentConfig = true
                onConfig?(avcC)
            }
        }

        var length = 0
        var dataPointer: UnsafeMutablePointer<Int8>?
        guard CMBlockBufferGetDataPointer(dataBuffer, atOffset: 0, lengthAtOffsetOut: nil, totalLengthOut: &length, dataPointerOut: &dataPointer) == noErr,
              let dataPointer, length > 0
        else { return }

        // Prefer NAL-based IDR detection; attachments are not always reliable.
        let avcc = Data(bytes: dataPointer, count: length)
        let key = isKeyframe || Self.avccContainsIdr(avcc)
        onFrame?(avcc, key, timestampUs)
    }

    private static func avccContainsIdr(_ data: Data) -> Bool {
        var i = 0
        while i + 4 <= data.count {
            let n = Int(data[i]) << 24 | Int(data[i + 1]) << 16 | Int(data[i + 2]) << 8 | Int(data[i + 3])
            i += 4
            guard n > 0, i + n <= data.count else { return false }
            if (data[i] & 0x1f) == 5 { return true }
            i += n
        }
        return false
    }

    private static func avcC(from format: CMFormatDescription) -> Data? {
        var spsCount = 0
        var spsPointer: UnsafePointer<UInt8>?
        var spsSize = 0
        var ppsCount = 0
        var ppsPointer: UnsafePointer<UInt8>?
        var ppsSize = 0
        var nalHeaderLength: Int32 = 0

        let spsStatus = CMVideoFormatDescriptionGetH264ParameterSetAtIndex(
            format, parameterSetIndex: 0, parameterSetPointerOut: &spsPointer,
            parameterSetSizeOut: &spsSize, parameterSetCountOut: &spsCount, nalUnitHeaderLengthOut: &nalHeaderLength
        )
        let ppsStatus = CMVideoFormatDescriptionGetH264ParameterSetAtIndex(
            format, parameterSetIndex: 1, parameterSetPointerOut: &ppsPointer,
            parameterSetSizeOut: &ppsSize, parameterSetCountOut: &ppsCount, nalUnitHeaderLengthOut: nil
        )
        guard spsStatus == noErr, ppsStatus == noErr, let spsPointer, let ppsPointer, nalHeaderLength == 4 else { return nil }

        var out = Data()
        out.append(1) // configurationVersion
        out.append(spsPointer[1])
        out.append(spsPointer[2])
        out.append(spsPointer[3])
        out.append(0xFF) // lengthSizeMinusOne = 3
        out.append(0xE1) // one SPS
        var spsLen = UInt16(spsSize).bigEndian
        withUnsafeBytes(of: &spsLen) { out.append(contentsOf: $0) }
        out.append(UnsafeBufferPointer(start: spsPointer, count: spsSize))
        out.append(1) // one PPS
        var ppsLen = UInt16(ppsSize).bigEndian
        withUnsafeBytes(of: &ppsLen) { out.append(contentsOf: $0) }
        out.append(UnsafeBufferPointer(start: ppsPointer, count: ppsSize))
        return out
    }
}

private func compressionCallback(
    outputCallbackRefCon: UnsafeMutableRawPointer?,
    sourceFrameRefCon: UnsafeMutableRawPointer?,
    status: OSStatus,
    infoFlags: VTEncodeInfoFlags,
    sampleBuffer: CMSampleBuffer?
) {
    guard status == noErr, let sampleBuffer, let ref = outputCallbackRefCon else { return }
    let encoder = Unmanaged<H264Encoder>.fromOpaque(ref).takeUnretainedValue()
    encoder.handle(sampleBuffer: sampleBuffer)
}
