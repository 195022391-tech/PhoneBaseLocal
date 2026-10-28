# 协议深挖（反汇编证据）

目标：`LanCaptureHelper` preferred base `0x100000000`  
方法定位见 `objc_classes.json` / `key_method_refs.json`；反汇编见 `disasm_*.txt`。

---

## A. WebSocket 传输层

`-[PBLocalService consumeWebSocket:]` @ `0x10001ce90`

- 标准 RFC6455 帧解析；**要求 MASK=1**（客户端→服务端）
- 允许 opcode 位图 `0x706` = **1|2|8|9|10**（text / binary / close / ping / pong）
- RSV 非 0 → 关闭 `1002` (`0x3ea`)
- 超大帧 → `1009` (`0x3f1`)；策略类 → `1008` (`0x3f0`)；正常 → `1000` (`0x3e8`)

分流（推断，与调用一致）：

| opcode | 处理 |
|--------|------|
| 1 text | JSON → `consumeControlPayload:client:` |
| 2 binary | 视频相关 / 其它二进制（出站视频亦为 binary） |
| 8/9/10 | close/ping/pong |

服务端出站视频帧首字节固定 **`0x82`**（FIN+binary，无 mask）。

---

## B. 控制 JSON（`/control` text）

`-[PBLocalService consumeControlPayload:client:]` @ `0x10001e9d4`

### 顶层字段
- `type`（必选分支键）
- 常见：`error`、`seq`、`action`、`code`

### `type` 取值（字符串观测）
| type | 含义 |
|------|------|
| `keepalive` | 心跳；刷新 `lastControlActivity` |
| `pointer` | 触控；见下 |
| `button` / `home` | 实体/Home 类按键（受 `homeAvailable`） |
| `text` | 文本注入（`textAvailable`） |
| `key` | 键盘键（`keyboardAvailable`） |
| `control-policy` | 携 `policyHeader` → `applyCloudControlPolicy:` |

### `pointer`
- `action`: `down` | `move` | `up` | `cancel`
- `x`, `y`（double）
- `seq`（与 `lastPointerSeq` 去重/排序）
- `orientation`
- `geometryRevision` / `revision` / `changedAtUs` / `frameTimestampUs`
- 队列：`pointerQueue` → `dispatchCheckedPointer:client:epoch:checkedAt:`
- 可能拒绝码：`FOREGROUND_UNKNOWN`、`SETTINGS_BLOCKED`（出租设置保护时）

### `key` 特殊键名
`backspace` `enter` `tab` `escape` `left` `right`（及普通字符路径）

### 应答
- `sendControlJSON:` 发出 JSON；观测到 ack 形如  
  `{ "type":"ack", "seq":..., "ok":true/false, "error":..., "code":... }`
- 几何快照字段：`width` `height` `sourceWidth` `sourceHeight` `orientation` `revision` `changedAtUs`

### 注入实现
`-[PBTouchInjector sendPositionX:y:touching:moved:canceled:error:]` @ `0x10000c97c`  
→ `IOHIDEventCreateDigitizer*` / `IOHIDEventSystemClientDispatchEvent`（私有 HID）

---

## C. LAN / P2P 视频二进制（`PHB1`）

打包助手 `0x100022680`（由 `drainEncodedFrames` 调用两次：帧 / 配置）：

```
WebSocket header: 0x82 + 标准 length（无 mask）   // 仅 LAN 出站
Payload:
  +0  u32 LE  magic = 0x31424850  → "PHB1"
  +4  u8      format = 1          // 解析方要求 == 1
  +5  u8      kind:
                0 = 非关键帧（P / non-IDR）
                1 = 关键帧（IDR）
                2 = configuration（SPS/PPS 等参数集）
  +6  u16     必须为 0（P2P 解析显式检查）
  +8  u64 BE  timestampUs
  +16 u32 BE  payload_len
  +20 bytes   payload
```

- **kind=0/1**：payload 为长度前缀 H264 NAL 流；P2P `consumePacket:` 校验 NAL type∈{1,5} 与 kind 一致性（IDR↔kind1）
- **kind=2**：payload 交给 `configuration:length:`；`drainEncodedFrames` 用 `mov w1,#2` 打包 `configuration` 数据
- 同格式亦被 `PBDirectCloudPublisher receiveVideo:` / `PBP2PMedia consumePacket:` 解析

