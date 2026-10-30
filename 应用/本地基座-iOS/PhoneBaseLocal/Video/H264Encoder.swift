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

    private(set) var ready = false
    private(set) var encodeAttempts: Int = 0
    private(set) var encodeErrors: Int = 0
    private(set) var outputFrames: Int = 0
    private(set) var lastEncodeStatus: OSStatus = 0
    private(set) var lastCallbackStatus: OSStatus = 0

    var onConfig: ((Data) -> Void)?
    var onFrame: ((_ avcc: Data, _ keyframe: Bool, _ timestampUs: UInt64) -> Void)?

    init(width: Int, height: Int) {
        self.width = Int32(max(2, width - (width % 2)))
        self.height = Int32(max(2, height - (height % 2)))
    }

    var stats: [String: Any] {
        [
            "ready": ready,
            "width": Int(width),
            "height": Int(height),
            "encodeAttempts": encodeAttempts,
            "encodeErrors": encodeErrors,
            "outputFrames": outputFrames,
            "lastEncodeStatus": Int(lastEncodeStatus),
            "lastCallbackStatus": Int(lastCallbackStatus),
            "sentConfig": sentConfig,
        ]
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
            ready = false
            // nil attributes: accept caller-created BGRA buffers (pool attrs break that).
            var sess: VTCompressionSession?
            let status = VTCompressionSessionCreate(
                allocator: kCFAllocatorDefault,
                width: width,
                height: height,
                codecType: kCMVideoCodecType_H264,
                encoderSpecification: nil,
                imageBufferAttributes: nil,
                compressedDataAllocator: nil,
                outputCallback: compressionCallback,
                refcon: Unmanaged.passUnretained(self).toOpaque(),
                compressionSessionOut: &sess
            )
            guard status == noErr, let sess else {
                lastEncodeStatus = status
                NSLog("[H264] VTCompressionSessionCreate failed status=%d size=%dx%d", status, width, height)
                return
            }
            VTSessionSetProperty(sess, key: kVTCompressionPropertyKey_RealTime, value: kCFBooleanTrue)
            VTSessionSetProperty(sess, key: kVTCompressionPropertyKey_ProfileLevel, value: kVTProfileLevel_H264_Baseline_AutoLevel)
            VTSessionSetProperty(sess, key: kVTCompressionPropertyKey_AverageBitRate, value: 2_500_000 as CFNumber)
            VTSessionSetProperty(sess, key: kVTCompressionPropertyKey_ExpectedFrameRate, value: 20 as CFNumber)
            VTSessionSetProperty(sess, key: kVTCompressionPropertyKey_MaxKeyFrameInterval, value: 30 as CFNumber)
            VTSessionSetProperty(sess, key: kVTCompressionPropertyKey_AllowFrameReordering, value: kCFBooleanFalse)
            VTCompressionSessionPrepareToEncodeFrames(sess)
            self.session = sess
            self.sentConfig = false
            self.forceNextKeyFrame = true
            self.ready = true
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
            ready = false
        }
    }

    func resetConfigFlag() {
        queue.async { self.sentConfig = false }
    }

    func encode(buffer: CVPixelBuffer, presentationTime: CMTime) {
        queue.async {
            self.encodeAttempts += 1
            guard let session = self.session else {
                self.encodeErrors += 1
                self.lastEncodeStatus = -1
                return
            }
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
            self.lastEncodeStatus = status
            if status != noErr {
                self.encodeErrors += 1
                if self.encodeErrors <= 5 || self.encodeErrors % 50 == 0 {
                    NSLog("[H264] EncodeFrame status=%d attempts=%d", status, self.encodeAttempts)
                }
            }
        }
    }

    fileprivate func noteCallbackStatus(_ status: OSStatus) {
        lastCallbackStatus = status
        if status != noErr { encodeErrors += 1 }
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

        let avcc = Data(bytes: dataPointer, count: length)
        let key = isKeyframe || Self.avccContainsIdr(avcc)
        outputFrames += 1
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
    guard let ref = outputCallbackRefCon else { return }
    let encoder = Unmanaged<H264Encoder>.fromOpaque(ref).takeUnretainedValue()
    encoder.noteCallbackStatus(status)
    guard status == noErr, let sampleBuffer else { return }
    encoder.handle(sampleBuffer: sampleBuffer)
}