约束：
- 单包 payload 上限约 `0x1ffffe2` 量级（pack 内 `0x1fffe2`）
- configuration 源数据上限 `0x10000`（64KiB，broadcast 侧）
- 输出队列：`queuedBytes`；`appendPacket` 见 `0x20000`（128KiB）相关阈值

---

## D. HTTP 本机 API（`consumeHTTP:` @ `0x10001684c`）

路由字符串已对齐反汇编引用：

| 方法/路径 | 说明 |
|-----------|------|
| `GET/POST /api/info` | 状态大字典（见下） |
| `/api/health` | 健康 |
| `/api/control/stop\|restart\|memory-guard` | 管控 |
| `/api/video-settings` | 视频参数 JSON |
| `/api/screenshot` | 截图 |
| `/api/license/identity\|proof\|renew` | 许可 |
| `/api/cloud-host/config` | 云主机 |
| 升级 `/control` `/video` | WS 握手（`sec-websocket-key`） |

`/api/info` 字段（组装用字面量）：  
`protocol=lan-phonebase`, `version=1.0`, `processSessionId`, `name`, `port`, `streaming`, `wallVideo`, `width/height`, `clients`, `captureBackend=direct`, `captureState`, `frames`, `controlAvailable`, `homeAvailable`, `textAvailable`, `keyboardAvailable`, `licenseRequired`, `licenseProtocol=phonebase-commercial-v1`, `cloudHost*`, `geometry`, `videoSettings`, `memory`, `recovery`, `performance`, `launchInfo`, `controlError`, …

头：`x-phonebase-session|license|control-session|control-policy`

---

## E. 云 / P2P 消息（补充）

`PBDirectCloudPublisher receiveControl:`：把本地控制包上云，字段 `control` / `sessionId` / `message`，指标名 `local-control-receive`。

`handleMediaMessage:` / `PBP2PMedia handleMessage:`：

| type | 字段要点 |
|------|----------|
| `p2p-open` | 建会话；失败 `P2P_OPEN_REJECTED` / `P2P_PHONE_SESSION_LIMIT` |
| `p2p-answer` | `sdp`；校验 `m=video` 等 |
| `p2p-ice` | `candidate`, `sdpMid`, `sdpMLineIndex` |
| `p2p-keyframe` | 要关键帧 |
| `p2p-lease` | `leaseHeader`, `nonce`, fingerprints, `tencent-relay`, `mediaTransport` |
| `p2p-close` / `p2p-state` | 关闭/状态 |
| `rental-authorization` | 租约鉴权 |

---

## F. 许可 proof（已钉死）

### 设备密钥（`-[PBCommercialLicense initWithError:]` @ `0x100022e48`）
- App Group：`group.cn.local.phonebase.direct`
- 文件：`commercial-device-key.der` + `commercial-device-key.lock`（`flock`）
- 算法：**RSA 2048**（`kSecAttrKeyTypeRSA` + `kSecAttrKeySizeInBits=0x800`）
- 生成：`SecKeyCreateRandomKey`；加载：`SecKeyCreateWithData`
- `deviceId` = **SHA256(公钥 external representation)** → 32 字节按 `"%02x"` 拼成 **64 位小写 hex**
- `publicKey` 属性 = 公钥 external rep 的 **Base64**（options=0）
- 错误域痕迹：`cn.local.phonebase.commercial`

### 证明（`proofForNonce:error:` @ `0x100023e58`）
- nonce：`NSString`，长度 **16..256**，字符集 **`[A-Za-z0-9_-]`**
- 签名：`SecKeyCreateSignature(key, kSecKeyAlgorithmRSASignatureMessagePKCS1v15SHA256, utf8(nonce), …)`
- 返回：签名的 Base64（options=0）
- 限流：约 **1 秒窗口内最多 0x1f (31) 次**；超限错误「设备证明请求过于频繁，请稍后重试」
- 其它错误文案：
  - 格式无效 →「设备授权挑战格式无效」
  - 签名失败 →「设备授权证明生成失败」
  - 初始化失败 →「无法初始化商业授权验证」

---

## G. 授权头格式（lease / grant / policy / p2p）

所有 `verify*Header*` 共用同一密码学形态（非标准 3 段 JWT，而是 **2 段**）：

```
base64url(JSON_payload) || "." || base64url(RSA_signature)
```

解析（`verifyLeaseHeader:permission:error:` @ `0x1000240ec`）：

1. 整串长度 &lt; `0x1d4d`（7501）
2. 按 `"."` 分割，**恰好 2 段**
3. base64url → 标准 base64：`-`↔`+`，`_`↔`/`，补 `=`
4. 段0（payload）解码后长度 ∈ (0, 0x1000]
5. 段1（signature）解码后长度 **必须 = 0x100（256）** → RSA-2048 签名
6. `SecKeyVerifySignature(key, kSecKeyAlgorithmRSASignatureMessagePKCS1v15SHA256, payload_bytes, signature)`
7. `NSJSONSerialization` 解析 payload，校验字段与 `exp`/`iat`、本机 `deviceId`/`version`/`buildId`

### 各 aud / 字段

| API | `iss` | `aud` | 关键 claims |
|-----|-------|-------|-------------|
| 设备授权 lease | `phonebase-commerce` | `phonebase-device` | `accountId, deviceId, deviceKeyFingerprint, sessionId, product, version, buildId, baseRelease, permissions[], iat, exp`；permission 含 `view`/`control` |
| 云托管 grant | `phonebase-commerce` | `phonebase-device-host-grant` | `grantId, accountId, deviceId, deviceKeyFingerprint, product, version, buildId, baseRelease, iat, exp` |
| 云控制策略 | `phonebase-commerce` | `phonebase-cloud-control-policy` | `hostSessionId, controlSessionId, actorSessionId, rentalLeaseId, accountId, ownerAccountId, actorRole(renter/owner), blockSettings, policyVersion, generation, permissions, …` |
| P2P media lease | `phonebase-commerce` | `phonebase-p2p-media` | `mediaSessionId, nonce, hostSessionId, phoneFingerprint, viewerFingerprint, renterSessionId, rentalLeaseId, mediaTransport, permissions:video, …` |
| P2P gather | `phonebase-commerce` | `phonebase-p2p-gather` | `permissions:gather`, `mediaTransport`/`tencent-relay`, session/lease ids |

本机构建期望（lease）：`product=base`, `version=1.0.10`, `buildId=base-1.0.10-20261022-1`（与 Info.plist / `PBRelease` 一致）。

验签密钥：来自 `PBCommercialLicense` 对象 `+0x10` 的 `SecKeyRef`（init 时由设备公钥 material `SecKeyCreateWithData` 写入；设备私钥在 `+0x08` 供 `proofForNonce`）。  
`phone-direct-root.cer` 在 `PBDirectCloudPublisher initWithLicense:…` 加载，SHA256 钉死  
`9152cd874424f046a43f421b8c5c47588489b23f7d98191e35d09ffccdee19b2`（与包内 cer thumbprint 一致），用于云侧证书信任；**Helper 内无引用 `license-root.cer` 字符串**。

---

## H. 采集 / 编码管线

```
PBCapture.start
  dlopen/resolve QuartzCore:
    CARenderServerRenderDisplay
    CARenderServerGetDirtyFrameCount
  prepareOrientation → FBSOrientationObserver (FrontBoardServices)
  preparePool → CVPixelBufferPool (IOSurface + Metal/CA compatible, sRGB)
  dispatch timer on main → sampleDisplay

PBCapture.sampleDisplay
  CVPixelBufferPoolCreatePixelBuffer…
  CARenderServerRenderDisplay(…"LCD"…)  // 显示名字面量 LCD
  IOSurface ← CVPixelBufferGetIOSurface
  CMSampleBufferCreateReadyWithImageBuffer
  onSampleBuffer callback

PBDirectController.receivedSample:generation:
  → PBVideoEncoder.consumeSampleBuffer:
       CIContext 方向矫正 (PBVideoOrientation)
       VTCompressionSessionEncodeFrame (H264 Baseline, RealTime, …)
  → handleOutput → configurationForFormat:nalLengthSize:
       CMVideoFormatDescriptionGetH264ParameterSetAtIndex (SPS/PPS)
  → onFrame → broadcastFrame / drainEncodedFrames
       PHB1 kind=1/0 帧；kind=2 configuration
```

错误域：`cn.local.phonebase.direct.capture` / `.encoder` / `.lan.encoder`。

---

## 证据文件

- `objc_classes.json` — 全部 PB* 方法 IMP  
- `key_method_refs.json` — ADRP 字符串/SEL 引用  
- `disasm_license_verify*.txt` / `disasm_capture_*.txt` / `disasm_encoder_*.txt`  
- `disasm_cert_load.txt` — `phone-direct-root.cer` 加载  
- `PROTOCOL_DEEP.md` — 本文件  
